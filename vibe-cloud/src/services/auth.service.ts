// auth.service.ts
import nano from "nano"; // Added import
import { DataService, dataService } from "./data.service";
import { logger } from "../utils/logger";
import { SYSTEM_DB, USER_DB_PREFIX } from "../utils/constants";
import { CLAIM_CODES_COLLECTION, USERS_COLLECTION, type ClaimCode, type User } from "../models/models";
import { NotFoundError } from "elysia";

export class AuthService {
    private dataService: DataService;

    constructor(dataService: DataService) {
        this.dataService = dataService;
        logger.info("AuthService initialized.");
    }

    /**
     * Deletes a user and their associated data database.
     * Primarily intended for testing/cleanup. Use with caution in production.
     * @param userDid - The application-specific unique ID of the user to delete.
     */
    async deleteUser(userDid: string): Promise<void> {
        logger.info(`Attempting to delete user and data for userDid: ${userDid}`);

        const userDocId = `${USERS_COLLECTION}/${userDid}`;
        const userDbName = `${USER_DB_PREFIX}${userDid}`;

        // 1. Delete the user document from SYSTEM_DB
        try {
            // Check if the user exists in the database
            const userDoc = await this.dataService.getDocument<User>(SYSTEM_DB, userDocId);
            if (!userDoc) {
                logger.warn(`User document '${userDid}' not found in '${SYSTEM_DB}' during deletion (might already be deleted).`);
                return;
            }
            await this.dataService.deleteDocument(SYSTEM_DB, userDocId, userDoc._rev!);
            logger.info(`Successfully deleted user document '${userDocId}' from '${SYSTEM_DB}'.`);
        } catch (error: any) {
            if (error instanceof NotFoundError) {
                logger.warn(`User document '${userDocId}' not found in '${SYSTEM_DB}' during deletion.`);
            } else {
                logger.error(`Error deleting user document '${userDocId}' from '${SYSTEM_DB}':`, error.message || error);
            }
        }

        // 2. Delete the user's data database
        try {
            // Use dataService's connection to destroy DB
            await this.dataService.getConnection().db.destroy(userDbName);
            logger.info(`Successfully deleted user data database '${userDbName}'.`);
        } catch (error: any) {
            if (error.statusCode === 404 || error.message?.includes("not_found")) {
                logger.warn(`User data database '${userDbName}' not found during deletion.`);
            } else {
                logger.error(`Error deleting user data database '${userDbName}':`, error.message || error);
                // Optional: throw error if DB deletion failure is critical
            }
        }

        // 3. TODO: Blob Cleanup (Requires querying BlobMetadata and calling blobService.deleteObject)
        //logger.warn(`Blob cleanup for user ${userDid} is not yet implemented.`);
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
                    // Use dataService to create the document
                    await dataService.createDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, newClaimCodeDoc);
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

        // 1. Save user to database
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
}
