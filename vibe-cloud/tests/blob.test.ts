// tests/blob.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestCtx, type TestCtx } from "./test-context";
// Import singletons from index.ts
import { permissionService, dataService, blobService } from "../src/index";
import { SYSTEM_DB } from "../src/utils/constants"; // Import constants
import { logger } from "../src/utils/logger";
import { BLOBS_COLLECTION, type BlobMetadata } from "../src/models/models"; // Import type

// --- Test Setup ---

// User 1: Will have read/write blob permissions
let ctx1: TestCtx, cleanup1: () => Promise<void>;
let userDid1: string, token1: string, appId1: string;

// User 2: Will have only read blob permissions
let ctx2: TestCtx, cleanup2: () => Promise<void>;
let userDid2: string, token2: string, appId2: string;

// User 3: Will have no blob permissions
let ctx3: TestCtx, cleanup3: () => Promise<void>;
let userDid3: string, token3: string, appId3: string;

// Global variable for the uploaded blob ID in this test suite
type UUID = `${string}-${string}-${string}-${string}-${string}`;
let uploadedObjectId: UUID | null = null;

// Regex for validating Minio presigned URL structure
const minioEndpointForTest = process.env.MINIO_ENDPOINT || "127.0.0.1";
const minioPortForTest = parseInt(process.env.MINIO_PORT || "9000", 10);
const defaultBucketName = process.env.MINIO_BUCKET_NAME || "vibe-storage";
const escapedEndpoint = minioEndpointForTest.replace(/\./g, "\\.");
const expectedMinioUrlRegex = new RegExp(`^http://${escapedEndpoint}:${minioPortForTest}/${defaultBucketName}/`);

