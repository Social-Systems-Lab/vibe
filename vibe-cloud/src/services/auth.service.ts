// auth.service.ts
import nano from "nano"; // Added import
import type { DocumentListResponse } from "nano"; // Added type import
import { dataService } from "./data.service";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid"; // Using uuid for user IDs
import { SYSTEM_DB, USER_DB_PREFIX } from "../utils/constants";
import { CLAIM_CODES_COLLECTION, USERS_COLLECTION, type ClaimCode, type User } from "../models/models";

export class AuthService {
    private nanoInstance: nano.ServerScope; // Store nano instance

    constructor() {
        // Initialize nano instance for the service
        const couchdbUrl = process.env.COUCHDB_URL;
        const couchdbUser = process.env.COUCHDB_USER;
        const couchdbPassword = process.env.COUCHDB_PASSWORD;

        if (!couchdbUrl || !couchdbUser || !couchdbPassword) {
            logger.error("CRITICAL: CouchDB environment variables (COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD) are not set for AuthService.");
            throw new Error("CouchDB environment variables not configured for AuthService.");
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
        } catch (error) {
            logger.error("Failed to initialize Nano instance in AuthService:", error);
            throw new Error("Failed to initialize Nano instance in AuthService.");
        }

        // Ensure the system database exists when the service is instantiated
        this.ensureSystemDbExists().catch((err) => {
            logger.error("Failed to ensure system DB exists on AuthService startup:", err);
            // process.exit(1); // Optional: exit if DB setup fails critically
        });
    }

    private async ensureSystemDbExists(): Promise<void> {
        try {
            await this.nanoInstance.db.get(SYSTEM_DB);
        } catch (error: any) {
            if (error.statusCode === 404) {
                await this.nanoInstance.db.create(SYSTEM_DB);
                logger.info(`Database '${SYSTEM_DB}' created by AuthService.`);
            } else {
                logger.error(`Error checking database '${SYSTEM_DB}' in AuthService:`, error);
                throw error;
            }
        }
    }

    /**
     * Deletes a user and their associated data database.
     * Primarily intended for testing/cleanup. Use with caution in production.
     * @param userDid - The application-specific unique ID of the user to delete.
     */
    async deleteUser(userDid: string): Promise<void> {
        logger.info(`Attempting to delete user with userDid: ${userDid}`);
        const userDocId = `${USERS_COLLECTION}/${userDid}`;
        const userDbName = `${USER_DB_PREFIX}${userDid}`;

        // 1. Delete the user document from SYSTEM_DB
        try {
            const usersDb = this.nanoInstance.use<User>(SYSTEM_DB);
            // Need to get the revision first
            const userDoc = await usersDb.get(userDocId);
            await usersDb.destroy(userDocId, userDoc._rev);
            logger.info(`Successfully deleted user document '${userDocId}' from '${SYSTEM_DB}'.`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`User document '${userDocId}' not found in '${SYSTEM_DB}' during deletion (might already be deleted).`);
            } else {
                // Log other errors but proceed to try deleting the data DB
                logger.error(`Error deleting user document '${userDocId}' from '${SYSTEM_DB}':`, error.message || error);
            }
        }

