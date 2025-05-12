// auth.service.ts
import { DataService, dataService } from "./data.service";
import { logger } from "../utils/logger";
import { SYSTEM_DB } from "../utils/constants";
import {
    APPS_COLLECTION,
    BLOBS_COLLECTION,
    CLAIM_CODES_COLLECTION,
    USERS_COLLECTION,
    type App as AppModel,
    type BlobMetadata,
    type ClaimCode,
    type User,
} from "../models/models"; // Added APPS_COLLECTION, BLOBS_COLLECTION, AppModel, BlobMetadata
import { InternalServerError, NotFoundError } from "elysia";
import type { PermissionService } from "./permission.service";
import type { BlobService } from "./blob.service"; // Import BlobService type
import * as jose from "jose";
import { randomUUIDv7 } from "bun";
import { getUserDbName } from "../utils/identity.utils";

export class AuthService {
    private dataService: DataService;
    private permissionService: PermissionService;
    private blobService: BlobService; // Add blobService

    constructor(dataService: DataService, permissionService: PermissionService, blobService: BlobService) {
        // Add blobService to constructor
        this.dataService = dataService;
        this.permissionService = permissionService;
        this.blobService = blobService; // Store blobService
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
        const userDbName = getUserDbName(userDid);

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

        // 3. Delete user's app registrations
        try {
            logger.debug(`Finding app registrations for user ${userDid} in ${SYSTEM_DB}...`);
            const appQuery = { selector: { collection: APPS_COLLECTION, userDid: userDid } };
            const appRegs = await this.dataService.findDocuments<AppModel>(SYSTEM_DB, appQuery);

            if (appRegs.docs && appRegs.docs.length > 0) {
                logger.info(`Found ${appRegs.docs.length} app registrations for user ${userDid}. Deleting...`);
                const bulkDeletePayload = appRegs.docs.map((doc) => ({
                    _id: doc._id!,
                    _rev: doc._rev!,
                    _deleted: true,
                }));
                // Use db.bulk for efficient deletion
                const db = await this.dataService.ensureDatabaseExists(SYSTEM_DB);
                const bulkResult = await db.bulk({ docs: bulkDeletePayload });

                const errors = bulkResult.filter((item) => !!item.error);
                if (errors.length > 0) {
                    logger.error(`Errors encountered during bulk deletion of app registrations for user ${userDid}:`, errors);
                } else {
                    logger.info(`Successfully deleted ${bulkDeletePayload.length} app registrations for user ${userDid}.`);
                }
            } else {
                logger.info(`No app registrations found for user ${userDid}.`);
            }
        } catch (error: any) {
            logger.error(`Error deleting app registrations for user ${userDid}:`, error.message || error);
        }

        // 4. Delete user's blobs (metadata and storage objects)
        try {
            logger.debug(`Finding blobs owned by user ${userDid} in ${SYSTEM_DB}...`);
            const blobQuery = { selector: { collection: BLOBS_COLLECTION, ownerDid: userDid } };
            const blobMetaDocs = await this.dataService.findDocuments<BlobMetadata>(SYSTEM_DB, blobQuery);

            if (blobMetaDocs.docs && blobMetaDocs.docs.length > 0) {
                logger.info(`Found ${blobMetaDocs.docs.length} blobs owned by user ${userDid}. Deleting objects and metadata...`);

                const metaToDelete: any[] = [];
                for (const meta of blobMetaDocs.docs) {
                    if (!meta._id || !meta._rev) continue; // Skip invalid docs

                    // Extract objectId (part after collection/)
                    const objectId = meta._id.split("/")[1];
                    if (!objectId) {
                        logger.warn(`Could not extract objectId from blob metadata _id: ${meta._id}`);
                        continue;
                    }

                    // Delete object from storage
                    try {
                        logger.debug(`Deleting blob object '${objectId}' from bucket '${meta.bucket}'...`);
                        await this.blobService.deleteObject(objectId, meta.bucket);
                        logger.debug(`Blob object '${objectId}' deleted successfully.`);
                        // Only mark metadata for deletion if object deletion succeeded
                        metaToDelete.push({ _id: meta._id, _rev: meta._rev, _deleted: true });
                    } catch (objDeleteError: any) {
                        logger.error(
                            `Error deleting blob object '${objectId}' from storage (bucket: ${meta.bucket}) for user ${userDid}:`,
                            objDeleteError.message || objDeleteError
                        );
                        // Decide if we should still delete metadata? Probably not.
                    }
                }

                // Bulk delete metadata documents whose objects were successfully deleted
                if (metaToDelete.length > 0) {
                    logger.info(`Bulk deleting ${metaToDelete.length} blob metadata documents...`);
                    const db = await this.dataService.ensureDatabaseExists(SYSTEM_DB);
                    const bulkMetaResult = await db.bulk({ docs: metaToDelete });
                    const metaErrors = bulkMetaResult.filter((item) => !!item.error);
                    if (metaErrors.length > 0) {
                        logger.error(`Errors encountered during bulk deletion of blob metadata for user ${userDid}:`, metaErrors);
                    } else {
                        logger.info(`Successfully deleted ${metaToDelete.length} blob metadata documents for user ${userDid}.`);
                    }
                }
            } else {
                logger.info(`No blobs found owned by user ${userDid}.`);
            }
        } catch (error: any) {
            logger.error(`Error during blob cleanup for user ${userDid}:`, error.message || error);
        }
        logger.info(`User deletion process completed for userDid: ${userDid}`);
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

        const initialAdminDocId = "claimCodes/INITIAL_ADMIN";

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

        let createResponse: any;

        // 1. Save user to database
        try {
            createResponse = await dataService.createDocument(SYSTEM_DB, USERS_COLLECTION, {
                _id: userDocId,
                ...newUser,
            });

            if (!createResponse.ok) {
                throw new Error("Failed to save admin user document from DID.");
            }
            logger.info(`Admin user created successfully from DID: ${userDid}, userDid: ${userDid}`);
        } catch (error: any) {
            if (error.statusCode === 409) {
                logger.error(`Admin creation from DID failed: Document conflict for ID ${userDocId} (DID: ${userDid})`, error);
                throw new Error(`Admin user creation failed due to document ID conflict.`);
            }
            // Re-throw the original error for better debugging upstream
            logger.error(`Error saving admin user document from DID ${userDid}:`, error);
            throw error; // Re-throw original error
        }

        // 2. Create the user-specific database
        try {
            const userDbName = getUserDbName(userDid);
            await this.dataService.ensureDatabaseExists(userDbName);
            logger.info(`User data database created for admin (from DID): ${userDbName}`);
        } catch (error: any) {
            logger.error(`Failed to create database for admin user ${userDid}:`, error);
            // This is problematic. User doc exists, but DB doesn't. Should we compensate?
            // For now, log critical error and throw. Manual cleanup might be needed.
            // Consider deleting the user document created in step 1?
            throw new InternalServerError(`Failed to create database for admin user ${userDid}.`);
        }

        // 3. TODO: Grant default app grants if necessary?
        // The concept of 'direct permissions' managed by PermissionService is removed.
        // Admin status is handled by the 'isAdmin' flag on the User document.
        // If specific default app grants are needed, they would be created as 'apps/{userDid}/{appId}' documents.
        logger.info(`Admin user ${userDid} created. Direct permission setting is skipped (handled by isAdmin flag).`);

        // 4. Return the created user object
        const createdUser: User = {
            _id: createResponse.id,
            _rev: createResponse.rev,
            userDid: userDid,
            isAdmin: true,
            collection: USERS_COLLECTION,
        };
        return createdUser;
    }

