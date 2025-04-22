import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { dataService } from "../src/services/data.service";
import { authService } from "../src/services/auth.service";
import { logger } from "../src/utils/logger";
import { Buffer } from "buffer";
import { didFromEd25519 } from "../src/utils/did.utils";

// --- Test Setup ---

// Use the existing test context if it provides the app instance
// Otherwise, import the app directly
import { app } from "../src/index"; // Assuming app is exported for testing

const CLAIM_CODES_DB = "claim_codes"; // Match constant in index.ts
const USERS_DB_NAME = "vibe_users"; // Match constant in auth.service.ts

// Create treaty client
const api = treaty(app);

// --- Helper Functions ---
async function generateTestDid(): Promise<{ did: string; publicKey: Uint8Array; privateKey: Uint8Array }> {
    const privateKey = generateKeyPair(); // Generates a random private key
    const publicKey = await generateKeyPair.getPublicKeyAsync(privateKey); // Derive public key
    const did = didFromEd25519(publicKey);
    return { did, publicKey, privateKey };
}

async function createClaimCodeDoc(doc: any): Promise<void> {
    try {
        // Use collection name "" for dedicated DB
        await dataService.createDocument(CLAIM_CODES_DB, "", doc);
    } catch (e: any) {
        // Ignore conflict if doc already exists from previous failed run
        if (e.statusCode !== 409) {
            logger.error("Test setup error creating claim code doc:", e);
            throw e;
        }
    }
}

async function cleanupClaimCodeDoc(docId: string): Promise<void> {
    try {
        const doc = await dataService.getDocument(CLAIM_CODES_DB, docId);
        if (doc && doc._rev) {
            await dataService.deleteDocument(CLAIM_CODES_DB, docId, doc._rev);
        }
    } catch (e: any) {
        // Ignore not found errors
        if (e.statusCode !== 404 && !e.message?.includes("not found")) {
            logger.error(`Test cleanup error deleting claim code ${docId}:`, e);
        }
    }
}

async function cleanupUser(userId: string): Promise<void> {
    try {
        // AuthService deleteUser handles deleting user doc and userdata- db
        await authService.deleteUser(userId);
    } catch (e: any) {
        logger.error(`Test cleanup error deleting user ${userId}:`, e);
    }
}

// --- Test Suite ---

