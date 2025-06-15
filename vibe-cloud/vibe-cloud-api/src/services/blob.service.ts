// blob.service.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
import { InternalServerError, NotFoundError } from "elysia";
import { dataService } from "./data.service";
import type { BlobMetadata } from "../models/models";
import { BLOBS_COLLECTION } from "../models/models";

// --- Configuration ---
const s3Enabled = process.env.S3_ENABLED !== "false";
const s3Endpoint = process.env.S3_ENDPOINT; // e.g., 'https://s3.fr-par.scw.cloud'
const s3Region = process.env.S3_REGION; // e.g., 'fr-par'
const s3AccessKey = process.env.S3_ACCESS_KEY;
const s3SecretKey = process.env.S3_SECRET_KEY;
const s3BucketName = process.env.S3_BUCKET_NAME;

// Placeholder function to derive user-specific database name
// In a real implementation, this would be based on a consistent rule.
const getUserDbName = (userDid: string) => `userdata-${userDid.replace(/:/g, "-")}`;

export class BlobService {
    private s3Client!: S3Client;
    public readonly defaultBucketName: string = s3BucketName || "vibe-storage";
    private isS3Enabled: boolean = s3Enabled;

    constructor() {
        if (this.isS3Enabled) {
            if (!s3Endpoint || !s3Region || !s3AccessKey || !s3SecretKey || !s3BucketName) {
                logger.error(
                    "S3 is enabled, but one or more required environment variables (S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME) are missing."
                );
                throw new Error("S3 client configuration failed due to missing environment variables.");
            }
            try {
                this.s3Client = new S3Client({
                    endpoint: s3Endpoint,
                    region: s3Region,
                    credentials: {
                        accessKeyId: s3AccessKey,
                        secretAccessKey: s3SecretKey,
                    },
                });
                logger.info(`S3 client configured for endpoint: ${s3Endpoint}, region: ${s3Region}`);
            } catch (error) {
                logger.error("Failed to configure S3 client:", error);
                throw new Error("S3 client configuration failed.");
            }
        } else {
            logger.info("S3/Minio storage is DISABLED via S3_ENABLED=false environment variable.");
        }
    }

