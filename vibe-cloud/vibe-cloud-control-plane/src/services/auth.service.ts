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
// Removed BlobService type import
import * as jose from "jose";
import { randomUUIDv7 } from "bun";
import { getUserDbName, ed25519FromDid } from "../utils/identity.utils"; // Added ed25519FromDid
import { verify } from "@noble/ed25519"; // Added for signature verification
import { Buffer } from "buffer"; // Added for signature decoding

export class AuthService {
    private dataService: DataService;
    private permissionService: PermissionService;
    // Removed blobService property

    constructor(dataService: DataService, permissionService: PermissionService /* Removed blobService */) {
        // Removed blobService from constructor parameters
        this.dataService = dataService;
        this.permissionService = permissionService;
        // Removed blobService assignment
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

        // 4. Removed blob deletion logic
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
            // tier: 0, // Admins could also have tiers, or this could be optional
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

        // 2. Create the user-specific database (for the control plane's system user records)
        // This is NOT for the user's actual Vibe instance data, which will be in its own CouchDB.
        try {
            const userSystemDbName = getUserDbName(userDid); // This refers to a DB in the *control plane's* CouchDB
            await this.dataService.ensureDatabaseExists(userSystemDbName);
            logger.info(`User system data database created for admin (from DID): ${userSystemDbName}`);
        } catch (error: any) {
            logger.error(`Failed to create system database for admin user ${userDid}:`, error);
            throw new InternalServerError(`Failed to create system database for admin user ${userDid}.`);
        }

        // 3. TODO: Grant default app grants if necessary?
        logger.info(`Admin user ${userDid} created. Direct permission setting is skipped (handled by isAdmin flag).`);

        // 4. Return the created user object
        const createdUser: User = {
            _id: createResponse.id,
            _rev: createResponse.rev,
            userDid: userDid,
            isAdmin: true,
            collection: USERS_COLLECTION,
            // tier: newUser.tier,
        };
        return createdUser;
    }

    /**
     * Creates a new tier 0 user for instance provisioning.
     * This user is not an admin.
     * @param userDid - The user's did:vibe identifier.
     * @param instanceIdentifier - The unique identifier for the instance being provisioned for this user.
     * @returns The newly created user document.
     * @throws Error if user creation fails.
     */
    async provisionNewUser(userDid: string, instanceIdentifier: string, profileName?: string, profilePictureUrl?: string): Promise<User> {
        const userDocId = `${USERS_COLLECTION}/${userDid}`;

        const newUser: User = {
            userDid: userDid,
            isAdmin: false,
            tier: 0, // Default tier for new users
            instanceId: instanceIdentifier, // Link user to their instance
            profileName: profileName, // Store profile name
            profilePictureUrl: profilePictureUrl, // Store profile picture URL
            collection: USERS_COLLECTION,
        };

        let createResponse: any;
        try {
            // Check if user already exists
            try {
                const existingUser = await dataService.getDocument<User>(SYSTEM_DB, userDocId);
                if (existingUser) {
                    logger.warn(
                        `User ${userDid} already exists. Instance ID: ${existingUser.instanceId}. Provisioning request for new instance: ${instanceIdentifier}.`
                    );
                    // Decide on behavior: update existing user, error out, or allow multiple instances (current model is one instanceId per user doc)
                    // For now, let's assume we update if instanceId is different, or just return existing if same.
                    // This logic might need refinement based on product decisions (e.g. one instance per DID).
                    if (existingUser.instanceId === instanceIdentifier) {
                        return existingUser;
                    }
                    // If instanceId is different, this implies a re-provision or new instance for an existing DID.
                    // This needs careful consideration. For now, let's throw an error if user exists but requests a new instance.
                    throw new Error(
                        `User ${userDid} already exists with instance ${existingUser.instanceId}. Cannot provision new instance ${instanceIdentifier} via this flow yet.`
                    );
                }
            } catch (error: any) {
                if (!(error instanceof NotFoundError)) {
                    throw error; // Rethrow unexpected errors
                }
                // User not found, proceed to create
            }

            createResponse = await dataService.createDocument(SYSTEM_DB, USERS_COLLECTION, {
                _id: userDocId,
                ...newUser,
            });

            if (!createResponse.ok) {
                throw new Error(`Failed to save user document for ${userDid}.`);
            }
            logger.info(`User ${userDid} created successfully for instance ${instanceIdentifier}.`);
        } catch (error: any) {
            if ((error as any).statusCode === 409) {
                // Type assertion for statusCode
                logger.error(`User creation failed: Document conflict for ID ${userDocId} (DID: ${userDid})`, error);
                throw new Error(`User ${userDid} already exists or a conflict occurred.`);
            }
            logger.error(`Error saving user document for ${userDid}:`, error);
            throw error;
        }

        // Note: We are NOT creating a user-specific database (like getUserDbName(userDid)) here in the control plane's CouchDB
        // for the user's actual application data. That data will reside in the dedicated CouchDB instance
        // deployed by Helm for their specific Vibe instance. This AuthService only manages the user record
        // in the central SYSTEM_DB.

        const createdUser: User = {
            _id: createResponse.id,
            _rev: createResponse.rev,
            ...newUser,
        };
        return createdUser;
    }