describe("POST /api/v1/admin/claim", () => {
    let testDidData: { did: string; publicKey: Uint8Array; privateKey: Uint8Array };
    const validClaimCode = "VALID_TEST_CODE_123";
    const claimDocId = "TEST_CLAIM_VALID";
    let createdUserId: string | null = null; // To track created user for cleanup

    beforeAll(async () => {
        // Ensure services are connected (app startup should handle this, but belt-and-suspenders)
        if (!dataService.isInitialized()) {
            await dataService.connect();
        }
        await dataService.ensureDatabaseExists(CLAIM_CODES_DB);
        await dataService.ensureDatabaseExists(USERS_DB_NAME); // Ensure users DB exists

        // Generate one DID for the suite
        testDidData = await generateTestDid();
    });

    beforeEach(async () => {
        // Reset state before each test
        createdUserId = null;
        await cleanupClaimCodeDoc(claimDocId); // Clean up potential leftovers
        // Create a fresh, valid claim code document for most tests
        await createClaimCodeDoc({
            _id: claimDocId,
            code: validClaimCode,
            expiresAt: null,
            forDid: null,
            spentAt: null,
            type: "claim_code",
        });
    });

    afterEach(async () => {
        // Cleanup after each test
        await cleanupClaimCodeDoc(claimDocId);
        if (createdUserId) {
            await cleanupUser(createdUserId);
        }
        // Clean up other specific claim docs created in tests
        await cleanupClaimCodeDoc("TEST_CLAIM_SPENT");
        await cleanupClaimCodeDoc("TEST_CLAIM_EXPIRED");
        await cleanupClaimCodeDoc("TEST_CLAIM_LOCKED");
    });

    it("should successfully claim an admin account with a valid code, DID, and signature", async () => {
        const messageBytes = new TextEncoder().encode(validClaimCode);
        const signatureBytes = await sign(messageBytes, testDidData.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const { data, error, status } = await api.api.v1.admin.claim.post({
            did: testDidData.did,
            claimCode: validClaimCode,
            signature: signatureBase64,
        });

        expect(status).toBe(201);
        expect(error).toBeNull();
        expect(data).toBeDefined();
        expect(data?.message).toBe("Admin account claimed successfully.");
        expect(data?.userId).toBeTypeOf("string");
        expect(data?.isAdmin).toBe(true);
        expect(data?.token).toBeTypeOf("string");

        // Store userId for cleanup
        createdUserId = data?.userId ?? null;

        // Verify claim code is marked as spent in DB
        const spentClaimDoc = await dataService.getDocument<any>(CLAIM_CODES_DB, claimDocId);
        expect(spentClaimDoc.spentAt).toBeTypeOf("string");
        expect(spentClaimDoc.claimedByDid).toBe(testDidData.did);

        // Verify user exists in DB (optional, depends on authService internal details)
        // This requires fetching the user, potentially using an internal authService method if available
        // or querying the users DB directly if necessary.
        // For now, trust the 201 response indicates user creation.
    });

    it("should return 400 for an invalid (non-existent) claim code", async () => {
        const invalidClaimCode = "NON_EXISTENT_CODE";
        const messageBytes = new TextEncoder().encode(invalidClaimCode);
        const signatureBytes = await sign(messageBytes, testDidData.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const { data, error, status } = await api.api.v1.admin.claim.post({
            did: testDidData.did,
            claimCode: invalidClaimCode,
            signature: signatureBase64,
        });

        expect(status).toBe(400);
        expect(error?.value.error).toBe("Invalid or unknown claim code.");
        expect(data).toBeNull();
    });

    it("should return 400 for an already spent claim code", async () => {
        // Mark the claim code as spent first
        const spentClaimDocId = "TEST_CLAIM_SPENT";
        await createClaimCodeDoc({
            _id: spentClaimDocId,
            code: "SPENT_CODE",
            expiresAt: null,
            forDid: null,
            spentAt: new Date().toISOString(), // Mark as spent
            claimedByDid: "did:vibe:someotherdid",
            type: "claim_code",
        });

        const messageBytes = new TextEncoder().encode("SPENT_CODE");
        const signatureBytes = await sign(messageBytes, testDidData.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const { data, error, status } = await api.api.v1.admin.claim.post({
            did: testDidData.did,
            claimCode: "SPENT_CODE",
            signature: signatureBase64,
        });

        expect(status).toBe(400);
        expect(error?.value.error).toBe("Claim code has already been used.");
        expect(data).toBeNull();
        await cleanupClaimCodeDoc(spentClaimDocId); // Manual cleanup here
    });

    it("should return 400 for an expired claim code", async () => {
        const expiredClaimDocId = "TEST_CLAIM_EXPIRED";
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday
        await createClaimCodeDoc({
            _id: expiredClaimDocId,
            code: "EXPIRED_CODE",
            expiresAt: pastDate, // Expired
            forDid: null,
            spentAt: null,
            type: "claim_code",
        });

        const messageBytes = new TextEncoder().encode("EXPIRED_CODE");
        const signatureBytes = await sign(messageBytes, testDidData.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const { data, error, status } = await api.api.v1.admin.claim.post({
            did: testDidData.did,
            claimCode: "EXPIRED_CODE",
            signature: signatureBase64,
        });

        expect(status).toBe(400);
        expect(error?.value.error).toBe("Claim code has expired.");
        expect(data).toBeNull();
        await cleanupClaimCodeDoc(expiredClaimDocId); // Manual cleanup here
    });

    it("should return 400 if the claim code is locked to a different DID", async () => {
        const lockedClaimDocId = "TEST_CLAIM_LOCKED";
        const otherDidData = await generateTestDid(); // Generate a different DID
        await createClaimCodeDoc({
            _id: lockedClaimDocId,
            code: "LOCKED_CODE",
            expiresAt: null,
            forDid: otherDidData.did, // Locked to the other DID
            spentAt: null,
            type: "claim_code",
        });

        const messageBytes = new TextEncoder().encode("LOCKED_CODE");
        // Sign with the original test DID's key
        const signatureBytes = await sign(messageBytes, testDidData.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const { data, error, status } = await api.api.v1.admin.claim.post({
            did: testDidData.did, // Attempt claim with the original DID
            claimCode: "LOCKED_CODE",
            signature: signatureBase64,
        });

        expect(status).toBe(400);
        expect(error?.value.error).toBe("Claim code is not valid for the provided DID.");
        expect(data).toBeNull();
        await cleanupClaimCodeDoc(lockedClaimDocId); // Manual cleanup here
    });

    it("should return 400 for an invalid signature", async () => {
        const messageBytes = new TextEncoder().encode(validClaimCode);
        // Sign with a *different* key
        const otherDidData = await generateTestDid();
        const wrongSignatureBytes = await sign(messageBytes, otherDidData.privateKey);
        const wrongSignatureBase64 = Buffer.from(wrongSignatureBytes).toString("base64");

        const { data, error, status } = await api.api.v1.admin.claim.post({
            did: testDidData.did, // Correct DID
            claimCode: validClaimCode, // Correct code
            signature: wrongSignatureBase64, // Incorrect signature
        });

        expect(status).toBe(400);
        expect(error?.value.error).toBe("Invalid signature.");
        expect(data).toBeNull();
    });

    it("should return 400 for a malformed DID", async () => {
        const messageBytes = new TextEncoder().encode(validClaimCode);
        const signatureBytes = await sign(messageBytes, testDidData.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const { data, error, status } = await api.api.v1.admin.claim.post({
            did: "did:invalid:format", // Malformed DID
            claimCode: validClaimCode,
            signature: signatureBase64,
        });

        expect(status).toBe(400);
        // Error message comes from ed25519FromDid via the handler's catch block
        expect(error?.value.error).toContain("Signature verification failed:");
        expect(error?.value.error).toContain("Invalid did:vibe format");
        expect(data).toBeNull();
    });

    it("should return 400 for a malformed Base64 signature", async () => {
        const { data, error, status } = await api.api.v1.admin.claim.post({
            did: testDidData.did,
            claimCode: validClaimCode,
            signature: "this is not base64!", // Malformed signature
        });

        expect(status).toBe(400);
        // Error message comes from Buffer.from via the handler's catch block
        expect(error?.value.error).toContain("Signature verification failed:");
        // The exact error message might vary slightly based on Buffer implementation details
        expect(error?.value.error).toMatch(/invalid base64/i);
        expect(data).toBeNull();
    });

    // TODO: Add test for conflict when marking claim as spent (requires concurrent requests or mocking)
    // TODO: Add test for failure during user creation after successful claim spend (requires mocking authService)
    // TODO: Add test for failure during JWT signing after successful user creation (requires mocking jwt.sign)
});
