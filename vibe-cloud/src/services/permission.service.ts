import nano from "nano";
import type { DocumentScope, DocumentInsertResponse, DocumentGetResponse, MaybeDocument } from "nano";
import { logger } from "../utils/logger";
import { PERMISSIONS_COLLECTION, type Permission, type PermissionUpdateResponse } from "../models/models";
import { SYSTEM_DB } from "../utils/constants";

export class PermissionService {
    private nanoInstance: nano.ServerScope;
    private db: DocumentScope<Permission>;

    constructor() {
        const couchdbUrl = process.env.COUCHDB_URL;
        const couchdbUser = process.env.COUCHDB_USER;
        const couchdbPassword = process.env.COUCHDB_PASSWORD;

        if (!couchdbUrl || !couchdbUser || !couchdbPassword) {
            logger.error("CRITICAL: CouchDB environment variables (COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD) are not set for PermissionService.");
            throw new Error("CouchDB environment variables not configured for PermissionService.");
        }

        try {
            this.nanoInstance = nano({
                url: couchdbUrl,
                requestDefaults: {
                    auth: {
                        username: couchdbUser,
                        password: couchdbPassword,
                    },
                },
            });
            // Initialize db scope immediately, assuming ensureDbExists handles creation
            this.db = this.nanoInstance.use<Permission>(SYSTEM_DB);
        } catch (error) {
            logger.error("Failed to initialize Nano instance in PermissionService:", error);
            throw new Error("Failed to initialize Nano instance in PermissionService.");
        }

        // Ensure the permissions database exists when the service is instantiated
        this.ensurePermissionsDbExists().catch((err) => {
            logger.error("Failed to ensure permissions DB exists on PermissionService startup:", err);
            // Consider if this should be fatal
            // process.exit(1);
        });
    }

    /**
     * Ensures the permissions CouchDB database exists. Creates it if it doesn't.
     */
    private async ensurePermissionsDbExists(): Promise<void> {
        try {
            await this.nanoInstance.db.get(SYSTEM_DB);
            logger.info(`Permissions database '${SYSTEM_DB}' already exists.`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                try {
                    await this.nanoInstance.db.create(SYSTEM_DB);
                    logger.info(`Permissions database '${SYSTEM_DB}' created successfully.`);
                    // Re-assign db scope after creation, just in case
                    this.db = this.nanoInstance.use<Permission>(SYSTEM_DB);
                } catch (createError) {
                    logger.error(`Error creating permissions database '${SYSTEM_DB}':`, createError);
                    throw createError;
                }
            } else {
                logger.error(`Error checking permissions database '${SYSTEM_DB}':`, error);
                throw error;
            }
        }
    }

    /**
     * Retrieves the allowed actions for a given user.
     * @param userDid - The ID of the user whose permissions to retrieve.
     * @returns An array of allowed action strings. Returns empty array if user/permissions not found.
     */
    async getPermissions(userDid: string): Promise<string[]> {
        try {
            // Use userDid directly as the document ID (_id)
            const doc = await this.db.get(userDid);
            return doc.allowedActions || [];
        } catch (error: any) {
            if (error.statusCode === 404) {
                // User has no specific permission document, return empty array (no permissions)
                return [];
            } else {
                logger.error(`Error retrieving permissions for userDid '${userDid}':`, error);
                // Decide on behavior: throw error or return empty array?
                // Returning empty array is safer (defaults to no access)
                return [];
                // throw error; // Or re-throw if caller should handle DB errors
            }
        }
    }

    /**
     * Sets (creates or updates) the permissions for a given user.
     * @param userDid - The ID of the user whose permissions to set.
     * @param permissions - An array of allowed action strings.
     * @param rev - The current revision (_rev) if updating an existing document. Omit for creation.
     * @returns The CouchDB insert/update response.
     */
    async setPermissions(userDid: string, permissions: string[], rev?: string): Promise<PermissionUpdateResponse> {
        try {
            const docToInsert: Permission = {
                _id: userDid,
                userDid: userDid,
                allowedActions: permissions,
                collection: PERMISSIONS_COLLECTION,
            };
            if (rev) {
                docToInsert._rev = rev; // Add revision if provided (for update)
            }

            // Use insert, which handles both create and update (if _id and _rev match)
            const response = await this.db.insert(docToInsert);
            logger.info(`Permissions set for userDid '${userDid}' (rev: ${response.rev})`);
            return response;
        } catch (error: any) {
            if (error.statusCode === 409) {
                logger.error(`Error setting permissions for userDid '${userDid}': Revision conflict (409).`);
                throw new Error(`Revision conflict setting permissions for user '${userDid}'.`);
            } else {
                logger.error(`Error setting permissions for userDid '${userDid}':`, error);
                throw error; // Re-throw other errors
            }
        }
    }

    /**
     * Checks if a user has a specific required permission.
     * @param userDid - The ID of the user to check.
     * @param requiredPermission - The permission string to check for (e.g., "write:items").
     * @returns True if the user has the permission, false otherwise.
     */
    async can(userDid: string, requiredPermission: string): Promise<boolean> {
        if (!userDid || !requiredPermission) {
            logger.warn(`Permission check called with invalid arguments: userDid=${userDid}, requiredPermission=${requiredPermission}`);
            return false;
        }
        try {
            const userPermissions = await this.getPermissions(userDid);
            const hasPermission = userPermissions.includes(requiredPermission);
            logger.debug(`Permission check for userDid '${userDid}', required '${requiredPermission}': ${hasPermission ? "GRANTED" : "DENIED"}`);
            return hasPermission;
        } catch (error) {
            // Errors during getPermissions are logged there, default to false (no access)
            logger.error(`Error during permission check ('can') for userDid '${userDid}', required '${requiredPermission}':`, error);
            return false;
        }
    }

    /**
     * Deletes a user's permission document.
     * Primarily intended for testing/cleanup.
     * @param userDid - The application-specific unique ID of the user whose permissions to delete.
     */
    async deletePermissions(userDid: string): Promise<void> {
        logger.info(`Attempting to delete permissions for userDid: ${userDid}`);
        try {
            // Need to get the revision first
            const permDoc = await this.db.get(userDid);
            await this.db.destroy(userDid, permDoc._rev);
            logger.info(`Successfully deleted permission document for userDid '${userDid}' from '${SYSTEM_DB}'.`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(
                    `Permission document for userDid '${userDid}' not found in '${SYSTEM_DB}' during deletion (might already be deleted or never existed).`
                );
            } else {
                logger.error(`Error deleting permission document for userDid '${userDid}' from '${SYSTEM_DB}':`, error.message || error);
                // Decide if we should throw here or just log
            }
        }
    }
}

// Export a singleton instance
export const permissionService = new PermissionService();
