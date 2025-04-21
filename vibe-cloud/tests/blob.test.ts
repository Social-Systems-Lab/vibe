import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestCtx, type TestCtx } from "./test-context";
import { permissionService } from "../src/services/permission.service";
import { dataService } from "../src/services/data.service"; // To check metadata
import { BlobService } from "../src/services/blob.service"; // To potentially clean up
import { BLOB_METADATA_DB } from "../src/index"; // Import constant
import { logger } from "../src/utils/logger";

const minioEndpointForTest = process.env.MINIO_ENDPOINT || "127.0.0.1";
const minioPortForTest = parseInt(process.env.MINIO_PORT || "9000", 10);
const defaultBucketName = process.env.MINIO_BUCKET_NAME || "vibe-storage";
const escapedEndpoint = minioEndpointForTest.replace(/\./g, "\\.");
const expectedMinioUrlRegex = new RegExp(`^http://${escapedEndpoint}:${minioPortForTest}/${defaultBucketName}/`);

// Set up three test users with different permissions
// User 1: Has read and write permissions
const { ctx: ctx1, cleanup: cleanup1 } = await createTestCtx();
const { userId: userId1, token: token1 } = ctx1;
let user1Rev = ctx1.permsRev;

// User 2: Has only read permissions (for testing download by non-owner)
const { ctx: ctx2, cleanup: cleanup2 } = await createTestCtx();
const { userId: userId2, token: token2 } = ctx2;
let user2Rev = ctx2.permsRev;

// User 3: Has no blob permissions (for testing forbidden access)
const { ctx: ctx3, cleanup: cleanup3 } = await createTestCtx();
const { userId: userId3, token: token3 } = ctx3;