    /**
     * Checks if a user has the admin flag set in their user document.
     * @param userDid - The DID of the user to check.
     * @returns True if the user exists and has isAdmin set to true, false otherwise.
     */
    async isAdmin(userDid: string): Promise<boolean> {
        const userDocId = `${USERS_COLLECTION}/${userDid}`;
        try {
            const userDoc = await this.dataService.getDocument<User>(SYSTEM_DB, userDocId);
            // Check if the document exists and the isAdmin flag is explicitly true
            return !!userDoc && userDoc.isAdmin === true;
        } catch (error: any) {
            if (error instanceof NotFoundError) {
                // User document doesn't exist, so they are not an admin
                logger.debug(`isAdmin check: User document ${userDocId} not found.`);
                return false;
            } else {
                // Log other errors but treat as non-admin for safety
                logger.error(`isAdmin check: Error fetching user document ${userDocId}:`, error);
                return false;
            }
        }
    }

    /**
     * Creates a user directly for testing purposes and generates a JWT.
     * WARNING: Use only in test environments. Does not involve standard auth flows.
     * @param userDid - Optional: Specify a DID. If not provided, a test DID is generated.
     * @param isAdmin - Optional: Create the user as an admin. Defaults to false.
     * @param jwtExpiresIn - Optional: JWT expiry time (e.g., '1h', '10m'). Defaults to '1h'.
     * @returns { userDid: string, token: string, userRev: string }
     */
    async createTestUserAndToken(
        userDid?: string,
        isAdmin: boolean = false,
        jwtExpiresIn: string = "1h"
    ): Promise<{ userDid: string; token: string; userRev: string }> {
        // Removed permsRev from return type
        logger.warn(`Executing createTestUserAndToken helper. Use only in testing!`);

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
            throw new Error("JWT_SECRET environment variable not configured.");
        }
        const secretKey = new TextEncoder().encode(jwtSecret);
        const jwtAlgorithm = "HS256";