describe("Blob API (/api/v1/blob)", () => {
    beforeAll(async () => {
        logger.info("Setting up Blob test contexts...");
        // Create contexts
        ({ ctx: ctx1, cleanup: cleanup1 } = await createTestCtx());
        userDid1 = ctx1.userDid;
        token1 = ctx1.token;
        appId1 = ctx1.appId;

        ({ ctx: ctx2, cleanup: cleanup2 } = await createTestCtx());
        userDid2 = ctx2.userDid;
        token2 = ctx2.token;
        appId2 = ctx2.appId;

        ({ ctx: ctx3, cleanup: cleanup3 } = await createTestCtx());
        userDid3 = ctx3.userDid;
        token3 = ctx3.token;
        appId3 = ctx3.appId;

        // Adjust direct permissions using the imported singleton service
        // User 1: Should already have read/write from createTestCtx, verify or set explicitly
        logger.debug(`Setting User 1 (${userDid1}) direct permissions: read/write`);
        await permissionService.setUserDirectPermissions(userDid1, [`read:${BLOBS_COLLECTION}`, `write:${BLOBS_COLLECTION}`]);

        // User 2: Grant only read
        logger.debug(`Setting User 2 (${userDid2}) direct permissions: read-only`);
        await permissionService.setUserDirectPermissions(userDid2, [`read:${BLOBS_COLLECTION}`]);

        // User 3: Grant no blob permissions (ensure empty array)
        logger.debug(`Setting User 3 (${userDid3}) direct permissions: none`);
        await permissionService.setUserDirectPermissions(userDid3, []);

        logger.info("Blob test contexts setup complete.");
    });

    afterAll(async () => {
        logger.info("Cleaning up Blob test contexts and resources...");
        // Clean up blob storage first
        if (uploadedObjectId) {
            logger.debug(`Cleaning up blob ${uploadedObjectId}...`);
            let metadata: BlobMetadata | undefined = undefined;
            try {
                metadata = await dataService.getDocument<BlobMetadata>(SYSTEM_DB, uploadedObjectId);
            } catch (error: any) {
                if (!error.message?.includes("not found")) {
                    // Log only unexpected errors
                    logger.error(`Error fetching metadata ${uploadedObjectId} during cleanup:`, error.message || error);
                }
            }

            if (metadata?._rev) {
                try {
                    await dataService.deleteDocument(SYSTEM_DB, metadata._id, metadata._rev);
                    logger.debug(`Deleted metadata document ${uploadedObjectId}`);
                } catch (error: any) {
                    if (!error.message?.includes("not found") && !error.message?.includes("conflict")) {
                        logger.error(`Error deleting metadata document ${uploadedObjectId} during cleanup:`, error.message || error);
                    }
                }
            }

            try {
                // Use the imported singleton blobService
                await blobService.deleteObject(uploadedObjectId);
                logger.debug(`Deleted blob object ${uploadedObjectId} from storage.`);
            } catch (error: any) {
                logger.error(`Error calling blobService.deleteObject for ${uploadedObjectId} during cleanup:`, error.message || error);
            }
        } else {
            logger.warn("No uploadedObjectId found, skipping blob resource cleanup.");
        }

        // Clean up test users (calls authService.deleteUser which handles user, db, perms)
        await Promise.all([
            cleanup1().catch((e) => logger.error(`Cleanup failed for user 1: ${e}`)),
            cleanup2().catch((e) => logger.error(`Cleanup failed for user 2: ${e}`)),
            cleanup3().catch((e) => logger.error(`Cleanup failed for user 3: ${e}`)),
        ]);
        logger.info("Blob test cleanup complete.");
    });

    // Helper to create headers for authenticated requests
    // Note: App ID doesn't strictly matter for blob permissions (checked against user's direct perms),
    // but we include it for consistency with the API middleware requirements.
    const getHeaders = (token: string, appId: string) => {
        return {
            Authorization: `Bearer ${token}`,
            "X-Vibe-App-ID": appId,
        };
    };

    // --- Test Data ---
    const testFileName = "test-blob.txt";
    const testFileContent = "This is the content of the test blob.";
    const testFileType = "text/plain";
    const testFile = new File([testFileContent], testFileName, { type: testFileType });

    // --- Upload Tests ---

    it("POST /upload: should reject blob upload without 'write:blobs' direct permission (403)", async () => {
        // Use User 3 (no permissions)
        const { data, error, status } = await ctx3.api.api.v1.blob.upload.post({ file: testFile }, { headers: getHeaders(token3, appId3) });

        expect(status).toBe(403);
        expect(error?.value as any).toEqual({ error: `Forbidden: Missing 'write:${BLOBS_COLLECTION}' permission.` });
    });

    it("POST /upload: should reject blob upload with only 'read:blobs' direct permission (403)", async () => {
        // Use User 2 (read-only)
        const { data, error, status } = await ctx2.api.api.v1.blob.upload.post({ file: testFile }, { headers: getHeaders(token2, appId2) });

        expect(status).toBe(403);
        expect(error?.value as any).toEqual({ error: `Forbidden: Missing 'write:${BLOBS_COLLECTION}' permission.` });
    });

    it("POST /upload: should upload a blob successfully with 'write:blobs' direct permission (201)", async () => {
        // Use User 1 (read/write)
        const { data, error, status } = await ctx1.api.api.v1.blob.upload.post({ file: testFile }, { headers: getHeaders(token1, appId1) });

        expect(status).toBe(201);
        expect(error).toBeNull();
        expect(data).toBeDefined();
        expect(data?.message).toBe("File uploaded successfully.");
        expect(data?.objectId).toBeTypeOf("string");
        expect(data?.filename).toBe(testFileName);
        expect(data?.contentType).toContain(testFileType); // Use toContain for flexibility
        expect(data?.size).toBe(testFileContent.length);

        uploadedObjectId = data!.objectId ?? null; // Store for subsequent tests and cleanup
        expect(uploadedObjectId).toBeDefined();
        let metadataDocId = `${BLOBS_COLLECTION}/${uploadedObjectId!}`;

        // Verify metadata in CouchDB (SYSTEM_DB)
        const metadata = await dataService.getDocument<BlobMetadata>(SYSTEM_DB, metadataDocId);
        expect(metadata).toBeDefined();
        expect(metadata).toMatchObject({
            _id: metadataDocId,
            originalFilename: testFileName,
            contentType: expect.stringContaining(testFileType),
            size: testFileContent.length,
            ownerDid: userDid1, // Check owner is the uploading user
            bucket: blobService.defaultBucketName, // Check bucket name
            collection: BLOBS_COLLECTION, // Check collection field
        });
        expect(metadata).toHaveProperty("uploadTimestamp");
        expect(metadata).toHaveProperty("_rev");
    }, 15000); // Increased timeout for potential upload delay

    // --- Download Tests ---

    it("GET /download/:objectId: should reject getting download URL for non-existent blob (404)", async () => {
        const nonExistentId = "non-existent-blob-id-123";
        // Use any authenticated user
        const { data, error, status } = await ctx1.api.api.v1.blob.download({ objectId: nonExistentId }).get({
            headers: getHeaders(token1, appId1),
        });

        expect(status).toBe(404);
        expect(error?.value).toEqual({ error: `Document with id "blobs/${nonExistentId}" not found.` });
    });

    it("GET /download/:objectId: should reject getting download URL without ownership or 'read:blobs' direct permission (403)", async () => {
        expect(uploadedObjectId).toBeDefined(); // Ensure upload succeeded

        // Use User 3 (no permissions)
        const { data, error, status } = await ctx3.api.api.v1.blob.download({ objectId: uploadedObjectId! }).get({
            headers: getHeaders(token3, appId3),
        });

        expect(status).toBe(403);
        expect(error?.value).toEqual({ error: "Forbidden: You do not have permission to access this blob." });
    });

    it("GET /download/:objectId: should get URL successfully as the owner (even without explicit read perm) (200)", async () => {
        expect(uploadedObjectId).toBeDefined();

        // Temporarily remove direct read permission from owner to test ownership bypass
        logger.debug(`Temporarily removing read perm for owner ${userDid1}`);
        const tempRes = await permissionService.setUserDirectPermissions(userDid1, [`write:${BLOBS_COLLECTION}`]); // Only write
        const tempRev = tempRes.rev;
        logger.debug(`Read perm removed, new rev ${tempRev}`);

        try {
            // Use User 1 (owner)
            const { data, error, status } = await ctx1.api.api.v1.blob.download({ objectId: uploadedObjectId! }).get({
                headers: getHeaders(token1, appId1),
            });

            expect(status).toBe(200);
            expect(error).toBeNull();
            expect(data).toHaveProperty("url");
            expect(data?.url).toMatch(expectedMinioUrlRegex);
            expect(data?.url).toContain(uploadedObjectId);
            // Check for common presigned URL components
            expect(data?.url).toContain("X-Amz-Algorithm=");
            expect(data?.url).toContain("X-Amz-Credential=");
            expect(data?.url).toContain("X-Amz-Expires=");
            expect(data?.url).toContain("X-Amz-Signature=");
        } finally {
            // Ensure permissions are restored
            logger.debug(`Restoring read perm for owner ${userDid1}, rev ${tempRev}`);
            await permissionService.setUserDirectPermissions(userDid1, [`read:${BLOBS_COLLECTION}`, `write:${BLOBS_COLLECTION}`]);
            logger.debug(`Read perm restored`);
        }
    });

    it("GET /download/:objectId: should get URL successfully with 'read:blobs' direct permission (non-owner) (200)", async () => {
        expect(uploadedObjectId).toBeDefined();

        // Use User 2 (non-owner, but has read:blobs)
        const { data, error, status } = await ctx2.api.api.v1.blob.download({ objectId: uploadedObjectId! }).get({
            headers: getHeaders(token2, appId2),
        });

        expect(status).toBe(200);
        expect(error).toBeNull();
        expect(data).toHaveProperty("url");
        expect(data?.url).toMatch(expectedMinioUrlRegex);
        expect(data?.url).toContain(uploadedObjectId);
    });

    it("GET /download/:objectId: should allow downloading content using the pre-signed URL", async () => {
        expect(uploadedObjectId).toBeDefined();

        // Get the URL first (as owner)
        const urlResponse = await ctx1.api.api.v1.blob.download({ objectId: uploadedObjectId! }).get({
            headers: getHeaders(token1, appId1),
        });
        expect(urlResponse.status).toBe(200);
        const downloadUrl = urlResponse.data?.url;
        expect(downloadUrl).toBeTypeOf("string");

        // Fetch the content directly from Minio using the URL
        try {
            logger.debug(`Attempting to fetch pre-signed URL: ${downloadUrl!.substring(0, 100)}...`);
            const contentResponse = await fetch(downloadUrl!);
            expect(contentResponse.ok).toBe(true);
            expect(contentResponse.status).toBe(200);
            const downloadedContent = await contentResponse.text();
            expect(downloadedContent).toBe(testFileContent);
            expect(contentResponse.headers.get("content-type")).toContain(testFileType);
            expect(contentResponse.headers.get("content-length")).toBe(String(testFileContent.length));
            logger.debug(`Successfully fetched content from pre-signed URL.`);
        } catch (error) {
            logger.error("Error fetching pre-signed URL:", error);
            throw new Error(`Fetching the pre-signed URL failed: ${error}`);
        }
    }, 10000); // Timeout for the fetch call
});