describe("Blob API (/api/v1/blob)", () => {
    // --- Setup ---
    beforeAll(async () => {
        // User 1: Has read and write permissions
        const { rev } = await permissionService.setPermissions(userId1, ["read:blobs", "write:blobs"], user1Rev);
        user1Rev = rev;

        // User 2: Has only read permissions (for testing download by non-owner)
        const { rev: rev2 } = await permissionService.setPermissions(userId2, ["read:blobs"], user2Rev);
        user2Rev = rev2;
    });

    // --- Teardown ---
    afterAll(async () => {
        // Clean up blob storage
        // 1. Clean up the uploaded blob (if it exists)
        if (uploadedObjectId) {
            let metadataRev: string | undefined = undefined;

            // a) Get metadata revision for deletion
            try {
                const metadata = await dataService.getDocument(BLOB_METADATA_DB, uploadedObjectId);
                metadataRev = metadata._rev;
            } catch (error: any) {
                // If metadata is already gone, just log and proceed
                if (error.message?.includes("not found")) {
                    logger.warn(`Metadata document ${uploadedObjectId} not found in ${BLOB_METADATA_DB} during cleanup (already deleted?).`);
                } else {
                    logger.error(`Error fetching metadata ${uploadedObjectId} during cleanup:`, error.message || error);
                }
            }

            // b) Delete metadata document (if revision was found)
            if (metadataRev) {
                try {
                    await dataService.deleteDocument(BLOB_METADATA_DB, uploadedObjectId, metadataRev);
                } catch (error: any) {
                    if (error.message?.includes("not found") || error.message?.includes("Revision conflict")) {
                        logger.warn(`Metadata document ${uploadedObjectId} deletion failed during cleanup (already deleted or conflict?): ${error.message}`);
                    } else {
                        logger.error(`Error deleting metadata document ${uploadedObjectId} during cleanup:`, error.message || error);
                    }
                }
            }

            // c) Delete Minio object
            try {
                await BlobService.deleteObject(uploadedObjectId); // Uses default bucket
                // Logger messages are inside BlobService.deleteObject now
            } catch (error: any) {
                // BlobService.deleteObject handles its own logging now
                logger.error(`Error occurred calling BlobService.deleteObject for ${uploadedObjectId} during cleanup:`, error.message || error);
            }
        } else {
            logger.warn("No uploadedObjectId found, skipping blob cleanup.");
        }

        // Clean up test users
        await cleanup1();
        await cleanup2();
        await cleanup3();
    });

    // --- Tests ---
    let uploadedObjectId: string | null = null;
    const testFileName = "test-blob.txt";
    const testFileContent = "This is the content of the test blob.";
    const testFileType = "text/plain";

    const testFile = new File([testFileContent], testFileName, { type: testFileType });

    it("should reject blob upload without 'write:blobs' permission (403)", async () => {
        const response = await ctx2.api.api.v1.blob.upload.post(
            { file: testFile },
            {
                headers: {
                    Authorization: `Bearer ${token2}`,
                },
            }
        );

        expect(response.status).toBe(403);
        expect(response.error?.value).toEqual({ error: "Forbidden: Missing 'write:blobs' permission." });
    });

    it("should upload a blob successfully with 'write:blobs' permission (201)", async () => {
        const response = await ctx1.api.api.v1.blob.upload.post(
            { file: testFile },
            {
                headers: {
                    Authorization: `Bearer ${token1}`, // User with write permission
                },
            }
        );

        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty("message", "File uploaded successfully.");
        expect(response.data).toHaveProperty("objectId");
        expect(response.data).toHaveProperty("filename", testFileName);
        expect(response.data?.contentType).toEqual(expect.stringContaining(testFileType));
        expect(response.data).toHaveProperty("size", testFileContent.length);

        if (response.data?.objectId) {
            uploadedObjectId = response.data.objectId;
        } else {
            // Fail fast if the objectId is missing after a 201 response
            throw new Error(`Upload returned 201 but objectId was missing: ${JSON.stringify(response.data)}`);
        }

        // Verify metadata in CouchDB
        const metadata = await dataService.getDocument(BLOB_METADATA_DB, uploadedObjectId!);
        expect(metadata).toBeDefined();
        expect(metadata).toMatchObject({
            _id: uploadedObjectId,
            originalFilename: testFileName,
            contentType: expect.stringContaining(testFileType),
            size: testFileContent.length,
            ownerId: userId1,
            bucket: BlobService.defaultBucketName,
        });
        expect(metadata).toHaveProperty("uploadTimestamp");
        expect(metadata).toHaveProperty("_rev");
    }, 15000); // <-- Increased timeout to 15 seconds (adjust if needed)

    it("should reject getting download URL for non-existent blob (404)", async () => {
        const nonExistentId = "non-existent-blob-id";
        const response = await ctx1.api.api.v1.blob.download({ objectId: nonExistentId }).get({
            headers: { Authorization: `Bearer ${token1}` }, // Owner's token
        });

        expect(response.status).toBe(404);
        // The exact error message comes from the NotFoundError thrown in the handler
        expect(response.error?.value).toEqual({ error: "Resource not found." });
    });

    it("should reject getting download URL without 'read:blobs' permission and not being owner (403)", async () => {
        expect(uploadedObjectId).toBeDefined(); // Ensure upload succeeded

        const response = await ctx3.api.api.v1.blob.download({ objectId: uploadedObjectId! }).get({
            headers: {
                Authorization: `Bearer ${token3}`, // Use user without read permission
            },
        });

        expect(response.status).toBe(403);
        // This error message comes from the Error thrown in the handler
        expect(response.error?.value).toEqual({ error: "Forbidden: You do not have permission to access this blob." });
    });

    it("should get a pre-signed download URL successfully as the owner (200)", async () => {
        expect(uploadedObjectId).toBeDefined();

        // Temporarily remove read permission from owner to test ownership bypass
        const { rev: tempRev } = await permissionService.setPermissions(userId1, ["write:blobs"], user1Rev); // Only write
        user1Rev = tempRev; // Update the stored rev

        const response = await ctx1.api.api.v1.blob.download({ objectId: uploadedObjectId! }).get({
            headers: { Authorization: `Bearer ${token1}` }, // Owner's token
        });

        try {
            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty("url");
            expect(response.data?.url).toMatch(expectedMinioUrlRegex);
            expect(response.data?.url).toContain(uploadedObjectId);
            expect(response.data?.url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
            expect(response.data?.url).toContain("X-Amz-Credential=");
            expect(response.data?.url).toContain("X-Amz-Expires=");
            expect(response.data?.url).toContain("X-Amz-SignedHeaders=host");
            expect(response.data?.url).toContain("X-Amz-Signature=");
        } finally {
            // Ensure permissions are restored even if assertions fail
            const { rev: tempRev2 } = await permissionService.setPermissions(userId1, ["read:blobs", "write:blobs"], user1Rev);
            user1Rev = tempRev2; // Update the stored rev
        }
    });

    it("should get a pre-signed download URL successfully with 'read:blobs' permission (non-owner) (200)", async () => {
        expect(uploadedObjectId).toBeDefined();

        // Use the user who only has 'read:blobs' permission
        const response = await ctx2.api.api.v1.blob.download({ objectId: uploadedObjectId }).get({
            headers: { Authorization: `Bearer ${token2}` }, // User with read permission
        });

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty("url");
        expect(response.data?.url).toMatch(expectedMinioUrlRegex);
        expect(response.data?.url).toContain(uploadedObjectId);
    });

    it("should allow downloading the blob content using the pre-signed URL", async () => {
        expect(uploadedObjectId).toBeDefined();

        // Get the URL first (as owner)
        const urlResponse = await ctx1.api.api.v1.blob.download({ objectId: uploadedObjectId }).get({
            headers: { Authorization: `Bearer ${token1}` },
        });
        expect(urlResponse.status).toBe(200);

        const downloadUrl = urlResponse.data?.url;
        expect(downloadUrl).toBeDefined();

        // Fetch the content from the pre-signed URL
        // Note: This fetch goes directly to Minio, bypassing our API/auth after URL generation
        try {
            const contentResponse = await fetch(downloadUrl!);
            expect(contentResponse.ok).toBe(true); // Check if the request was successful (2xx status)
            expect(contentResponse.status).toBe(200);
            const downloadedContent = await contentResponse.text();
            expect(downloadedContent).toBe(testFileContent);
            expect(contentResponse.headers.get("content-type")).toContain(testFileType);
            expect(contentResponse.headers.get("content-length")).toBe(String(testFileContent.length));
        } catch (error) {
            console.error("Error fetching pre-signed URL:", error);
            // Fail the test if fetch fails
            throw new Error("Fetching the pre-signed URL failed.");
        }
    });

    // TODO: Add test for attempting to download after URL expiry? (Requires mocking time or waiting)
});
