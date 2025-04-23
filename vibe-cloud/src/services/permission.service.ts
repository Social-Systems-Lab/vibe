// permission.service.ts
import { logger } from "../utils/logger";
import { PERMISSIONS_COLLECTION, type Permission, type PermissionUpdateResponse } from "../models/models";
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
            const doc = await this.dataService.getDocument<Permission>(SYSTEM_DB, userDid);
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
     */
    async getAppPermissionsForUser(userDid: string, appId: string): Promise<string[]> {
        if (!appId) return [];
        const doc = await this._getPermissionDoc(userDid);
        return doc?.appGrants?.[appId] || [];
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
            _id: userDid,
            userDid: userDid,
            collection: PERMISSIONS_COLLECTION,
            directPermissions: permissions, // Overwrite direct permissions
            appGrants: currentDoc?.appGrants || {}, // Preserve existing app grants
        };
        if (docRev) newDocState._rev = docRev;

        try {
            let response: PermissionUpdateResponse;
            if (docRev) {
                // Update existing document
                response = await this.dataService.updateDocument(SYSTEM_DB, PERMISSIONS_COLLECTION, userDid, docRev, newDocState);
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
     */
    async grantAppPermission(userDid: string, appId: string, permissionsToGrant: string[]): Promise<PermissionUpdateResponse> {
        if (!userDid || !appId || !permissionsToGrant || permissionsToGrant.length === 0) {
            throw new Error("userDid, appId, and permissionsToGrant are required.");
        }

        const currentDoc = await this._getPermissionDoc(userDid);
        const docRev = currentDoc?._rev;

        const currentGrants = currentDoc?.appGrants?.[appId] || [];
        // Use Set to merge and deduplicate permissions
        const newGrantSet = new Set([...currentGrants, ...permissionsToGrant]);
        const updatedAppGrants = {
            ...(currentDoc?.appGrants || {}),
            [appId]: Array.from(newGrantSet), // Update grants for this specific app
        };

        const newDocState: Permission = {
            ...(currentDoc || {}),
            _id: userDid,
            userDid: userDid,
            collection: PERMISSIONS_COLLECTION,
            appGrants: updatedAppGrants, // Set the updated grants map
            directPermissions: currentDoc?.directPermissions || [], // Preserve direct permissions
        };
        if (docRev) newDocState._rev = docRev;

        try {
            let response: PermissionUpdateResponse;
            if (docRev) {
                response = await this.dataService.updateDocument(SYSTEM_DB, PERMISSIONS_COLLECTION, userDid, docRev, newDocState);
            } else {
                response = await this.dataService.createDocument(SYSTEM_DB, PERMISSIONS_COLLECTION, newDocState);
            }
            logger.info(`Permissions granted for app '${appId}' for user '${userDid}' (new rev: ${response.rev})`);
            return response;
        } catch (error: any) {
            this._handleWriteError(error, `grant permissions to app '${appId}' for user '${userDid}'`);
        }
    }

    /**
     * Revokes specific permissions from an application for a user.
     */
    async revokeAppPermission(userDid: string, appId: string, permissionsToRemove: string[]): Promise<PermissionUpdateResponse> {
        if (!userDid || !appId || !permissionsToRemove || permissionsToRemove.length === 0) {
            throw new Error("userDid, appId, and permissionsToRemove are required.");
        }
        const currentDoc = await this._getPermissionDoc(userDid);
        if (!currentDoc) {
            logger.warn(`Cannot revoke permissions for app '${appId}' for user '${userDid}': User permission document not found.`);
            // Or throw? For now, just return as if successful (idempotent)
            return { ok: true, id: userDid, rev: "" }; // Mock response
        }
        const docRev = currentDoc._rev;

        const currentGrants = currentDoc.appGrants?.[appId] || [];
        if (currentGrants.length === 0) {
            logger.debug(`No permissions found for app '${appId}' for user '${userDid}'. Nothing to revoke.`);
            return { ok: true, id: userDid, rev: docRev }; // Return current state
        }

        // Filter out the permissions to remove
        const permissionsToRemoveSet = new Set(permissionsToRemove);
        const remainingGrants = currentGrants.filter((p) => !permissionsToRemoveSet.has(p));

        const updatedAppGrants = { ...currentDoc.appGrants };
        if (remainingGrants.length > 0) {
            updatedAppGrants[appId] = remainingGrants;
        } else {
            // If no permissions left for this app, remove the app entry entirely
            delete updatedAppGrants[appId];
        }

        const newDocState: Permission = {
            ...currentDoc, // Start with existing doc
            appGrants: updatedAppGrants, // Set the updated grants map
        };
        // _id, _rev, userDid, collection, directPermissions are already in currentDoc

        try {
            // Always an update here since currentDoc exists
            const response = await this.dataService.updateDocument(SYSTEM_DB, PERMISSIONS_COLLECTION, userDid, docRev, newDocState);
            logger.info(`Permissions revoked for app '${appId}' for user '${userDid}' (new rev: ${response.rev})`);
            return response;
        } catch (error: any) {
            this._handleWriteError(error, `revoke permissions from app '${appId}' for user '${userDid}'`);
        }
    }

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

        try {
            const response = await this.dataService.updateDocument(SYSTEM_DB, PERMISSIONS_COLLECTION, userDid, docRev, newDocState);
            logger.info(`All permissions revoked for app '${appId}' for user '${userDid}' (new rev: ${response.rev})`);
            return response;
        } catch (error: any) {
            this._handleWriteError(error, `revoke app '${appId}' for user '${userDid}'`);
        }
    }

    /**
     * Checks if an application has the required permission FOR a specific user.
     */
    async canAppActForUser(userDid: string, appId: string, requiredPermission: string): Promise<boolean> {
        if (!userDid || !appId || !requiredPermission) return false;
        try {
            const grantedPermissions = await this.getAppPermissionsForUser(userDid, appId);
            // TODO: Implement wildcard/scope matching logic if needed (e.g., "write:notes" implies "write:*")
            const hasPermission = grantedPermissions.includes(requiredPermission);
            logger.debug(
                `App Permission check for user '${userDid}', app '${appId}', required '${requiredPermission}': ${hasPermission ? "GRANTED" : "DENIED"}`
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
            await this.dataService.deleteDocument(SYSTEM_DB, userDid, permDoc._rev);
            logger.info(`Successfully deleted permission document for userDid '${userDid}'.`);
        } catch (error: any) {
            // Catch specific errors from dataService if needed (e.g., conflict)
            logger.error(`Error deleting permission document for userDid '${userDid}':`, error.message || error);
            throw new InternalServerError(`Failed to delete permissions for user '${userDid}'.`);
        }
    }

    /** Centralized error handling for write operations */
    private _handleWriteError(error: any, context: string): never {
        if (error.message?.includes("Conflict")) {
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