        const testUserDid = userDid || `did:vibe:test:${randomUUIDv7()}`;
        const userDocId = `${USERS_COLLECTION}/${testUserDid}`; // Use DID directly as User doc ID
        // TODO we need to sanitize user doc ID perhaps? Remove comment if test goes through

        // 1. Prepare User Document
        const newUserDocData: Omit<User, "_id" | "_rev"> = {
            userDid: testUserDid,
            isAdmin: isAdmin,
            collection: USERS_COLLECTION,
        };

        let userCreateResponse: any;
        let userRev: string;

        // 2. Create User Document
        try {
            logger.debug(`[Test Helper] Creating user document: ${userDocId}`);
            userCreateResponse = await this.dataService.createDocument(SYSTEM_DB, USERS_COLLECTION, { _id: userDocId, ...newUserDocData });
            if (!userCreateResponse.ok || !userCreateResponse.rev) {
                throw new Error("Failed to save test user document.");
            }
            userRev = userCreateResponse.rev;
            logger.info(`[Test Helper] User document created for ${testUserDid}, rev: ${userRev}`);
        } catch (error: any) {
            logger.error(`[Test Helper] Error creating user document for ${testUserDid}:`, error);
            if (error.message?.includes("conflict")) {
                throw new Error(`[Test Helper] User document conflict for ${testUserDid}. Cannot create test user.`);
            }
            throw new InternalServerError(`[Test Helper] User document creation failed for ${testUserDid}.`);
        }

        // 3. Create User Database
        try {
            const userDbName = getUserDbName(testUserDid);
            logger.debug(`[Test Helper] Ensuring database exists: ${userDbName}`);
            await this.dataService.ensureDatabaseExists(userDbName);
            logger.info(`[Test Helper] User database ensured for ${testUserDid}`);
        } catch (error: any) {
            logger.error(`[Test Helper] Failed to create database for test user ${testUserDid}:`, error);
            // Attempt to clean up the created user document before failing
            await this.dataService.deleteDocument(SYSTEM_DB, userDocId, userRev).catch((e) => logger.error("Cleanup failed:", e));
            throw new InternalServerError(`[Test Helper] Failed to create database for test user ${testUserDid}.`);
        }

        // 4. Grant Direct Permissions - This section is removed as direct permissions are no longer handled this way.
        // The 'permsRev' variable is no longer relevant.

        // 5. Generate JWT
        let token: string;
        try {
            logger.debug(`[Test Helper] Generating JWT for ${testUserDid} (expires: ${jwtExpiresIn})`);
            const jwtPayload: jose.JWTPayload = { userDid: testUserDid };
            token = await new jose.SignJWT(jwtPayload)
                .setProtectedHeader({ alg: jwtAlgorithm })
                // .setIssuedAt()
                // .setIssuer('urn:example:issuer') // Optional
                // .setAudience('urn:example:audience') // Optional
                // .setExpirationTime(jwtExpiresIn)
                .sign(secretKey);
            logger.info(`[Test Helper] JWT generated for ${testUserDid}`);
        } catch (error: any) {
            logger.error(`[Test Helper] Failed to generate JWT for test user ${testUserDid}:`, error);
            // Attempt cleanup before failing
            await this.deleteUser(testUserDid).catch((e) => logger.error("Cleanup failed:", e));
            throw new InternalServerError(`[Test Helper] Failed to generate JWT for test user ${testUserDid}.`);
        }

        // 6. Return results (without permsRev)
        return { userDid: testUserDid, token, userRev };
    }
}
