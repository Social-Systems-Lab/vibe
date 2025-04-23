// auth.service.ts
import { DataService, dataService } from "./data.service";
import { logger } from "../utils/logger";
import { SYSTEM_DB } from "../utils/constants";
import { CLAIM_CODES_COLLECTION, USERS_COLLECTION, type ClaimCode, type User } from "../models/models";
import { InternalServerError, NotFoundError } from "elysia";
import type { PermissionService } from "./permission.service";
import * as jose from "jose";
import { randomUUIDv7 } from "bun";
import { getUserDbName } from "../utils/did.utils";

export class AuthService {
    private dataService: DataService;
    private permissionService: PermissionService;

    constructor(dataService: DataService, permissionService: PermissionService) {
        this.dataService = dataService;
        this.permissionService = permissionService;
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

        // 3. Delete the user's permission document
        try {
            await this.permissionService.deletePermissionsDoc(userDid);
            logger.info(`Attempted deletion of permission document for userDid '${userDid}'.`);
        } catch (error: any) {
            logger.error(`Error during permission document deletion for userDid '${userDid}':`, error.message || error);
        }

        // 4. TODO: Blob Cleanup (Requires querying BlobMetadata and calling blobService.deleteObject)
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
            logger.error(`Error saving admin user document from DID ${userDid}:`, error);
            throw new Error(`Admin user creation failed for DID: ${userDid}.`);
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

        // 3. Grant default direct permissions to the new admin user
        const defaultAdminPermissions = [
            "read:*", // Read anything (including other users' data if needed, system data)
            "write:*", // Write anything (including system data)
            "manage:permissions", // Ability to grant/revoke permissions
            "manage:users", // Ability to manage users (if such endpoints exist)
            "read:$blobs", // Explicit read access to shared blobs
            "write:$blobs", // Explicit write access to shared blobs
        ];
        try {
            await this.permissionService.setUserDirectPermissions(userDid, defaultAdminPermissions);
            logger.info(`Default admin direct permissions granted to user ${userDid}.`);
        } catch (error: any) {
            logger.error(`Failed to set default direct permissions for admin user ${userDid}:`, error);
            // Critical failure. User exists, DB exists, but permissions failed.
            // Manual intervention likely required. Log and throw.
            throw new InternalServerError(`Failed to set default permissions for admin user ${userDid}.`);
        }

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
     * Creates a user directly for testing purposes and generates a JWT.
     * WARNING: Use only in test environments. Does not involve standard auth flows.
     * @param userDid - Optional: Specify a DID. If not provided, a test DID is generated.
     * @param directPermissions - Optional: Grant initial direct permissions.
     * @param isAdmin - Optional: Create the user as an admin. Defaults to false.
     * @param jwtExpiresIn - Optional: JWT expiry time (e.g., '1h', '10m'). Defaults to '1h'.
     * @returns { userDid: string, token: string, userRev: string, permsRev: string | null }
     */
    async createTestUserAndToken(
        userDid?: string,
        directPermissions: string[] = [],
        isAdmin: boolean = false,
        jwtExpiresIn: string = "1h"
    ): Promise<{ userDid: string; token: string; userRev: string; permsRev: string | null }> {
        logger.warn(`Executing createTestUserAndToken helper. Use only in testing!`);

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
            throw new Error("JWT_SECRET environment variable not configured.");
        }
        const secretKey = new TextEncoder().encode(jwtSecret);
        const jwtAlgorithm = "HS256";

        const testUserDid = userDid || `did:vibe:test:${randomUUIDv7()}`;
        const userDocId = testUserDid; // Use DID directly as User doc ID

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

        // 4. Grant Direct Permissions (if any)
        let permsRev: string | null = null;
        if (directPermissions.length > 0) {
            try {
                logger.debug(`[Test Helper] Setting direct permissions for ${testUserDid}: [${directPermissions.join(", ")}]`);
                const permRes = await this.permissionService.setUserDirectPermissions(testUserDid, directPermissions);
                permsRev = permRes.rev;
                logger.info(`[Test Helper] Direct permissions set for ${testUserDid}, rev: ${permsRev}`);
            } catch (error: any) {
                logger.error(`[Test Helper] Failed to set direct permissions for test user ${testUserDid}:`, error);
                // Attempt cleanup before failing
                await this.deleteUser(testUserDid).catch((e) => logger.error("Cleanup failed:", e)); // deleteUser handles DB and user doc
                throw new InternalServerError(`[Test Helper] Failed to set direct permissions for test user ${testUserDid}.`);
            }
        }

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

        // 6. Return results
        return { userDid: testUserDid, token, userRev, permsRev };
    }
}