    /**
     * Generates a pre-signed URL for uploading an object to a specific collection.
     * The key is structured as {ownerDid}/{collectionName}/{objectId}-{originalFilename}.
     */
    async getPresignedUploadUrl(
        ownerDid: string,
        collectionName: string,
        originalFilename: string,
        contentType: string,
        expirySeconds: number = 300 // 5 minutes
    ): Promise<{ presignedUrl: string; objectKey: string }> {
        if (!this.isS3Enabled) {
            throw new Error("S3 storage functionality is currently disabled.");
        }

        const objectId = uuidv4();
        // Sanitize filename to prevent issues with special characters in the key
        const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const objectKey = `${ownerDid}/${collectionName}/${objectId}-${sanitizedFilename}`;

        const command = new PutObjectCommand({
            Bucket: this.defaultBucketName,
            Key: objectKey,
            ContentType: contentType,
        });

        try {
            logger.info(`Generating pre-signed upload URL for key "${objectKey}" in bucket "${this.defaultBucketName}"`);
            const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: expirySeconds });
            logger.info(`Successfully generated pre-signed upload URL for key "${objectKey}"`);
            return { presignedUrl, objectKey };
        } catch (error) {
            logger.error(`Error generating pre-signed upload URL for key "${objectKey}":`, error);
            throw new InternalServerError("Failed to generate upload URL.");
        }
    }

    /**
     * Creates a metadata document in CouchDB to finalize an upload.
     * This should be called after the client successfully PUTs the file to the pre-signed URL.
     */
    async finalizeUpload(
        objectKey: string,
        originalFilename: string,
        contentType: string,
        size: number,
        ownerDid: string,
        collectionName: string
    ): Promise<BlobMetadata> {
        if (!this.isS3Enabled) {
            throw new Error("S3 storage functionality is currently disabled.");
        }

        const metadata: Omit<BlobMetadata, "_rev"> = {
            _id: objectKey,
            originalFilename,
            contentType,
            size,
            ownerDid,
            collection: collectionName,
            uploadTimestamp: new Date().toISOString(),
            bucket: this.defaultBucketName,
            blobCollection: BLOBS_COLLECTION,
        };

        try {
            const dbName = getUserDbName(ownerDid);
            logger.info(`Creating blob metadata document for key "${objectKey}" in db "${dbName}"`);
            const response = await dataService.write(dbName, BLOBS_COLLECTION, metadata);
            logger.info(`Successfully created blob metadata for key "${objectKey}"`);

            const finalDoc = {
                ...metadata,
                _rev: Array.isArray(response) ? response[0].rev : response.rev,
            };
            return finalDoc;
        } catch (error) {
            logger.error(`Failed to create blob metadata for key "${objectKey}":`, error);
            logger.error(`ORPHAN ALERT: S3 object "${objectKey}" may exist without a metadata document.`);
            throw new InternalServerError("Failed to finalize blob upload.");
        }
    }

    /**
     * Generates a pre-signed URL for downloading an object from S3.
     */
    async getPresignedDownloadUrl(
        objectKey: string,
        expirySeconds: number = 3600 // 1 hour
    ): Promise<string> {
        if (!this.isS3Enabled) {
            throw new Error("S3 storage functionality is currently disabled.");
        }

        const command = new GetObjectCommand({
            Bucket: this.defaultBucketName,
            Key: objectKey,
        });

        try {
            logger.info(`Generating pre-signed download URL for key "${objectKey}"`);
            const url = await getSignedUrl(this.s3Client, command, { expiresIn: expirySeconds });
            logger.info(`Successfully generated pre-signed download URL for key "${objectKey}"`);
            return url;
        } catch (error: any) {
            logger.error(`Error generating pre-signed download URL for key "${objectKey}":`, error);
            if (error.name === "NoSuchKey") {
                throw new NotFoundError(`Object not found in storage: ${objectKey}`);
            }
            throw new InternalServerError("Failed to generate download URL.");
        }
    }

    /**
     * Deletes an object from S3 and its corresponding metadata from CouchDB.
     */
    async deleteObject(objectKey: string, ownerDid: string): Promise<void> {
        if (!this.isS3Enabled) {
            throw new Error("S3 storage functionality is currently disabled.");
        }

        const dbName = getUserDbName(ownerDid);

        // Step 1: Get metadata from CouchDB to get the _rev
        let metadata;
        try {
            metadata = await dataService.getDocument<BlobMetadata>(dbName, objectKey);
            if (!metadata._rev) {
                throw new InternalServerError("Metadata document is missing _rev, cannot delete.");
            }
        } catch (error) {
            if (error instanceof NotFoundError) {
                logger.warn(`Metadata document "${objectKey}" not found. Assuming it's already deleted.`);
                // We can still try to delete the S3 object just in case it's an orphan.
            } else {
                throw error; // Rethrow other errors
            }
        }

        // Step 2: Delete the object from S3
        const command = new DeleteObjectCommand({
            Bucket: this.defaultBucketName,
            Key: objectKey,
        });

        try {
            logger.info(`Attempting to delete S3 object "${objectKey}"...`);
            await this.s3Client.send(command);
            logger.info(`Successfully deleted S3 object "${objectKey}".`);
        } catch (error: any) {
            logger.error(`Error deleting S3 object "${objectKey}", but proceeding to delete metadata. Error:`, error);
        }

        // Step 3: Delete the metadata document from CouchDB if it was found
        if (metadata && metadata._rev) {
            try {
                logger.info(`Attempting to delete metadata document "${objectKey}"...`);
                await dataService.deleteDocument(dbName, objectKey, metadata._rev);
                logger.info(`Successfully deleted metadata document "${objectKey}".`);
            } catch (error: any) {
                if (error instanceof NotFoundError || (error.message && error.message.includes("conflict"))) {
                    logger.warn(`Metadata document "${objectKey}" was already deleted or had a revision conflict.`);
                } else {
                    logger.error(`Error deleting metadata document "${objectKey}":`, error);
                    throw new InternalServerError("Failed to delete object metadata.");
                }
            }
        }
    }
}

// Export a singleton instance
export const blobService = new BlobService();
