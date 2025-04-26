// permission.service.ts
import { logger } from "../utils/logger";
import { BLOBS_COLLECTION, PERMISSIONS_COLLECTION, type Permission, type PermissionUpdateResponse, type PermissionSetting } from "../models/models"; // Added PermissionSetting
import { SYSTEM_DB } from "../utils/constants";
import type { DataService } from "./data.service";
import { InternalServerError, NotFoundError } from "elysia";

export class PermissionService {
    private dataService: DataService;

    constructor(dataService: DataService) {
        this.dataService = dataService;
        logger.info("PermissionService initialized.");
    }

    /**
     * Fetches the entire permission document for a user.
     * Handles NotFoundError by returning null.
     */
    private async _getPermissionDoc(userDid: string): Promise<(Permission & { _id: string; _rev: string }) | null> {
        if (!userDid) return null;
        try {
            // User's permission doc _id is their userDid
            const doc = await this.dataService.getDocument<Permission>(SYSTEM_DB, `${PERMISSIONS_COLLECTION}/${userDid}`);
            // Ensure _id and _rev are present, although getDocument should guarantee this if found
            if (!doc._id || !doc._rev) {
                logger.error(`Permission document for ${userDid} fetched but missing _id or _rev.`);
                return null; // Treat as not found if invalid
            }
            return doc as Permission & { _id: string; _rev: string };
        } catch (error) {
            if (error instanceof NotFoundError) {
                logger.debug(`No permission document found for userDid '${userDid}'.`);
                return null; // Return null signifies document doesn't exist
            }
            // Log other errors but return null to prevent cascading failures in checks
            logger.error(`Error fetching permission document for userDid '${userDid}':`, error);
            return null;
        }
    }

    /**
     * Retrieves the direct permissions granted to a user.
     */
    async getUserDirectPermissions(userDid: string): Promise<string[]> {
        const doc = await this._getPermissionDoc(userDid);
        return doc?.directPermissions || [];
    }

    /**
     * Retrieves the permissions granted by a user to a specific application.
     * NOTE: This returns the permission *strings* granted, not the setting (always/ask/never).
     * The structure in models.ts (AppGrantSchema) needs adjustment if we store settings.
     */
    async getAppPermissionsForUser(userDid: string, appId: string): Promise<string[]> {
        if (!appId) return [];
        const doc = await this._getPermissionDoc(userDid);
        // TODO: Adjust this if AppGrantSchema stores settings map instead of string array
        const grants = doc?.appGrants?.[appId];
        if (Array.isArray(grants)) {
            return grants; // Assuming it's still string[] based on original code
        } else if (typeof grants === "object" && grants !== null) {
            // If it's an object { perm: setting }, return the keys (permissions)
            return Object.keys(grants);
        }
        return [];
    }

    /**
     * Retrieves the permission setting (always/ask/never) for a specific app and permission string.
     */
    async getAppPermissionSetting(userDid: string, appId: string, permission: string): Promise<string | null> {
        if (!userDid || !appId || !permission) return null;
        const doc = await this._getPermissionDoc(userDid);
        // Assumes appGrants stores { [appId]: { [permission]: setting } }
        return doc?.appGrants?.[appId]?.[permission] || null;
    }

    /**
     * Sets the direct permissions for a user, overwriting any existing direct permissions.
     */
    async setUserDirectPermissions(userDid: string, permissions: string[]): Promise<PermissionUpdateResponse> {
        if (!userDid) throw new Error("userDid is required.");

        const currentDoc = await this._getPermissionDoc(userDid);
        const docRev = currentDoc?._rev;

        const newDocState: Permission = {
            ...(currentDoc || {}), // Start with existing doc or empty object
            _id: `${PERMISSIONS_COLLECTION}/${userDid}`,
            userDid: userDid,
            collection: PERMISSIONS_COLLECTION,
            directPermissions: permissions, // Overwrite direct permissions
            appGrants: currentDoc?.appGrants || {}, // Preserve existing app grants
        };
        // Ensure _id is set even for new docs before potential update call
        if (!newDocState._id) newDocState._id = `${PERMISSIONS_COLLECTION}/${userDid}`;
        if (docRev) newDocState._rev = docRev;

        try {
            let response: PermissionUpdateResponse;
            if (docRev) {
                // Update existing document
                response = await this.dataService.updateDocument(
                    SYSTEM_DB,
                    PERMISSIONS_COLLECTION, // Collection name needed for update
                    newDocState._id, // Use the full doc ID
                    docRev,
                    newDocState
                );
            } else {
                // Create new document
                response = await this.dataService.createDocument(SYSTEM_DB, PERMISSIONS_COLLECTION, newDocState);
            }
            logger.info(`Direct permissions set for userDid '${userDid}' (new rev: ${response.rev})`);
            return response;
        } catch (error: any) {
            this._handleWriteError(error, `set direct permissions for user '${userDid}'`);
        }
    }

