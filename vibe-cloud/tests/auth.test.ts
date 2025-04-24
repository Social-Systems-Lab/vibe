// tests/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app, authService, dataService, permissionService } from "../src/index"; // Import app and services
import { logger } from "../src/utils/logger";
import { SYSTEM_DB } from "../src/utils/constants";
import { CLAIM_CODES_COLLECTION, USERS_COLLECTION, type ClaimCode, type User } from "../src/models/models";
import { Buffer } from "buffer";
import { randomUUID } from "crypto";
// --- Import from our new identity utility ---
import {
    generateEd25519KeyPair,
    signEd25519,
    didFromEd25519,
    getUserDbName, // Keep if needed for direct checks, maybe not necessary here
    type Ed25519KeyPair, // Import type if needed
} from "../src/utils/identity.utils"; // Adjust path as needed
// --- End identity utility import ---
import type { App } from "../src/index"; // Import App type for treaty

// Sync method setup is now handled within identity.utils.ts

describe("Auth Service & Admin Claim", () => {
    const api = treaty<App>(app);

    let claimCodeDocId: string;
    let claimCodeValue: string;
    let claimCodeRev: string | undefined;
    let adminDid: string;
    let adminKeyPair: Ed25519KeyPair; // Store the key pair
    let createdAdminUserDid: string | null = null;

    beforeAll(async () => {
        // 1. Generate keypair using identity utility
        adminKeyPair = generateEd25519KeyPair();
        // 2. Generate DID using identity utility
        adminDid = didFromEd25519(adminKeyPair.publicKey);
        logger.info(`Generated test admin DID: ${adminDid}`);

        // 3. Create a claim code document directly for testing
        claimCodeDocId = `${CLAIM_CODES_COLLECTION}/test-claim-${randomUUID()}`;
        claimCodeValue = `TESTCODE-${randomUUID()}`;
        const newClaimCodeDoc: Omit<ClaimCode, "_rev"> = {
            _id: claimCodeDocId,
            code: claimCodeValue,
            expiresAt: null,
            forDid: null,
            spentAt: null,
            collection: CLAIM_CODES_COLLECTION,
        };

        try {
            const createRes = await dataService.createDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, newClaimCodeDoc);
            claimCodeRev = createRes.rev;
            logger.info(`Created test claim code ${claimCodeDocId} (rev: ${claimCodeRev}) with value ${claimCodeValue}`);
        } catch (error) {
            logger.error("Failed to create test claim code in beforeAll:", error);
            throw error;
        }
    });

    // afterAll remains unchanged
    afterAll(async () => {
        logger.info("Cleaning up auth tests...");
        if (claimCodeDocId && claimCodeRev) {
            try {
                await dataService.deleteDocument(SYSTEM_DB, claimCodeDocId, claimCodeRev);
                logger.info(`Cleaned up test claim code ${claimCodeDocId}`);
            } catch (e: any) {
                logger.warn(`Initial cleanup failed for claim code ${claimCodeDocId} (rev ${claimCodeRev}), fetching latest...`, e.message);
                try {
                    const doc = await dataService.getDocument<ClaimCode>(SYSTEM_DB, claimCodeDocId);
                    if (doc._rev) {
                        await dataService.deleteDocument(SYSTEM_DB, claimCodeDocId, doc._rev);
                        logger.info(`Cleaned up test claim code ${claimCodeDocId} with fetched rev ${doc._rev}`);
                    }
                } catch (e2: any) {
                    logger.error(`Error cleaning up test claim code ${claimCodeDocId} even after fetch:`, e2.message);
                }
            }
        } else if (claimCodeDocId) {
            logger.warn(`Claim code rev was missing for ${claimCodeDocId}, attempting delete without rev (might fail)...`);
            try {
                const doc = await dataService.getDocument<ClaimCode>(SYSTEM_DB, claimCodeDocId);
                if (doc._rev) await dataService.deleteDocument(SYSTEM_DB, claimCodeDocId, doc._rev);
            } catch (e) {
                logger.error(`Final cleanup attempt failed for claim code ${claimCodeDocId}:`, e);
            }
        }
        if (createdAdminUserDid) {
            try {
                await authService.deleteUser(createdAdminUserDid);
                logger.info(`Cleaned up test admin user ${createdAdminUserDid}`);
            } catch (e) {
                logger.error(`Error cleaning up test admin user ${createdAdminUserDid}:`, e);
            }
        }
        logger.info("Auth test cleanup finished.");
    });

    describe("POST /api/v1/admin/claim", () => {
        it("should successfully claim an admin account", async () => {
            // 1. Sign using identity utility
            const messageBytes = new TextEncoder().encode(claimCodeValue);
            const signatureBytes = signEd25519(messageBytes, adminKeyPair.privateKey); // Use utility
            const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

            // 2. Make the API call
            const { data, error, status } = await api.api.v1.admin.claim.post({
                did: adminDid,
                claimCode: claimCodeValue,
                signature: signatureBase64,
            });

            // 3. Assert success (unchanged)
            expect(status).toBe(201);
            expect(error).toBeNull();
            expect(data).toBeDefined();
            expect(data?.message).toContain("claimed successfully");
            expect(data?.userDid).toBe(adminDid);
            expect(data?.isAdmin).toBe(true);
            expect(data?.token).toBeTypeOf("string");

            createdAdminUserDid = data?.userDid ?? null;
            expect(createdAdminUserDid).not.toBeNull();

            // 4. Verify claim code is marked as spent in DB (unchanged)
            const spentClaimDoc = await dataService.getDocument<ClaimCode>(SYSTEM_DB, claimCodeDocId);
            expect(spentClaimDoc.spentAt).toBeTypeOf("string");
            expect(spentClaimDoc.claimedByDid).toBe(adminDid);
            claimCodeRev = spentClaimDoc._rev;

            // 5. Verify admin user exists in DB (unchanged)
            const userDocId = `${USERS_COLLECTION}/${adminDid}`;
            const adminUserDoc = await dataService.getDocument<User>(SYSTEM_DB, userDocId);
            expect(adminUserDoc._id).toBe(userDocId);
            expect(adminUserDoc.userDid).toBe(adminDid);
            expect(adminUserDoc.isAdmin).toBe(true);
            expect(adminUserDoc.collection).toBe(USERS_COLLECTION);

            // 6. Verify admin user has default direct permissions (unchanged)
            const adminPerms = await permissionService.getUserDirectPermissions(adminDid);
            expect(adminPerms).toContain("manage:permissions");
            expect(adminPerms).toContain("read:*");
            expect(adminPerms).toContain("write:*");
            expect(adminPerms).toContain("manage:users");
            expect(adminPerms).toContain("read:blobs");
            expect(adminPerms).toContain("write:blobs");

            // 7. Verify user database exists (unchanged)
            const userDbName = getUserDbName(adminDid); // Use utility for consistency if checking name
            try {
                const dbInfo = await dataService.getConnection().db.get(userDbName);
                expect(dbInfo).toBeDefined();
                expect(dbInfo.db_name).toBe(userDbName);
            } catch (e) {
                throw new Error(`User database ${userDbName} was not created for admin ${adminDid}`);
            }
        });

        it("should fail if claim code is invalid", async () => {
            const invalidCode = "invalid-code";
            const messageBytes = new TextEncoder().encode(invalidCode);
            const signatureBytes = signEd25519(messageBytes, adminKeyPair.privateKey); // Use utility
            const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

            const { data, error, status } = await api.api.v1.admin.claim.post({
                did: adminDid,
                claimCode: invalidCode,
                signature: signatureBase64,
            });

            expect(status).toBe(400);
            expect(data).toBeNull();
            expect(error?.value as any).toEqual({ error: "Invalid or unknown claim code." });
        });

        it("should fail if signature is invalid", async () => {
            const messageBytes = new TextEncoder().encode(claimCodeValue);
            // Generate a *different* key pair for signing
            const otherKeyPair = generateEd25519KeyPair(); // Use utility
            const signatureBytes = signEd25519(messageBytes, otherKeyPair.privateKey); // Sign with wrong key
            const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

            const { data, error, status } = await api.api.v1.admin.claim.post({
                did: adminDid,
                claimCode: claimCodeValue,
                signature: signatureBase64, // INCORRECT signature
            });

            expect(status).toBe(400);
            expect(data).toBeNull();
            expect(error?.value as any).toEqual({ error: "Invalid signature." });
        });

        it("should fail if claim code is already spent", async () => {
            const messageBytes = new TextEncoder().encode(claimCodeValue);
            const signatureBytes = signEd25519(messageBytes, adminKeyPair.privateKey); // Use utility
            const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

            const { data, error, status } = await api.api.v1.admin.claim.post({
                did: adminDid,
                claimCode: claimCodeValue,
                signature: signatureBase64,
            });

            expect(status).toBe(400);
            expect(data).toBeNull();
            expect(error?.value as any).toEqual({ error: "Claim code has already been used." });
        });

        // Expired and Locked tests remain largely the same, just use the utility for signing
        it("should fail if claim code is expired", async () => {
            const expiredCodeId = `${CLAIM_CODES_COLLECTION}/test-claim-expired-${randomUUID()}`;
            const expiredCodeValue = `EXPIREDCODE-${randomUUID()}`;
            const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
            const expiredDoc: Omit<ClaimCode, "_rev"> = {
                _id: expiredCodeId,
                code: expiredCodeValue,
                expiresAt: pastDate,
                forDid: null,
                spentAt: null,
                collection: CLAIM_CODES_COLLECTION,
            };
            let expiredRev: string | undefined;
            try {
                const createRes = await dataService.createDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, expiredDoc);
                expiredRev = createRes.rev;

                const messageBytes = new TextEncoder().encode(expiredCodeValue);
                const signatureBytes = signEd25519(messageBytes, adminKeyPair.privateKey); // Use utility
                const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

                const { data, error, status } = await api.api.v1.admin.claim.post({ did: adminDid, claimCode: expiredCodeValue, signature: signatureBase64 });

                expect(status).toBe(400);
                expect(error?.value as any).toEqual({ error: "Claim code has expired." });
            } finally {
                if (expiredCodeId && expiredRev) {
                    await dataService.deleteDocument(SYSTEM_DB, expiredCodeId, expiredRev).catch((e) => logger.error("Cleanup failed for expired code:", e));
                }
            }
        });

        it("should fail if claim code is locked to a different DID", async () => {
            const lockedCodeId = `${CLAIM_CODES_COLLECTION}/test-claim-locked-${randomUUID()}`;
            const lockedCodeValue = `LOCKEDCODE-${randomUUID()}`;
            const lockedDoc: Omit<ClaimCode, "_rev"> = {
                _id: lockedCodeId,
                code: lockedCodeValue,
                expiresAt: null,
                forDid: "did:vibe:some-other-user",
                spentAt: null,
                collection: CLAIM_CODES_COLLECTION,
            };
            let lockedRev: string | undefined;
            try {
                const createRes = await dataService.createDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, lockedDoc);
                lockedRev = createRes.rev;

                const messageBytes = new TextEncoder().encode(lockedCodeValue);
                const signatureBytes = signEd25519(messageBytes, adminKeyPair.privateKey); // Use utility
                const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

                const { data, error, status } = await api.api.v1.admin.claim.post({ did: adminDid, claimCode: lockedCodeValue, signature: signatureBase64 });

                expect(status).toBe(400);
                expect(error?.value as any).toEqual({ error: "Claim code is not valid for the provided DID." });
            } finally {
                if (lockedCodeId && lockedRev) {
                    await dataService.deleteDocument(SYSTEM_DB, lockedCodeId, lockedRev).catch((e) => logger.error("Cleanup failed for locked code:", e));
                }
            }
        });
    });
});