        // 2. Delete the user's data database
        try {
            await this.nanoInstance.db.destroy(userDbName);
            logger.info(`Successfully deleted user data database '${userDbName}'.`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`User data database '${userDbName}' not found during deletion (might already be deleted).`);
            } else {
                logger.error(`Error deleting user data database '${userDbName}':`, error.message || error);
            }
        }

        // TODO: Implement blob cleanup on user deletion if required.
        // This currently ONLY deletes the user document and their userdata database.
        // Associated blobs in Minio and metadata in blob_metadata are NOT deleted.
        // Implementing this would require querying blob_metadata by ownerId and deleting associated resources.
    }

    /**
     * Ensures the initial admin claim code document exists in the claim_codes database.
     * Reads the code from the ADMIN_CLAIM_CODE environment variable.
     */
    async ensureInitialAdminClaimCode(): Promise<void> {
        const adminClaimCode = process.env.ADMIN_CLAIM_CODE;
        if (!adminClaimCode) {
            logger.warn("ADMIN_CLAIM_CODE environment variable is not set. Cannot ensure initial admin claim code.");
            return;
        }

        const initialAdminDocId = "INITIAL_ADMIN";

        try {
            // Check if the document already exists using dataService
            await dataService.getDocument(SYSTEM_DB, initialAdminDocId);
            logger.info(`Initial admin claim code document '${initialAdminDocId}' already exists.`);
        } catch (error: any) {
            if (error.message?.includes("not found") || error.statusCode === 404) {
                // Document doesn't exist, create it
                logger.info(`Initial admin claim code document '${initialAdminDocId}' not found. Creating...`);
                const newClaimCodeDoc: Omit<ClaimCode, "_rev"> = {
                    _id: initialAdminDocId,
                    code: adminClaimCode,
                    expiresAt: null, // Never expires
                    forDid: null, // Not locked to a specific DID
                    spentAt: null, // Not spent yet
                    collection: CLAIM_CODES_COLLECTION,
                };
                try {
                    // Use dataService to create the document (collection name "" for dedicated DB)
                    await dataService.createDocument(SYSTEM_DB, "", newClaimCodeDoc); // TODO FIX use specific collection
                    logger.info(`Successfully created initial admin claim code document '${initialAdminDocId}'.`);
                } catch (createError: any) {
                    logger.error(`Failed to create initial admin claim code document '${initialAdminDocId}':`, createError);
                    // Rethrow or handle as appropriate for application startup
                    throw new Error(`Failed to create initial admin claim code: ${createError.message}`);
                }
            } else {
                // Different error occurred during the check
                logger.error(`Error checking for initial admin claim code document '${initialAdminDocId}':`, error);
                throw new Error(`Error checking initial admin claim code: ${error.message}`);
            }
        }
    }

    /**
     * Creates a new admin user directly from a DID.
     * This is used by the claim code flow.
     * @param userDid - The user's did:vibe identifier.
     * @returns The newly created user document (excluding sensitive fields).
     * @throws Error if user creation fails (e.g., conflict).
     */
    async createAdminUserFromDid(userDid: string): Promise<User> {
        const userDocId = `${USERS_COLLECTION}/${userDid}`;

        // Prepare user document - No email/password needed for DID-based auth
        const newUser: User = {
            userDid: userDid,
            isAdmin: true,
            collection: USERS_COLLECTION,
        };

        // 1. Save user to vibe_users database
        try {
            const createResponse = await dataService.createDocument(SYSTEM_DB, USERS_COLLECTION, {
                _id: userDocId,
                ...newUser,
            });

            if (!createResponse.ok) {
                throw new Error("Failed to save admin user document from DID.");
            }

            logger.info(`Admin user created successfully from DID: ${userDid}, userDid: ${userDid}`);

            // 2. Create the user-specific database
            const userDbName = `${USER_DB_PREFIX}${userDid}`;
            await dataService.ensureDatabaseExists(userDbName);
            logger.info(`User data database created for admin (from DID): ${userDbName}`);

            // Ensure the returned object matches the User type structure
            return {
                ...newUser,
                _id: createResponse.id,
                _rev: createResponse.rev,
                isAdmin: true, // Explicitly return isAdmin
            };
        } catch (error: any) {
            if (error.statusCode === 409) {
                logger.error(`Admin creation from DID failed: Document conflict for ID ${userDocId} (DID: ${userDid})`, error);
                throw new Error(`Admin user creation failed due to document ID conflict.`);
            }
            logger.error(`Error saving admin user document from DID ${userDid}:`, error);
            throw new Error(`Admin user creation failed for DID: ${userDid}.`);
        }
    }

    /**
     * Finds the first user document with isAdmin set to true. (REMOVED - Use claim codes now)
     */
    // async findAdminUser(): Promise<(UserDocument & { _id: string; _rev: string }) | null> { ... } // Method removed
}

// Export a singleton instance
export const authService = new AuthService();
