// auth.service.ts
import { DataService } from "./data.service";
import { logger } from "../utils/logger";
import { SYSTEM_DB, USERS_COLLECTION, CLAIM_CODES_COLLECTION, REFRESH_TOKENS_COLLECTION } from "../utils/constants"; // Added REFRESH_TOKENS_COLLECTION
import {
    UnauthorizedError,
    type ClaimCode,
    type Identity,
    type StoredRefreshToken,
    type TokenResponse, // For return type
    // IdentitySchema, // Already imported if used, else add
} from "../models/models";
import { InternalServerError, NotFoundError } from "elysia";
import type { PermissionService } from "./permission.service";
import * as jose from "jose";
import { randomUUIDv7 } from "bun";
import { getUserDbName, ed25519FromDid } from "../utils/identity.utils";
import { verify } from "@noble/ed25519";
import { Buffer } from "buffer";
import crypto from "crypto"; // For hashing refresh tokens

const ACCESS_TOKEN_EXPIRY_SECONDS = parseInt(process.env.ACCESS_TOKEN_EXPIRY_SECONDS || "900"); // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || "30");

export class AuthService {
    private dataService: DataService;
    private permissionService: PermissionService;
    private jwtSecretKey: Uint8Array;

    constructor(dataService: DataService, permissionService: PermissionService) {
        this.dataService = dataService;
        this.permissionService = permissionService;
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            logger.error("JWT_SECRET environment variable is not set. AuthService cannot operate securely.");
            throw new Error("JWT_SECRET is not configured.");
        }
        this.jwtSecretKey = new TextEncoder().encode(secret);
        logger.info("AuthService initialized.");
    }

    private async generateAccessToken(identityDid: string, isAdmin: boolean): Promise<{ token: string; expiresAt: number }> {
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + ACCESS_TOKEN_EXPIRY_SECONDS;
        const token = await new jose.SignJWT({ identityDid, isAdmin, type: "access" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt(now)
            .setExpirationTime(expiresAt) // Using direct timestamp
            .setSubject(identityDid)
            .setIssuer(process.env.JWT_ISSUER || "vibe-cloud-control-plane")
            // .setAudience(process.env.JWT_AUDIENCE || "vibe-api") // Consider audience
            .sign(this.jwtSecretKey);
        return { token, expiresAt };
    }

    private generateRefreshTokenString(): string {
        return crypto.randomBytes(40).toString("hex");
    }

    private hashRefreshToken(token: string): string {
        return crypto.createHash("sha256").update(token).digest("hex");
    }

    private async storeRefreshToken(
        did: string,
        refreshToken: string,
        userAgent?: string,
        ipAddress?: string
    ): Promise<{ refreshToken: string; expiresAt: number }> {
        const tokenHash = this.hashRefreshToken(refreshToken);
        const now = Date.now();
        const expiresAt = now + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // Milliseconds

        const storedToken: Omit<StoredRefreshToken, "_id" | "_rev"> = {
            did,
            tokenHash,
            expiresAt: Math.floor(expiresAt / 1000), // Store as UNIX timestamp (seconds)
            createdAt: Math.floor(now / 1000),
            revoked: false,
            userAgent,
            ipAddress,
            collection: REFRESH_TOKENS_COLLECTION,
        };
        // Ensure REFRESH_TOKENS_COLLECTION exists
        await this.dataService.ensureDatabaseExists(SYSTEM_DB); // SYSTEM_DB should exist
        // await this.dataService.ensureCollectionExists(SYSTEM_DB, REFRESH_TOKENS_COLLECTION); // If using specific collections

        const docId = `${REFRESH_TOKENS_COLLECTION}/${randomUUIDv7()}`; // Unique ID for each refresh token
        await this.dataService.createDocument(SYSTEM_DB, REFRESH_TOKENS_COLLECTION, { _id: docId, ...storedToken });

        return { refreshToken, expiresAt: storedToken.expiresAt };
    }

    private async generateAndStoreTokens(identity: Identity, userAgent?: string, ipAddress?: string): Promise<TokenResponse> {
        const { token: accessToken, expiresAt: accessTokenExpiresAt } = await this.generateAccessToken(identity.identityDid, identity.isAdmin);
        const plainRefreshToken = this.generateRefreshTokenString();
        const { refreshToken, expiresAt: refreshTokenExpiresAt } = await this.storeRefreshToken(identity.identityDid, plainRefreshToken, userAgent, ipAddress);

        return {
            accessToken,
            accessTokenExpiresIn: accessTokenExpiresAt, // This is absolute timestamp
            refreshToken,
            refreshTokenExpiresAt, // This is absolute timestamp
            tokenType: "Bearer",
        };
    }

    /**
     * Deletes an identity and their associated data, including refresh tokens.
     * @param identityDid - The DID of the identity to delete.
     */
    async deleteIdentity(identityDid: string): Promise<void> {
        logger.info(`Attempting to delete identity and data for identityDid: ${identityDid}`);
        const identityDocId = `${USERS_COLLECTION}/${identityDid}`;
        const identitySystemDbName = getUserDbName(identityDid);

        // 1. Delete identity document
        try {
            const identityDoc = await this.dataService.getDocument<Identity>(SYSTEM_DB, identityDocId);
            if (identityDoc?._rev) {
                await this.dataService.deleteDocument(SYSTEM_DB, identityDocId, identityDoc._rev);
                logger.info(`Successfully deleted identity document '${identityDocId}'.`);
            } else {
                logger.warn(`Identity document '${identityDid}' not found or no _rev in '${SYSTEM_DB}'.`);
            }
        } catch (error) {
            if (error instanceof NotFoundError) logger.warn(`Identity document '${identityDocId}' not found.`);
            else logger.error(`Error deleting identity document '${identityDocId}':`, error);
        }

        // 2. Delete identity's system data database
        try {
            await this.dataService.getConnection().db.destroy(identitySystemDbName);
            logger.info(`Successfully deleted identity system data database '${identitySystemDbName}'.`);
        } catch (error: any) {
            if (error.statusCode === 404 || error.message?.includes("not_found"))
                logger.warn(`Identity system data database '${identitySystemDbName}' not found.`);
            else logger.error(`Error deleting identity system data database '${identitySystemDbName}':`, error);
        }

        // 3. Delete refresh tokens for the identity
        try {
            const query = { selector: { collection: REFRESH_TOKENS_COLLECTION, did: identityDid } };
            const refreshTokens = await this.dataService.findDocuments<StoredRefreshToken>(SYSTEM_DB, query);
            if (refreshTokens.docs && refreshTokens.docs.length > 0) {
                const bulkDeletePayload = refreshTokens.docs.map((doc) => ({ _id: doc._id!, _rev: doc._rev!, _deleted: true }));
                const db = await this.dataService.ensureDatabaseExists(SYSTEM_DB); // Should already exist
                await db.bulk({ docs: bulkDeletePayload });
                logger.info(`Successfully deleted ${bulkDeletePayload.length} refresh tokens for identity ${identityDid}.`);
            }
        } catch (error) {
            logger.error(`Error deleting refresh tokens for identity ${identityDid}:`, error);
        }
        logger.info(`Identity data cleanup process completed for ${identityDid}.`);
    }

    async ensureInitialAdminClaimCode(): Promise<void> {
        const adminClaimCode = process.env.ADMIN_CLAIM_CODE;
        if (!adminClaimCode) {
            logger.warn("ADMIN_CLAIM_CODE environment variable is not set. Cannot ensure initial admin claim code.");
            return;
        }
        const initialAdminDocId = `${CLAIM_CODES_COLLECTION}/INITIAL_ADMIN`; // Ensure prefix
        try {
            await this.dataService.getDocument(SYSTEM_DB, initialAdminDocId);
            logger.info(`Initial admin claim code document '${initialAdminDocId}' already exists.`);
        } catch (error: any) {
            if (error instanceof NotFoundError) {
                logger.info(`Initial admin claim code document '${initialAdminDocId}' not found. Creating...`);
                const newClaimCodeDoc: Omit<ClaimCode, "_rev"> = {
                    _id: initialAdminDocId, // Ensure _id is correctly prefixed
                    code: adminClaimCode,
                    expiresAt: null,
                    forDid: null,
                    spentAt: null,
                    collection: CLAIM_CODES_COLLECTION,
                };
                try {
                    // Assuming newClaimCodeDoc._id is already "claimCodes/INITIAL_ADMIN"
                    // And createDocument(db, collection, docWithFullId) is the pattern
                    await this.dataService.createDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, newClaimCodeDoc);
                    logger.info(`Successfully created initial admin claim code document '${initialAdminDocId}'.`);
                } catch (createError: any) {
                    logger.error(`Failed to create initial admin claim code document '${initialAdminDocId}':`, createError);
                    throw new Error(`Failed to create initial admin claim code: ${createError.message}`);
                }
            } else {
                logger.error(`Error checking for initial admin claim code document '${initialAdminDocId}':`, error);
                throw new Error(`Error checking initial admin claim code: ${error.message}`);
            }
        }
    }

    /**
     * Registers a new identity. If a valid claim code is provided, the identity can be promoted to admin.
     * This method prepares the Identity document. Instance provisioning is triggered separately.
     * @param identityDid The DID of the identity.
     * @param instanceId The unique ID for the instance that will be provisioned.
     * @param profileName Optional profile name.
     * @param profilePictureUrl Optional profile picture URL.
     * @param claimCodeValue Optional claim code for admin promotion.
     * @param provisioningRequestDetails Optional details from the original request for audit/idempotency.
     * @param userAgent Optional user agent string from the client.
     * @param ipAddress Optional IP address from the client.
     * @returns The created/updated Identity document and token details.
     */
    async registerIdentity(
        identityDid: string,
        instanceId: string,
        profileName?: string,
        profilePictureUrl?: string,
        claimCodeValue?: string,
        provisioningRequestDetails?: { nonce: string; timestamp: string },
        userAgent?: string,
        ipAddress?: string
    ): Promise<{ identity: Identity; tokenDetails: TokenResponse }> {
        const identityDocId = `${USERS_COLLECTION}/${identityDid}`;
        let isPromotedToAdmin = false;

        if (claimCodeValue) {
            const initialAdminCode = process.env.ADMIN_CLAIM_CODE;
            if (initialAdminCode && claimCodeValue === initialAdminCode) {
                isPromotedToAdmin = true;
                logger.info(`Identity ${identityDid} will be promoted to admin via initial claim code.`);
            } else {
                logger.warn(`Claim code '${claimCodeValue}' provided by ${identityDid} did not match. Not promoting.`);
            }
        }

        let identityRecord: Identity;
        let existingIdentity: Identity | null = null;
        try {
            existingIdentity = await this.dataService.getDocument<Identity>(SYSTEM_DB, identityDocId);
        } catch (error: any) {
            if (!(error instanceof NotFoundError)) throw error;
        }

        const now = new Date().toISOString();

        if (existingIdentity) {
            logger.info(`Identity ${identityDid} already exists. Updating profile and instance details.`);
            existingIdentity.profileName = profileName ?? existingIdentity.profileName;
            existingIdentity.profilePictureUrl = profilePictureUrl ?? existingIdentity.profilePictureUrl;
            if (isPromotedToAdmin) existingIdentity.isAdmin = true; // Promote if applicable

            if (existingIdentity.instanceId !== instanceId) {
                logger.warn(`Identity ${identityDid} getting new instanceId ${instanceId} (old: ${existingIdentity.instanceId}).`);
            }
            existingIdentity.instanceId = instanceId;
            existingIdentity.instanceStatus = "pending";
            existingIdentity.instanceUrl = undefined;
            existingIdentity.instanceErrorDetails = undefined;
            existingIdentity.instanceCreatedAt = now; // Reset creation time for new instance logic
            existingIdentity.instanceUpdatedAt = now;
            existingIdentity.provisioningRequestDetails = provisioningRequestDetails;

            const updateResponse = await this.dataService.updateDocument(SYSTEM_DB, USERS_COLLECTION, identityDocId, existingIdentity._rev!, existingIdentity);
            identityRecord = { ...existingIdentity, _rev: updateResponse.rev };
        } else {
            const newIdentityData: Omit<Identity, "_id" | "_rev"> = {
                identityDid,
                isAdmin: isPromotedToAdmin,
                profileName,
                profilePictureUrl,
                instanceId,
                instanceStatus: "pending",
                instanceCreatedAt: now,
                instanceUpdatedAt: now,
                provisioningRequestDetails,
                collection: USERS_COLLECTION,
            };
            const createResponse = await this.dataService.createDocument(SYSTEM_DB, USERS_COLLECTION, { _id: identityDocId, ...newIdentityData });
            logger.info(`New identity ${identityDid} registered, isAdmin: ${isPromotedToAdmin}. Instance ${instanceId} pending.`);
            identityRecord = { ...newIdentityData, _id: createResponse.id, _rev: createResponse.rev };
        }

        const tokenDetails = await this.generateAndStoreTokens(identityRecord, userAgent, ipAddress);
        return { identity: identityRecord, tokenDetails };
    }

    /**
     * Authenticates an identity and issues new tokens.
     * @param did The DID of the identity.
     * @param userAgent Optional user agent string from the client.
     * @param ipAddress Optional IP address from the client.
     * @returns The Identity document and token details.
     */
    async loginIdentity(did: string, userAgent?: string, ipAddress?: string): Promise<{ identity: Identity; tokenDetails: TokenResponse }> {
        const identityDocId = `${USERS_COLLECTION}/${did}`;
        const identityRecord = await this.dataService.getDocument<Identity>(SYSTEM_DB, identityDocId);
        if (!identityRecord) {
            throw new NotFoundError(`Identity ${did} not found for login.`);
        }

        const tokenDetails = await this.generateAndStoreTokens(identityRecord, userAgent, ipAddress);
        logger.info(`Identity ${did} logged in successfully.`);
        return { identity: identityRecord, tokenDetails };
    }

    /**
     * Refreshes an access token using a valid refresh token.
     * Implements refresh token rotation.
     * @param refreshTokenString The refresh token provided by the client.
     * @param userAgent Optional user agent string from the client.
     * @param ipAddress Optional IP address from the client.
     * @returns New token details (access and potentially new refresh token).
     */
    async refreshAccessToken(refreshTokenString: string, userAgent?: string, ipAddress?: string): Promise<TokenResponse> {
        const tokenHash = this.hashRefreshToken(refreshTokenString);
        const query = { selector: { collection: REFRESH_TOKENS_COLLECTION, tokenHash } };
        const results = await this.dataService.findDocuments<StoredRefreshToken>(SYSTEM_DB, query);

        if (!results.docs || results.docs.length === 0) {
            throw new UnauthorizedError("Invalid refresh token.");
        }
        const storedToken = results.docs[0];

        if (storedToken.revoked) {
            // Potential token theft attempt - invalidate all tokens for this user?
            logger.warn(`Attempt to use a revoked refresh token for DID: ${storedToken.did}.`);
            throw new UnauthorizedError("Refresh token has been revoked.");
        }
        if (storedToken.expiresAt < Math.floor(Date.now() / 1000)) {
            throw new UnauthorizedError("Refresh token expired.");
        }

        // Fetch identity to get isAdmin status for the new access token
        const identity = await this.dataService.getDocument<Identity>(SYSTEM_DB, `${USERS_COLLECTION}/${storedToken.did}`);
        if (!identity) {
            logger.error(`Identity ${storedToken.did} not found during refresh token grant for token ID ${storedToken._id}.`);
            throw new InternalServerError("Associated identity not found.");
        }

        // Generate new access token
        const { token: newAccessToken, expiresAt: newAccessTokenExpiresAt } = await this.generateAccessToken(identity.identityDid, identity.isAdmin);

        // Refresh Token Rotation: Invalidate old, issue new
        storedToken.revoked = true;
        storedToken.lastUsedAt = Math.floor(Date.now() / 1000);
        await this.dataService.updateDocument(SYSTEM_DB, REFRESH_TOKENS_COLLECTION, storedToken._id!, storedToken._rev!, storedToken);

        const newPlainRefreshToken = this.generateRefreshTokenString();
        const { refreshToken: newRefreshToken, expiresAt: newRefreshTokenExpiresAt } = await this.storeRefreshToken(
            identity.identityDid,
            newPlainRefreshToken,
            userAgent,
            ipAddress
        );

        logger.info(`Access token refreshed for DID: ${identity.identityDid}. New refresh token issued.`);
        return {
            accessToken: newAccessToken,
            accessTokenExpiresIn: newAccessTokenExpiresAt,
            refreshToken: newRefreshToken,
            refreshTokenExpiresAt: newRefreshTokenExpiresAt,
            tokenType: "Bearer",
        };
    }

    /**
     * Verifies a signature made by a DID.
     * Message format: `${did}|${nonce}|${timestamp}` or `${did}|${nonce}|${timestamp}|${claimCode}`.
     * @param did The DID of the signer.
     * @param nonce Client-generated nonce.
     * @param timestamp Client-generated timestamp (ISO format).
     * @param signatureB64 Base64 encoded signature.
     * @param payloadFieldsToSign Optional array of strings representing additional payload fields that were included in the signature.
     *                            The values of these fields will be appended to the message string in order.
     *                            Example: if payloadFieldsToSign = ["field1Value", "field2Value"], message becomes `${did}|${nonce}|${timestamp}|field1Value|field2Value`
     * @returns True if the signature is valid.
     */
    async verifyDidSignature(did: string, nonce: string, timestamp: string, signatureB64: string, payloadFieldsToSign?: string[]): Promise<boolean> {
        try {
            let messageToVerify = `${did}|${nonce}|${timestamp}`;
            if (payloadFieldsToSign && payloadFieldsToSign.length > 0) {
                messageToVerify += `|${payloadFieldsToSign.join("|")}`;
            }

            const messageBytes = new TextEncoder().encode(messageToVerify);
            const publicKeyBytes = ed25519FromDid(did);
            const signatureBytes = Buffer.from(signatureB64, "base64");

            const isValid = await verify(signatureBytes, messageBytes, publicKeyBytes);
            if (!isValid) {
                logger.warn(`Signature verification failed for DID ${did}. Message: "${messageToVerify}"`);
                return false;
            }
            logger.debug(`Signature verified successfully for DID ${did}.`);
            return true;
        } catch (error: any) {
            logger.error(`Error during signature verification for DID ${did}:`, error);
            return false;
        }
    }

    async isAdmin(identityDid: string): Promise<boolean> {
        const identityDocId = `${USERS_COLLECTION}/${identityDid}`;
        try {
            const identityDoc = await this.dataService.getDocument<Identity>(SYSTEM_DB, identityDocId);
            return !!identityDoc && identityDoc.isAdmin === true;
        } catch (error: any) {
            if (error instanceof NotFoundError) {
                logger.debug(`isAdmin check: Identity document ${identityDocId} not found.`);
                return false;
            } else {
                logger.error(`isAdmin check: Error fetching identity document ${identityDocId}:`, error);
                return false;
            }
        }
    }

    /**
     * Updates an identity's information. Can be called by owner, admin, or internal services.
     * Handles profile updates, admin promotion via claim code, and instance status updates.
     * @param identityDid The DID of the identity to update.
     * @param updates The partial identity data to update.
     * @param callingRole 'owner', 'admin' or 'internal' to determine allowed updates.
     * @param claimCodeForPromotion Optional claim code if owner is attempting to promote.
     * @returns The updated Identity document.
     */
    async updateIdentity(
        identityDid: string,
        updates: Partial<Identity>,
        callingRole: "owner" | "admin" | "internal",
        claimCodeForPromotion?: string
    ): Promise<Identity> {
        const identityDocId = `${USERS_COLLECTION}/${identityDid}`;
        logger.info(`Attempting to update identity ${identityDid} by role: ${callingRole}`);

        const identityDoc = await this.dataService.getDocument<Identity>(SYSTEM_DB, identityDocId);
        if (!identityDoc) {
            throw new NotFoundError(`Identity ${identityDid} not found.`);
        }
        if (!identityDoc._rev) {
            throw new InternalServerError(`Identity document ${identityDid} is missing _rev.`);
        }

        let promotedToAdminThisUpdate = false;

        if (callingRole === "owner") {
            if (updates.profileName !== undefined) identityDoc.profileName = updates.profileName;
            if (updates.profilePictureUrl !== undefined) identityDoc.profilePictureUrl = updates.profilePictureUrl;

            if (claimCodeForPromotion) {
                const initialAdminCode = process.env.ADMIN_CLAIM_CODE;
                if (initialAdminCode && claimCodeForPromotion === initialAdminCode) {
                    if (!identityDoc.isAdmin) {
                        identityDoc.isAdmin = true;
                        promotedToAdminThisUpdate = true;
                        logger.info(`Identity ${identityDid} promoted to admin via claim code during update.`);
                    }
                } else {
                    logger.warn(`Invalid or non-initial claim code provided by owner ${identityDid}. Not promoting.`);
                    // Potentially throw an error if claim code is provided but invalid
                    // throw new Error("Invalid claim code provided.");
                }
            }
            // Owners cannot change other fields like isAdmin directly (only via claim code), instance status, etc.
            const forbiddenOwnerUpdates = Object.keys(updates).filter((key) => !["profileName", "profilePictureUrl"].includes(key));
            if (forbiddenOwnerUpdates.length > 0) {
                logger.warn(`Owner ${identityDid} attempted to update forbidden fields: ${forbiddenOwnerUpdates.join(", ")}`);
                // Optionally throw error or just ignore these fields
            }
        } else if (callingRole === "admin") {
            if (updates.profileName !== undefined) identityDoc.profileName = updates.profileName;
            if (updates.profilePictureUrl !== undefined) identityDoc.profilePictureUrl = updates.profilePictureUrl;
            if (updates.isAdmin !== undefined) identityDoc.isAdmin = updates.isAdmin;
            if (updates.tier !== undefined) identityDoc.tier = updates.tier;
            if (updates.instanceStatus !== undefined) identityDoc.instanceStatus = updates.instanceStatus;
            if (updates.instanceUrl !== undefined) identityDoc.instanceUrl = updates.instanceUrl;
            if (updates.instanceErrorDetails !== undefined) identityDoc.instanceErrorDetails = updates.instanceErrorDetails;
            // Admin should not typically change instanceId directly.
        } else if (callingRole === "internal") {
            // For provisioning script callbacks
            if (updates.instanceStatus !== undefined) identityDoc.instanceStatus = updates.instanceStatus;
            if (updates.instanceUrl !== undefined) identityDoc.instanceUrl = updates.instanceUrl;
            if (updates.instanceErrorDetails !== undefined) identityDoc.instanceErrorDetails = updates.instanceErrorDetails;
            identityDoc.instanceUpdatedAt = new Date().toISOString();
        }

        if (callingRole !== "internal" && (updates.instanceStatus || updates.instanceUrl || updates.instanceErrorDetails)) {
            identityDoc.instanceUpdatedAt = new Date().toISOString();
        }

        const updateResponse = await this.dataService.updateDocument(SYSTEM_DB, USERS_COLLECTION, identityDocId, identityDoc._rev, identityDoc);
        const updatedIdentity = { ...identityDoc, _rev: updateResponse.rev };

        if (promotedToAdminThisUpdate) {
            // If owner promoted themselves, the calling code in index.ts might want to issue a new JWT.
            // This service method itself doesn't handle JWTs.
        }
        logger.info(`Successfully updated identity ${identityDid}. New rev: ${updateResponse.rev}`);
        return updatedIdentity;
    }

    /**
     * Creates a test identity and generates a JWT.
     * WARNING: Use only in test environments.
     */
    async createTestIdentityAndToken(
        identityDidInput?: string,
        isAdminFlag: boolean = false,
        jwtExpiresIn: string = "1h"
    ): Promise<{ identityDid: string; token: string; identityRev: string }> {
        logger.warn(`Executing createTestIdentityAndToken helper. Use only in testing!`);

        const testIdentityDid = identityDidInput || `did:vibe:test:${randomUUIDv7()}`;
        // const identityDocId = `${USERS_COLLECTION}/${testIdentityDid}`; // Not needed if registerIdentity handles it

        const instanceId = `test-instance-${randomUUIDv7().substring(0, 8)}`;
        const profileName = `Test User ${testIdentityDid.slice(-5)}`;

        // Use registerIdentity to create the identity and initial tokens
        const { identity, tokenDetails } = await this.registerIdentity(
            testIdentityDid,
            instanceId,
            profileName,
            undefined, // profilePictureUrl
            undefined, // claimCodeValue
            { nonce: randomUUIDv7(), timestamp: new Date().toISOString() }, // provisioningRequestDetails
            "test-user-agent",
            "127.0.0.1"
        );

        // If a specific isAdmin flag was requested for the test that differs from default registration
        if (isAdminFlag !== identity.isAdmin) {
            identity.isAdmin = isAdminFlag;
            const updatedIdentity = await this.updateIdentity(testIdentityDid, { isAdmin: isAdminFlag }, "admin");
            // Re-issue tokens if admin status changed critical identity aspect for token
            // For simplicity, we'll assume the initial tokens from registerIdentity are sufficient for test context
            // or that test setup will handle specific admin promotion if needed via claim codes.
            // If direct admin flag setting needs new tokens, re-call generateAndStoreTokens here.
            logger.info(`Test identity ${testIdentityDid} admin status set to ${isAdminFlag}. Original registration tokens used.`);
        }

        // The access token is in tokenDetails.accessToken
        return { identityDid: testIdentityDid, token: tokenDetails.accessToken, identityRev: identity._rev! };
    }
}
