// // tests/auth.test.ts
// import { describe, it, expect, beforeAll, afterAll } from "bun:test";
// import { createTestCtx, authService, dataService, type TestCtx, permissionService } from "./test-context";
// import { logger } from "../src/utils/logger";
// import { SYSTEM_DB } from "../src/utils/constants";
// import { CLAIM_CODES_COLLECTION, USERS_COLLECTION, type ClaimCode, type User } from "../src/models/models";
// import { Buffer } from "buffer";
// import { randomUUID } from "crypto";

// // Helper function to create a DID from a public key (simple example)
// function createDidFromPubKey(pubKeyBytes: Uint8Array): string {
//     // Replace with your actual DID creation logic if different
//     return `did:vibe:test:${bytesToHex(pubKeyBytes.slice(0, 16))}`; // Example DID format
// }

// describe("Auth Service & Admin Claim", () => {
//     let testCtx: TestCtx; // Keep context for making API calls
//     let cleanup: () => Promise<void>;

//     // Use beforeAll to get API access via context
//     beforeAll(async () => {
//         const { ctx, cleanup: contextCleanup } = await createTestCtx();
//         testCtx = ctx;
//         cleanup = contextCleanup;
//     });

//     afterAll(async () => {
//         if (cleanup) await cleanup();
//     });

//     // // --- Test Admin Claim Flow ---
//     // describe("POST /api/v1/admin/claim", () => {
//     //     let claimCodeDocId: string;
//     //     let claimCodeValue: string;
//     //     let claimCodeRev: string | undefined;
//     //     let adminDid: string;
//     //     let adminPrivateKey: Uint8Array;
//     //     let adminPublicKey: Uint8Array;

//     //     beforeAll(async () => {
//     //         // 1. Generate keypair for the claiming admin DID
//     //         adminPrivateKey = generateKeyPair().secretKey;
//     //         adminPublicKey = await generateKeyPair().publicKey; // Use await if needed by your version
//     //         adminDid = createDidFromPubKey(adminPublicKey);

//     //         // 2. Create a claim code document directly for testing
//     //         claimCodeDocId = `test-claim-${randomUUID()}`;
//     //         claimCodeValue = `TESTCODE-${randomUUID()}`;
//     //         const newClaimCodeDoc: Omit<ClaimCode, "_rev"> = {
//     //             _id: claimCodeDocId,
//     //             code: claimCodeValue,
//     //             expiresAt: null,
//     //             forDid: null, // Allow any DID initially
//     //             spentAt: null,
//     //             collection: CLAIM_CODES_COLLECTION,
//     //         };
//     //         const createRes = await dataService.createDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, newClaimCodeDoc);
//     //         claimCodeRev = createRes.rev;
//     //         logger.info(`Created test claim code ${claimCodeDocId} with value ${claimCodeValue}`);
//     //     });

//     //     afterAll(async () => {
//     //         // Cleanup: Delete the test claim code and the created admin user
//     //         if (claimCodeDocId && claimCodeRev) {
//     //             try {
//     //                 await dataService.deleteDocument(SYSTEM_DB, claimCodeDocId, claimCodeRev);
//     //                 logger.info(`Cleaned up test claim code ${claimCodeDocId}`);
//     //             } catch (e: any) {
//     //                 // Might fail if test updated the rev, try fetching latest
//     //                 try {
//     //                     const doc = await dataService.getDocument(SYSTEM_DB, claimCodeDocId);
//     //                     if (doc._rev) await dataService.deleteDocument(SYSTEM_DB, claimCodeDocId, doc._rev);
//     //                 } catch (e2) {
//     //                     logger.error(`Error cleaning up test claim code ${claimCodeDocId}:`, e2);
//     //                 }
//     //             }
//     //         }
//     //         if (adminDid) {
//     //             try {
//     //                 await authService.deleteUser(adminDid); // This deletes user, db, perms
//     //                 logger.info(`Cleaned up test admin user ${adminDid}`);
//     //             } catch (e) {
//     //                 logger.error(`Error cleaning up test admin user ${adminDid}:`, e);
//     //             }
//     //         }
//     //     });