    /**
     * Grants specific permissions to an application for a user. Adds to existing grants.
     * DEPRECATED in favor of setAppGrants which handles settings (always/ask/never).
     */
    // async grantAppPermission(userDid: string, appId: string, permissionsToGrant: string[]): Promise<PermissionUpdateResponse> {
    // ... (original logic assuming string[] grants) ...
    // }

    /**
     * Sets the entire grant map (permission -> setting) for a specific app and user.
     * Overwrites any existing grants for that app.
     */
    // Correct the type of the 'grants' parameter
    async setAppGrants(userDid: string, appId: string, grants: Record<string, PermissionSetting>): Promise<PermissionUpdateResponse> {
        if (!userDid || !appId || !grants) {
            throw new Error("userDid, appId, and grants object are required.");
        }

        const currentDoc = await this._getPermissionDoc(userDid);
        const docRev = currentDoc?._rev;

        // Get current app grants map or initialize if it doesn't exist
        // Ensure the type matches AppGrantSchema
        const currentAppGrantsMap: Record<string, Record<string, PermissionSetting>> = currentDoc?.appGrants || {};

        // Update the grants for the specific app
        const updatedAppGrantsMap: Record<string, Record<string, PermissionSetting>> = {
            ...currentAppGrantsMap,
            [appId]: grants, // Assign the new grants map for this appId
        };

        // Construct the new state ensuring type safety
        const newDocState: Permission = {
            // Use spread carefully, ensure required fields are present
            _id: currentDoc?._id || `${PERMISSIONS_COLLECTION}/${userDid}`,
            _rev: docRev, // Will be undefined if currentDoc is null
            userDid: userDid,
            collection: PERMISSIONS_COLLECTION,
            appGrants: updatedAppGrantsMap,
            directPermissions: currentDoc?.directPermissions || [],
        };
        // Remove _rev if it's undefined (for create operation)
        if (!newDocState._rev) {
            delete newDocState._rev;
        }

        // Ensure _id is always set
        if (!newDocState._id) {
            newDocState._id = `${PERMISSIONS_COLLECTION}/${userDid}`;
        }

        // Ensure collection is always set
        newDocState.collection = PERMISSIONS_COLLECTION;

        // Ensure _id is set even for new docs before potential update call - Redundant check removed
        if (!newDocState._id) newDocState._id = `${PERMISSIONS_COLLECTION}/${userDid}`;
        if (docRev) newDocState._rev = docRev;

        try {
            let response: PermissionUpdateResponse;
            if (docRev) {
                response = await this.dataService.updateDocument(
                    SYSTEM_DB,
                    PERMISSIONS_COLLECTION, // Collection name needed for update
                    newDocState._id, // Use the full doc ID
                    docRev,
                    newDocState
                );
            } else {
                response = await this.dataService.createDocument(SYSTEM_DB, PERMISSIONS_COLLECTION, newDocState);
            }
            logger.info(`Grants set for app '${appId}' for user '${userDid}' (new rev: ${response.rev})`);
            return response;
        } catch (error: any) {
            this._handleWriteError(error, `set grants for app '${appId}' for user '${userDid}'`);
        }
    }

    /**
     * Revokes specific permissions from an application for a user.
     * DEPRECATED in favor of setAppGrants.
     */
    // async revokeAppPermission(userDid: string, appId: string, permissionsToRemove: string[]): Promise<PermissionUpdateResponse> {
    // ... (original logic assuming string[] grants) ...
    // }

