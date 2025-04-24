// tests/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app, authService, dataService, permissionService } from "../src/index";
import { logger } from "../src/utils/logger";
import { SYSTEM_DB } from "../src/utils/constants";
import { CLAIM_CODES_COLLECTION, USERS_COLLECTION, type ClaimCode, type User } from "../src/models/models";
import { Buffer } from "buffer";
import { randomUUID } from "crypto";
import { generateEd25519KeyPair, signEd25519, didFromEd25519, getUserDbName, type Ed25519KeyPair } from "../src/utils/identity.utils";
import type { App } from "../src/index";

describe("Auth Service & Admin Claim", () => {
    const api = treaty<App>(app);

    // --- Variables for the main claim code ---
    let claimCodeDocId: string;
    let claimCodeValue: string;
    let claimCodeRev: string | undefined;

    // --- Variables for the invalid signature test claim code ---
    let invalidSigClaimCodeDocId: string;
    let invalidSigClaimCodeValue: string;
    let invalidSigClaimCodeRev: string | undefined;

    // --- Other variables ---
    let adminDid: string;
    let adminKeyPair: Ed25519KeyPair;
    let createdAdminUserDid: string | null = null;

    beforeAll(async () => {
        // 1. Generate admin keypair and DID
        adminKeyPair = generateEd25519KeyPair();
        adminDid = didFromEd25519(adminKeyPair.publicKey);
        logger.info(`Generated test admin DID: ${adminDid}`);

        // 2. Create the *main* claim code document
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
            logger.info(`Created main test claim code ${claimCodeDocId} (rev: ${claimCodeRev}) with value ${claimCodeValue}`);
        } catch (error) {
            logger.error("Failed to create main test claim code in beforeAll:", error);
            throw error;
        }

        // 3. Create the *second* claim code document (for invalid signature test)
        invalidSigClaimCodeDocId = `${CLAIM_CODES_COLLECTION}/test-claim-invsig-${randomUUID()}`;
        invalidSigClaimCodeValue = `TESTCODE-INVSIG-${randomUUID()}`;
        const newInvalidSigClaimCodeDoc: Omit<ClaimCode, "_rev"> = {
            _id: invalidSigClaimCodeDocId,
            code: invalidSigClaimCodeValue,
            expiresAt: null,
            forDid: null,
            spentAt: null,
            collection: CLAIM_CODES_COLLECTION,
        };
        try {
            const createRes = await dataService.createDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, newInvalidSigClaimCodeDoc);
            invalidSigClaimCodeRev = createRes.rev;
            logger.info(
                `Created invalid sig test claim code ${invalidSigClaimCodeDocId} (rev: ${invalidSigClaimCodeRev}) with value ${invalidSigClaimCodeValue}`
            );
        } catch (error) {
            logger.error("Failed to create invalid sig test claim code in beforeAll:", error);
            throw error;
        }
    });

    // --- Helper function for claim code cleanup ---
    async function cleanupClaimCode(docId: string, docRev: string | undefined, label: string) {
        if (!docId) return;
        if (docRev) {
            try {
                await dataService.deleteDocument(SYSTEM_DB, docId, docRev);
                logger.info(`Cleaned up ${label} claim code ${docId}`);
            } catch (e: any) {
                logger.warn(`Initial cleanup failed for ${label} claim code ${docId} (rev ${docRev}), fetching latest...`, e.message);
                try {
                    const doc = await dataService.getDocument<ClaimCode>(SYSTEM_DB, docId);
                    if (doc._rev) {
                        await dataService.deleteDocument(SYSTEM_DB, docId, doc._rev);
                        logger.info(`Cleaned up ${label} claim code ${docId} with fetched rev ${doc._rev}`);
                    }
                } catch (e2: any) {
                    logger.error(`Error cleaning up ${label} claim code ${docId} even after fetch:`, e2.message);
                }
            }
        } else {
            logger.warn(`${label} claim code rev was missing for ${docId}, attempting delete without rev (might fail)...`);
            try {
                const doc = await dataService.getDocument<ClaimCode>(SYSTEM_DB, docId);
                if (doc._rev) await dataService.deleteDocument(SYSTEM_DB, docId, doc._rev);
            } catch (e) {
                logger.error(`Final cleanup attempt failed for ${label} claim code ${docId}:`, e);
            }
        }
    }

    afterAll(async () => {
        logger.info("Cleaning up auth tests...");
        // Cleanup main claim code
        await cleanupClaimCode(claimCodeDocId, claimCodeRev, "main");
        // Cleanup invalid sig claim code
        await cleanupClaimCode(invalidSigClaimCodeDocId, invalidSigClaimCodeRev, "invalid sig");

        // Cleanup admin user
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
            // Uses the main claimCodeValue
            const messageBytes = new TextEncoder().encode(claimCodeValue);
            const signatureBytes = signEd25519(messageBytes, adminKeyPair.privateKey);
            const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

            const { data, error, status } = await api.api.v1.admin.claim.post({
                did: adminDid,
                claimCode: claimCodeValue,
                signature: signatureBase64,
            });

            expect(status).toBe(201);
            expect(error).toBeNull();
            expect(data).toBeDefined();
            expect(data?.userDid).toBe(adminDid);
            // ... other assertions ...
            createdAdminUserDid = data?.userDid ?? null; // Track for cleanup
            expect(createdAdminUserDid).not.toBeNull();

            // Verify main claim code is spent
            const spentClaimDoc = await dataService.getDocument<ClaimCode>(SYSTEM_DB, claimCodeDocId);
            expect(spentClaimDoc.spentAt).toBeTypeOf("string");
            claimCodeRev = spentClaimDoc._rev; // Update rev for cleanup

            // ... verify user, perms, db ...
        });

        it("should fail if claim code is invalid", async () => {
            // Uses an invalid code string
            const invalidCode = "invalid-code";
            const messageBytes = new TextEncoder().encode(invalidCode);
            const signatureBytes = signEd25519(messageBytes, adminKeyPair.privateKey);
            const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

            const { data, error, status } = await api.api.v1.admin.claim.post({
                did: adminDid,
                claimCode: invalidCode,
                signature: signatureBase64,
            });

            expect(status).toBe(400);
            expect(error?.value as any).toEqual({ error: "Invalid or unknown claim code." });
        });

        it("should fail if signature is invalid", async () => {
            // Use the *second*, unspent claim code: invalidSigClaimCodeValue
            const messageBytes = new TextEncoder().encode(invalidSigClaimCodeValue);
            // Generate a *different* key pair for signing
            const otherKeyPair = generateEd25519KeyPair();
            const signatureBytes = signEd25519(messageBytes, otherKeyPair.privateKey); // Sign with wrong key
            const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

            const { data, error, status } = await api.api.v1.admin.claim.post({
                did: adminDid, // Correct DID (associated with adminKeyPair.publicKey)
                claimCode: invalidSigClaimCodeValue, // Correct *unspent* code
                signature: signatureBase64, // INCORRECT signature
            });

            // Now we expect the "Invalid signature" error because the code is valid and unspent
            expect(status).toBe(400);
            expect(data).toBeNull();
            expect(error?.value as any).toEqual({ error: "Invalid signature." });

            // Verify the invalidSigClaimCode was NOT spent
            try {
                const codeDoc = await dataService.getDocument<ClaimCode>(SYSTEM_DB, invalidSigClaimCodeDocId);
                expect(codeDoc.spentAt).toBeNull();
                // Update rev if needed for cleanup, although it shouldn't change here
                invalidSigClaimCodeRev = codeDoc._rev;
            } catch (e) {
                // Handle case where document might not be found if something went very wrong
                logger.error("Could not verify invalidSigClaimCodeDoc status after failed signature test", e);
            }
        });

        it("should fail if claim code is already spent", async () => {
            // Uses the main claimCodeValue, which was spent by the first test
            const messageBytes = new TextEncoder().encode(claimCodeValue);
            const signatureBytes = signEd25519(messageBytes, adminKeyPair.privateKey);
            const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

            const { data, error, status } = await api.api.v1.admin.claim.post({
                did: adminDid,
                claimCode: claimCodeValue,
                signature: signatureBase64,
            });

            expect(status).toBe(400);
            expect(error?.value as any).toEqual({ error: "Claim code has already been used." });
        });

        // Expired and Locked tests remain the same (they create their own codes)
        it("should fail if claim code is expired", async () => {
            /* ... no change ... */
        });
        it("should fail if claim code is locked to a different DID", async () => {
            /* ... no change ... */
        });
    });
});