//     //     it("should successfully claim an admin account", async () => {
//     //         // 1. Sign the claim code with the admin's private key
//     //         const messageBytes = new TextEncoder().encode(claimCodeValue);
//     //         const signatureBytes = await sign(messageBytes, adminPrivateKey);
//     //         const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

//     //         // 2. Make the API call
//     //         const { data, error, status } = await testCtx.api.api.v1.admin.claim.post({
//     //             did: adminDid,
//     //             claimCode: claimCodeValue,
//     //             signature: signatureBase64,
//     //         });

//     //         // 3. Assert success
//     //         expect(status).toBe(201);
//     //         expect(error).toBeNull();
//     //         expect(data).toBeDefined();
//     //         expect(data?.message).toContain("claimed successfully");
//     //         expect(data?.userDid).toBe(adminDid);
//     //         expect(data?.isAdmin).toBe(true);
//     //         expect(data?.token).toBeTypeOf("string");

//     //         // 4. Verify claim code is marked as spent in DB
//     //         const spentClaimDoc = await dataService.getDocument<ClaimCode>(SYSTEM_DB, claimCodeDocId);
//     //         expect(spentClaimDoc.spentAt).toBeTypeOf("string");
//     //         expect(spentClaimDoc.claimedByDid).toBe(adminDid);
//     //         claimCodeRev = spentClaimDoc._rev; // Update rev for cleanup

//     //         // 5. Verify admin user exists in DB
//     //         const adminUserDoc = await dataService.getDocument<User>(SYSTEM_DB, adminDid);
//     //         expect(adminUserDoc.userDid).toBe(adminDid);
//     //         expect(adminUserDoc.isAdmin).toBe(true);

//     //         // 6. Verify admin user has direct permissions
//     //         const adminPerms = await permissionService.getUserDirectPermissions(adminDid);
//     //         expect(adminPerms).toContain("manage:permissions");
//     //         expect(adminPerms).toContain("read:*");
//     //         expect(adminPerms).toContain("write:*");
//     //     });

//     //     it("should fail if claim code is invalid", async () => {
//     //         const messageBytes = new TextEncoder().encode("invalid-code");
//     //         const signatureBytes = await sign(messageBytes, adminPrivateKey);
//     //         const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

//     //         const { data, error, status } = await testCtx.api.api.v1.admin.claim.post({
//     //             did: adminDid,
//     //             claimCode: "invalid-code",
//     //             signature: signatureBase64, // Signature is for wrong code, but code check happens first
//     //         });

//     //         expect(status).toBe(400);
//     //         expect(error?.value).toEqual({ error: "Invalid or unknown claim code." });
//     //     });

//     //     it("should fail if signature is invalid", async () => {
//     //         const messageBytes = new TextEncoder().encode(claimCodeValue);
//     //         // Sign with a *different* private key
//     //         const otherPrivateKey = generateKeyPair().secretKey;
//     //         const signatureBytes = await sign(messageBytes, otherPrivateKey);
//     //         const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

//     //         const { data, error, status } = await testCtx.api.api.v1.admin.claim.post({
//     //             did: adminDid, // Correct DID
//     //             claimCode: claimCodeValue, // Correct code
//     //             signature: signatureBase64, // INCORRECT signature
//     //         });

//     //         expect(status).toBe(400);
//     //         expect(error?.value).toEqual({ error: "Invalid signature." });
//     //     });

//     //     it("should fail if claim code is already spent", async () => {
//     //         // Assumes the first test successfully spent the code
//     //         const messageBytes = new TextEncoder().encode(claimCodeValue);
//     //         const signatureBytes = await sign(messageBytes, adminPrivateKey);
//     //         const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

//     //         const { data, error, status } = await testCtx.api.api.v1.admin.claim.post({
//     //             did: adminDid,
//     //             claimCode: claimCodeValue,
//     //             signature: signatureBase64,
//     //         });

//     //         expect(status).toBe(400);
//     //         expect(error?.value).toEqual({ error: "Claim code has already been used." });
//     //     });

//     //     // Add tests for expired codes, codes locked to different DIDs if needed
//     // });
// });
