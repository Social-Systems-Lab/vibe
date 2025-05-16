// auth.service.ts
import { DataService, dataService } from "./data.service";
import { logger } from "../utils/logger";
import { SYSTEM_DB, USERS_COLLECTION, CLAIM_CODES_COLLECTION } from "../utils/constants"; // Removed APPS_COLLECTION
import {
    type App as AppModel, // This will be unused if APPS_COLLECTION logic is removed
    type ClaimCode,
    type Identity, // Changed from User
    IdentitySchema, // Added
} from "../models/models";
import { InternalServerError, NotFoundError } from "elysia";
import type { PermissionService } from "./permission.service";
import * as jose from "jose";
import { randomUUIDv7 } from "bun"; // For test identity DID generation
import { getUserDbName, ed25519FromDid } from "../utils/identity.utils";
import { verify } from "@noble/ed25519";
import { Buffer } from "buffer";

export class AuthService {
    private dataService: DataService;
    private permissionService: PermissionService;

    constructor(dataService: DataService, permissionService: PermissionService) {
        this.dataService = dataService;
        this.permissionService = permissionService;
        logger.info("AuthService initialized.");
    }

    /**
     * Deletes an identity and their associated data.
     * @param identityDid - The DID of the identity to delete.
     */
    async deleteIdentity(identityDid: string): Promise<void> {
        logger.info(`Attempting to delete identity and data for identityDid: ${identityDid}`);

        const identityDocId = `${USERS_COLLECTION}/${identityDid}`; // USERS_COLLECTION might be an anachronism now
        const identitySystemDbName = getUserDbName(identityDid); // This DB was for user-specific system data in CP's CouchDB

        // 1. Delete the identity document from SYSTEM_DB
        try {
            const identityDoc = await this.dataService.getDocument<Identity>(SYSTEM_DB, identityDocId);
            if (!identityDoc) {
                logger.warn(`Identity document '${identityDid}' not found in '${SYSTEM_DB}' during deletion.`);
                // If the main identity doc is gone, other cleanup might still be relevant or might fail gracefully.
            } else {
                await this.dataService.deleteDocument(SYSTEM_DB, identityDocId, identityDoc._rev!);
                logger.info(`Successfully deleted identity document '${identityDocId}' from '${SYSTEM_DB}'.`);
            }
        } catch (error: any) {
            if (error instanceof NotFoundError) {
                logger.warn(`Identity document '${identityDocId}' not found in '${SYSTEM_DB}' during deletion.`);
            } else {
                logger.error(`Error deleting identity document '${identityDocId}' from '${SYSTEM_DB}':`, error.message || error);
                // Potentially rethrow if this is critical and should halt further deletion attempts
            }
        }

        // 2. Delete the identity's system data database (if it was used)
        try {
            await this.dataService.getConnection().db.destroy(identitySystemDbName);
            logger.info(`Successfully deleted identity system data database '${identitySystemDbName}'.`);
        } catch (error: any) {
            if (error.statusCode === 404 || error.message?.includes("not_found")) {
                logger.warn(`Identity system data database '${identitySystemDbName}' not found during deletion.`);
            } else {
                logger.error(`Error deleting identity system data database '${identitySystemDbName}':`, error.message || error);
            }
        }

        // 3. Delete identity's app registrations - REMOVED as APPS_COLLECTION is not in control-plane constants
        // try {
        //     logger.debug(`Finding app registrations for identity ${identityDid} in ${SYSTEM_DB}...`);
        //     // Assuming AppModel still uses userDid, this needs to be updated if AppModel changes
        //     const appQuery = { selector: { collection: APPS_COLLECTION, userDid: identityDid } };
        //     const appRegs = await this.dataService.findDocuments<AppModel>(SYSTEM_DB, appQuery);

        //     if (appRegs.docs && appRegs.docs.length > 0) {
        //         logger.info(`Found ${appRegs.docs.length} app registrations for identity ${identityDid}. Deleting...`);
        //         const bulkDeletePayload = appRegs.docs.map((doc) => ({
        //             _id: doc._id!,
        //             _rev: doc._rev!,
        //             _deleted: true,
        //         }));
        //         const db = await this.dataService.ensureDatabaseExists(SYSTEM_DB);
        //         const bulkResult = await db.bulk({ docs: bulkDeletePayload });

        //         const errors = bulkResult.filter((item) => !!item.error);
        //         if (errors.length > 0) {
        //             logger.error(`Errors encountered during bulk deletion of app registrations for identity ${identityDid}:`, errors);
        //         } else {
        //             logger.info(`Successfully deleted ${bulkDeletePayload.length} app registrations for identity ${identityDid}.`);
        //         }
        //     } else {
        //         logger.info(`No app registrations found for identity ${identityDid}.`);
        //     }
        // } catch (error: any) {
        //     logger.error(`Error deleting app registrations for identity ${identityDid}:`, error.message || error);
        // }

        // Note: Actual Vibe Cloud Instance deprovisioning (Helm, K8s) is handled by a script triggered from index.ts
        logger.info(
            `Identity data cleanup process completed for identityDid: ${identityDid}. Instance deprovisioning is separate. App registrations not handled by this service.`
        );
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
     * @returns The created or updated Identity document.
     */
    async registerIdentity(
        identityDid: string,
        instanceId: string,
        profileName?: string,
        profilePictureUrl?: string,
        claimCodeValue?: string,
        provisioningRequestDetails?: { nonce: string; timestamp: string }
    ): Promise<Identity> {
        const identityDocId = `${USERS_COLLECTION}/${identityDid}`; // Using USERS_COLLECTION as per current DB schema
        let isPromotedToAdmin = false;

        if (claimCodeValue) {
            const initialAdminCode = process.env.ADMIN_CLAIM_CODE;
            if (initialAdminCode && claimCodeValue === initialAdminCode) {
                isPromotedToAdmin = true;
                logger.info(`Identity ${identityDid} will be promoted to admin via initial claim code.`);
                // Note: For MVP, we assume initial admin claim code doesn't need to be marked "spent" or is dev-reusable.
                // A full system would fetch the ClaimCode doc, validate, and mark as spent.
            } else {
                logger.warn(`Claim code '${claimCodeValue}' provided by ${identityDid} did not match initial admin code. Not promoting.`);
            }
        }

        let existingIdentity: Identity | null = null;
        try {
            existingIdentity = await this.dataService.getDocument<Identity>(SYSTEM_DB, identityDocId);
        } catch (error: any) {
            if (!(error instanceof NotFoundError)) throw error;
        }

        const now = new Date().toISOString();

        if (existingIdentity) {
            logger.info(`Identity ${identityDid} already exists. Updating profile and instance details for new/re-provisioning.`);
            existingIdentity.profileName = profileName ?? existingIdentity.profileName;
            existingIdentity.profilePictureUrl = profilePictureUrl ?? existingIdentity.profilePictureUrl;
            if (isPromotedToAdmin) existingIdentity.isAdmin = true;

            // If instanceId is different, it implies a new instance is being requested for an existing identity.
            // The old instance should ideally be deprovisioned. This service method focuses on the DB record.
            if (existingIdentity.instanceId !== instanceId) {
                logger.warn(
                    `Identity ${identityDid} is getting a new instanceId ${instanceId} (old: ${existingIdentity.instanceId}). Old instance may need manual cleanup if not deprovisioned.`
                );
            }
            existingIdentity.instanceId = instanceId;
            existingIdentity.instanceStatus = "pending"; // Reset for new provisioning
            existingIdentity.instanceUrl = undefined;
            existingIdentity.instanceErrorDetails = undefined;
            existingIdentity.instanceCreatedAt = now;
            existingIdentity.instanceUpdatedAt = now;
            existingIdentity.provisioningRequestDetails = provisioningRequestDetails;

            const updateResponse = await this.dataService.updateDocument(SYSTEM_DB, USERS_COLLECTION, identityDocId, existingIdentity._rev!, existingIdentity);
            return { ...existingIdentity, _rev: updateResponse.rev };
        } else {
            const newIdentityData: Omit<Identity, "_id" | "_rev"> = {
                identityDid: identityDid,
                isAdmin: isPromotedToAdmin,
                profileName: profileName,
                profilePictureUrl: profilePictureUrl,
                instanceId: instanceId,
                instanceStatus: "pending",
                instanceCreatedAt: now,
                instanceUpdatedAt: now,
                provisioningRequestDetails: provisioningRequestDetails,
                collection: USERS_COLLECTION,
            };
            const createResponse = await this.dataService.createDocument(SYSTEM_DB, USERS_COLLECTION, { _id: identityDocId, ...newIdentityData });
            logger.info(`New identity ${identityDid} registered, isAdmin: ${isPromotedToAdmin}. Instance ${instanceId} set to pending.`);
            return { ...newIdentityData, _id: createResponse.id, _rev: createResponse.rev };
        }
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
     * @param callingRole 'owner', 'admin', or 'internal' to determine allowed updates.
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

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) throw new Error("JWT_SECRET environment variable not configured.");
        const secretKey = new TextEncoder().encode(jwtSecret);

        const testIdentityDid = identityDidInput || `did:vibe:test:${randomUUIDv7()}`;
        const identityDocId = `${USERS_COLLECTION}/${testIdentityDid}`;

        const newIdentityData: Omit<Identity, "_id" | "_rev"> = {
            identityDid: testIdentityDid,
            isAdmin: isAdminFlag,
            collection: USERS_COLLECTION,
            instanceId: `test-instance-${randomUUIDv7().substring(0, 8)}`,
            instanceStatus: "completed",
            instanceUrl: `http://test-${testIdentityDid}.vibe.dev`,
            instanceCreatedAt: new Date().toISOString(),
        };
        newIdentityData.instanceUpdatedAt = newIdentityData.instanceCreatedAt;

        let identityCreateResponse;
        try {
            identityCreateResponse = await this.dataService.createDocument(SYSTEM_DB, USERS_COLLECTION, { _id: identityDocId, ...newIdentityData });
        } catch (error: any) {
            if (error.statusCode === 409) {
                // Conflict, identity likely exists
                logger.warn(`Test identity ${testIdentityDid} already exists, fetching...`);
                const existing = await this.dataService.getDocument<Identity>(SYSTEM_DB, identityDocId);
                if (!existing._rev) throw new Error("Existing test identity missing _rev");
                identityCreateResponse = { id: existing._id, rev: existing._rev }; // Mimic create response for rev
            } else {
                throw error;
            }
        }

        const identityRev = identityCreateResponse.rev!;

        // User-specific DB (if needed by control plane for this identity)
        try {
            const identitySystemDbName = getUserDbName(testIdentityDid);
            await this.dataService.ensureDatabaseExists(identitySystemDbName);
        } catch (error: any) {
            logger.error(`[Test Helper] Failed to create system database for test identity ${testIdentityDid}:`, error);
            // Not cleaning up identity doc here, as it might be an acceptable partial success for some tests.
        }

        const token = await new jose.SignJWT({ identityDid: testIdentityDid, isAdmin: isAdminFlag }).setProtectedHeader({ alg: "HS256" }).sign(secretKey);

        return { identityDid: testIdentityDid, token, identityRev };
    }
}