    /**
     * Revokes all permissions for a specific application for a user.
     */
    async revokeApp(userDid: string, appId: string): Promise<PermissionUpdateResponse> {
        if (!userDid || !appId) throw new Error("userDid and appId are required.");

        const currentDoc = await this._getPermissionDoc(userDid);
        if (!currentDoc || !currentDoc.appGrants || !currentDoc.appGrants[appId]) {
            logger.warn(`Cannot revoke app '${appId}' for user '${userDid}': App grant not found.`);
            return { ok: true, id: userDid, rev: currentDoc?._rev || "" }; // Idempotent
        }
        const docRev = currentDoc._rev;

        const updatedAppGrants = { ...currentDoc.appGrants };
        delete updatedAppGrants[appId]; // Remove the app entry

        const newDocState: Permission = { ...currentDoc, appGrants: updatedAppGrants };
        // _id, _rev, userDid, collection, directPermissions are already in currentDoc

        try {
            const response = await this.dataService.updateDocument(
                SYSTEM_DB,
                PERMISSIONS_COLLECTION, // Collection name needed for update
                newDocState._id!, // Use the full doc ID (non-null asserted as currentDoc exists)
                docRev,
                newDocState
            );
            logger.info(`All permissions revoked for app '${appId}' for user '${userDid}' (new rev: ${response.rev})`);
            return response;
        } catch (error: any) {
            this._handleWriteError(error, `revoke app '${appId}' for user '${userDid}'`);
        }
    }

    /**
     * Checks if an application has the required permission FOR a specific user,
     * considering the grant setting (always/ask/never).
     */
    async canAppActForUser(userDid: string, appId: string, requiredPermission: string): Promise<boolean> {
        if (!userDid || !appId || !requiredPermission) return false;
        try {
            const setting = await this.getAppPermissionSetting(userDid, appId, requiredPermission);
            // Treat 'ask' as denied for backend checks, agent handles prompt
            const hasPermission = setting === "always";
            logger.debug(
                `App Permission check for user '${userDid}', app '${appId}', required '${requiredPermission}': Setting='${setting}', Result=${
                    hasPermission ? "GRANTED" : "DENIED"
                }`
            );
            return hasPermission;
        } catch (error) {
            logger.error(
                `Error during app permission check ('canAppActForUser') for user '${userDid}', app '${appId}', required '${requiredPermission}':`,
                error
            );
            return false; // Default deny on error
        }
    }

    /**
     * Checks if a user has a specific direct permission.
     */
    async userHasDirectPermission(userDid: string, requiredPermission: string): Promise<boolean> {
        if (!userDid || !requiredPermission) return false;
        try {
            const directPermissions = await this.getUserDirectPermissions(userDid);
            // TODO: Implement wildcard/scope matching logic if needed
            const hasPermission = directPermissions.includes(requiredPermission);
            logger.debug(`Direct Permission check for user '${userDid}', required '${requiredPermission}': ${hasPermission ? "GRANTED" : "DENIED"}`);
            return hasPermission;
        } catch (error) {
            logger.error(`Error during direct permission check ('userHasDirectPermission') for user '${userDid}', required '${requiredPermission}':`, error);
            return false; // Default deny on error
        }
    }

    /**
     * Deletes a user's entire permission document (including all app grants and direct permissions).
     */
    async deletePermissionsDoc(userDid: string): Promise<void> {
        if (!userDid) {
            logger.warn("deletePermissionsDoc called without userDid.");
            return;
        }
        logger.info(`Attempting to delete permissions document for userDid: ${userDid}`);
        try {
            const permDoc = await this._getPermissionDoc(userDid);
            if (!permDoc) {
                logger.warn(`Permission document for userDid '${userDid}' not found during deletion.`);
                return; // Nothing to delete
            }
            await this.dataService.deleteDocument(SYSTEM_DB, permDoc._id, permDoc._rev); // Use full _id from fetched doc
            logger.info(`Successfully deleted permission document for userDid '${userDid}'.`);
        } catch (error: any) {
            // Catch specific errors from dataService if needed (e.g., conflict)
            logger.error(`Error deleting permission document for userDid '${userDid}':`, error.message || error);
            throw new InternalServerError(`Failed to delete permissions for user '${userDid}'.`);
        }
    }

    /** Centralized error handling for write operations */
    private _handleWriteError(error: any, context: string): never {
        if (error.message?.includes("Conflict") || error.statusCode === 409) {
            // Check status code too
            logger.warn(`Conflict (409) during ${context}.`);
            // Throw a standard error message for the API handler
            throw new Error(`Conflict during permission update (${context}). Please retry with latest revision.`);
        } else {
            logger.error(`Error during ${context}:`, error);
            // Rethrow or wrap in InternalServerError
            throw new InternalServerError(`Failed to ${context}.`);
        }
    }
}