    /**
     * Verifies a signature made by a DID for a given challenge (nonce and timestamp).
     * @param did - The DID of the signer.
     * @param nonce - The client-generated nonce.
     * @param timestamp - The client-generated timestamp (ISO format).
     * @param signatureB64 - The base64 encoded signature of (nonce + timestamp).
     * @returns True if the signature is valid, false otherwise.
     */
    async verifyDidSignature(did: string, nonce: string, timestamp: string, signatureB64: string): Promise<boolean> {
        try {
            // Message format: DID, nonce, and timestamp, concatenated with a delimiter (e.g., '|')
            // This ensures the signature is bound to the DID, nonce, and timestamp.
            const messageToVerify = `${did}|${nonce}|${timestamp}`;
            const messageBytes = new TextEncoder().encode(messageToVerify);

            const publicKeyBytes = ed25519FromDid(did);
            const signatureBytes = Buffer.from(signatureB64, "base64");

            const isValid = await verify(signatureBytes, messageBytes, publicKeyBytes);
            if (!isValid) {
                logger.warn(`Signature verification failed for DID ${did}, nonce ${nonce}.`);
                return false;
            }
            logger.debug(`Signature verified successfully for DID ${did}, nonce ${nonce}.`);
            return true;
        } catch (error: any) {
            logger.error(`Error during signature verification for DID ${did}:`, error);
            return false;
        }
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
     * Updates the profile information for a given user.
     * @param userDid - The DID of the user to update.
     * @param profileName - The new profile name (optional).
     * @param profilePictureUrl - The new profile picture URL (optional).
     * @returns The updated user document.
     * @throws NotFoundError if the user is not found.
     * @throws InternalServerError if the update fails.
     */
    async updateUserProfile(userDid: string, profileName?: string, profilePictureUrl?: string): Promise<User> {
        const userDocId = `${USERS_COLLECTION}/${userDid}`;
        logger.info(`Attempting to update profile for user: ${userDid}`);

        try {
            const userDoc = await this.dataService.getDocument<User>(SYSTEM_DB, userDocId);
            if (!userDoc) {
                logger.warn(`User document '${userDocId}' not found during profile update.`);
                throw new NotFoundError(`User ${userDid} not found.`);
            }

            // Update only provided fields
            let updated = false;
            if (profileName !== undefined) {
                userDoc.profileName = profileName;
                updated = true;
            }
            if (profilePictureUrl !== undefined) {
                userDoc.profilePictureUrl = profilePictureUrl;
                updated = true;
            }

            if (!updated) {
                logger.info(`No profile fields to update for user ${userDid}. Returning existing document.`);
                return userDoc;
            }

            // Ensure _rev is present
            if (!userDoc._rev) {
                logger.error(`User document ${userDocId} is missing _rev. Cannot update.`);
                throw new InternalServerError(`User document for ${userDid} is missing revision information.`);
            }

            const updateResponse = await this.dataService.updateDocument(SYSTEM_DB, USERS_COLLECTION, userDocId, userDoc._rev, userDoc);
            if (!updateResponse.ok) {
                logger.error(`Failed to update profile for user ${userDid}. Response: ${JSON.stringify(updateResponse)}`);
                throw new InternalServerError(`Failed to update profile for user ${userDid}.`);
            }

            logger.info(`Successfully updated profile for user ${userDid}. New rev: ${updateResponse.rev}`);
            return { ...userDoc, _rev: updateResponse.rev }; // Return the document with the new revision
        } catch (error: any) {
            if (error instanceof NotFoundError || error instanceof InternalServerError) {
                throw error; // Re-throw known errors
            }
            logger.error(`Unexpected error updating profile for user ${userDid}:`, error.message || error);
            throw new InternalServerError(`An unexpected error occurred while updating profile for user ${userDid}.`);
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
