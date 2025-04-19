import nano from "nano";
import type { DocumentScope, DocumentInsertResponse, DocumentGetResponse, MaybeDocument } from "nano";
import { logger } from "../utils/logger";

// Define the structure for permission documents
interface PermissionDocument extends MaybeDocument {
    _id?: string; // CouchDB ID (will be the userId)
    _rev?: string; // CouchDB revision
    userId: string; // Redundant? Keep for clarity or remove if _id is always userId
    allowedActions: string[]; // e.g., ["read:notes", "write:notes"]
    type: "permission"; // Document type for querying/indexing
}

// Define the structure for update responses (same as insert)
interface PermissionUpdateResponse extends DocumentInsertResponse {}

const PERMISSIONS_DB_NAME = "vibe_permissions";

export class PermissionService {
    private nanoInstance: nano.ServerScope;
    private db: DocumentScope<PermissionDocument>;

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
            this.db = this.nanoInstance.use<PermissionDocument>(PERMISSIONS_DB_NAME);
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
            await this.nanoInstance.db.get(PERMISSIONS_DB_NAME);
            logger.info(`Permissions database '${PERMISSIONS_DB_NAME}' already exists.`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                try {
                    await this.nanoInstance.db.create(PERMISSIONS_DB_NAME);
                    logger.info(`Permissions database '${PERMISSIONS_DB_NAME}' created successfully.`);
                    // Re-assign db scope after creation, just in case
                    this.db = this.nanoInstance.use<PermissionDocument>(PERMISSIONS_DB_NAME);
                } catch (createError) {
                    logger.error(`Error creating permissions database '${PERMISSIONS_DB_NAME}':`, createError);
                    throw createError;
                }
            } else {
                logger.error(`Error checking permissions database '${PERMISSIONS_DB_NAME}':`, error);
                throw error;
            }
        }
    }

    /**
     * Retrieves the allowed actions for a given user.
     * @param userId - The ID of the user whose permissions to retrieve.
     * @returns An array of allowed action strings. Returns empty array if user/permissions not found.
     */
    async getPermissions(userId: string): Promise<string[]> {
        try {
            // Use userId directly as the document ID (_id)
            const doc = await this.db.get(userId);
            return doc.allowedActions || [];
        } catch (error: any) {
            if (error.statusCode === 404) {
                // User has no specific permission document, return empty array (no permissions)
                return [];
            } else {
                logger.error(`Error retrieving permissions for userId '${userId}':`, error);
                // Decide on behavior: throw error or return empty array?
                // Returning empty array is safer (defaults to no access)
                return [];
                // throw error; // Or re-throw if caller should handle DB errors
            }
        }
    }

    /**
     * Sets (creates or updates) the permissions for a given user.
     * @param userId - The ID of the user whose permissions to set.
     * @param permissions - An array of allowed action strings.
     * @param rev - The current revision (_rev) if updating an existing document. Omit for creation.
     * @returns The CouchDB insert/update response.
     */
    async setPermissions(userId: string, permissions: string[], rev?: string): Promise<PermissionUpdateResponse> {
        try {
            const docToInsert: PermissionDocument = {
                _id: userId, // Use userId as the document ID
                userId: userId, // Store userId field too for potential queries/clarity
                allowedActions: permissions,
                type: "permission",
            };
            if (rev) {
                docToInsert._rev = rev; // Add revision if provided (for update)
            }

            // Use insert, which handles both create and update (if _id and _rev match)
            const response = await this.db.insert(docToInsert);
            logger.info(`Permissions set for userId '${userId}' (rev: ${response.rev})`);
            return response;
        } catch (error: any) {
            if (error.statusCode === 409) {
                logger.error(`Error setting permissions for userId '${userId}': Revision conflict (409).`);
                throw new Error(`Revision conflict setting permissions for user '${userId}'.`);
            } else {
                logger.error(`Error setting permissions for userId '${userId}':`, error);
                throw error; // Re-throw other errors
            }
        }
    }

    /**
     * Checks if a user has a specific required permission.
     * @param userId - The ID of the user to check.
     * @param requiredPermission - The permission string to check for (e.g., "write:items").
     * @returns True if the user has the permission, false otherwise.
     */
    async can(userId: string, requiredPermission: string): Promise<boolean> {
        if (!userId || !requiredPermission) {
            logger.warn(`Permission check called with invalid arguments: userId=${userId}, requiredPermission=${requiredPermission}`);
            return false;
        }
        try {
            const userPermissions = await this.getPermissions(userId);
            const hasPermission = userPermissions.includes(requiredPermission);
            logger.debug(`Permission check for userId '${userId}', required '${requiredPermission}': ${hasPermission ? "GRANTED" : "DENIED"}`);
            return hasPermission;
        } catch (error) {
            // Errors during getPermissions are logged there, default to false (no access)
            logger.error(`Error during permission check ('can') for userId '${userId}', required '${requiredPermission}':`, error);
            return false;
        }
    }

    /**
     * Deletes a user's permission document.
     * Primarily intended for testing/cleanup.
     * @param userId - The application-specific unique ID of the user whose permissions to delete.
     */
    async deletePermissions(userId: string): Promise<void> {
        logger.info(`Attempting to delete permissions for userId: ${userId}`);
        try {
            // Need to get the revision first
            const permDoc = await this.db.get(userId);
            await this.db.destroy(userId, permDoc._rev);
            logger.info(`Successfully deleted permission document for userId '${userId}' from '${PERMISSIONS_DB_NAME}'.`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(
                    `Permission document for userId '${userId}' not found in '${PERMISSIONS_DB_NAME}' during deletion (might already be deleted or never existed).`
                );
            } else {
                logger.error(`Error deleting permission document for userId '${userId}' from '${PERMISSIONS_DB_NAME}':`, error.message || error);
                // Decide if we should throw here or just log
            }
        }
    }
}

// Export a singleton instance
export const permissionService = new PermissionService();
