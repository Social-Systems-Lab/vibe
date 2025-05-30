// blob.service.ts
import * as Minio from "minio";
import { logger } from "../utils/logger";
import { Readable } from "stream";
import { InternalServerError } from "elysia"; // Import for consistency

// --- Types ---
interface UploadedObjectInfo {
    etag: string;
    versionId?: string | null;
}

// --- Configuration ---
const s3Enabled = process.env.S3_ENABLED !== "false"; // Defaults to true if not set or 'false'

const minioEndpoint = process.env.MINIO_ENDPOINT || "127.0.0.1";
const minioPort = parseInt(process.env.MINIO_PORT || "9000", 10);
const minioUseSSL = process.env.MINIO_USE_SSL === "true";
const minioAccessKey = process.env.MINIO_ACCESS_KEY || "minioadmin";
const minioSecretKey = process.env.MINIO_SECRET_KEY || "minioadmin";
const defaultBucketName = process.env.MINIO_BUCKET_NAME || "vibe-storage";

export class BlobService {
    private minioClient!: Minio.Client; // Definite assignment assertion, initialized if s3Enabled
    public readonly defaultBucketName: string = defaultBucketName;
    private initializationPromise: Promise<void> | null = null;
    private isS3Enabled: boolean = s3Enabled; // Store for easy access in methods

    constructor() {
        if (this.isS3Enabled) {
            try {
                this.minioClient = new Minio.Client({
                    endPoint: minioEndpoint,
                    port: minioPort,
                    useSSL: minioUseSSL,
                    accessKey: minioAccessKey,
                    secretKey: minioSecretKey,
                });
                logger.info(`Minio client configured for endpoint: ${minioEndpoint}:${minioPort}, SSL: ${minioUseSSL}`);
            } catch (error) {
                logger.error("Failed to configure Minio client:", error);
                throw new Error("Minio client configuration failed."); // Throw during construction
            }
        } else {
            logger.info("S3/Minio storage is DISABLED via S3_ENABLED=false environment variable.");
        }
    }

    /**
     * Initializes the service, ensuring the default bucket exists if S3 is enabled.
     * Should be called during application bootstrap.
     */
    async initialize(): Promise<void> {
        if (!this.isS3Enabled) {
            logger.info("S3/Minio is disabled, skipping bucket initialization.");
            return Promise.resolve();
        }

        // Ensure minioClient is initialized if S3 is enabled
        if (!this.minioClient) {
            logger.error("Minio client not initialized despite S3 being enabled. This indicates an issue in constructor logic or an unexpected state.");
            throw new Error("Minio client not initialized for S3 operations.");
        }

        // Prevent multiple initializations
        if (!this.initializationPromise) {
            this.initializationPromise = this._ensureBucketExists(this.defaultBucketName);
        }
        return this.initializationPromise;
    }

    /**
     * Ensures the specified bucket exists in Minio, creating it if necessary.
     * (Internal helper, public initialize calls this for the default bucket)
     * @param bucketName The name of the bucket to ensure exists.
     */
    private async _ensureBucketExists(bucketName: string): Promise<void> {
        // Note: isS3Enabled and minioClient presence is already checked by the initialize method before calling this.
        try {
            const exists = await this.minioClient.bucketExists(bucketName);
            if (!exists) {
                await this.minioClient.makeBucket(bucketName);
                logger.info(`Minio bucket "${bucketName}" created successfully.`);
            } else {
                logger.info(`Minio bucket "${bucketName}" already exists.`);
            }
        } catch (error) {
            logger.error(`Error ensuring Minio bucket "${bucketName}" exists:`, error);
            // Throw specific error for bootstrap phase
            throw new Error(`Failed to ensure Minio bucket "${bucketName}"`);
        }
    }

    /**
     * Uploads an object (file) to the specified Minio bucket.
     */
    async uploadObject(
        objectName: string,
        data: Buffer | Readable,
        size: number,
        contentType: string = "application/octet-stream",
        bucketName: string = this.defaultBucketName
    ): Promise<UploadedObjectInfo> {
        if (!this.isS3Enabled) {
            logger.warn(`Attempted to call uploadObject for "${objectName}" when S3 is disabled.`);
            throw new Error("S3 storage functionality is currently disabled.");
        }
        if (!this.minioClient) {
            // Should ideally be caught by isS3Enabled check
            throw new Error("Minio client not available for uploadObject.");
        }

        try {
            const metaData = { "Content-Type": contentType };
            logger.info(`Uploading object "${objectName}" to bucket "${bucketName}" (Size: ${size}, Type: ${contentType})`);
            const result = await this.minioClient.putObject(bucketName, objectName, data, size, metaData);
            logger.info(`Successfully uploaded object "${objectName}" to bucket "${bucketName}". ETag: ${result.etag}`);
            return result;
        } catch (error) {
            logger.error(`Error uploading object "${objectName}" to Minio bucket "${bucketName}":`, error);
            throw new InternalServerError(`Failed to upload object "${objectName}"`);
        }
    }

    /**
     * Generates a pre-signed URL for downloading an object from Minio.
     */
    async getPresignedDownloadUrl(
        objectName: string,
        bucketName: string = this.defaultBucketName,
        expirySeconds: number = 3600 // 1 hour default expiry
    ): Promise<string> {
        if (!this.isS3Enabled) {
            logger.warn(`Attempted to call getPresignedDownloadUrl for "${objectName}" when S3 is disabled.`);
            throw new Error("S3 storage functionality is currently disabled.");
        }
        if (!this.minioClient) {
            throw new Error("Minio client not available for getPresignedDownloadUrl.");
        }

        try {
            logger.info(`Generating pre-signed download URL for object "${objectName}" in bucket "${bucketName}" (Expiry: ${expirySeconds}s)`);
            const url = await this.minioClient.presignedGetObject(bucketName, objectName, expirySeconds);
            logger.info(`Successfully generated pre-signed URL for object "${objectName}"`);
            return url;
        } catch (error: any) {
            logger.error(`Error generating pre-signed download URL for object "${objectName}" in Minio bucket "${bucketName}":`, error);
            if (error.code === "NoSuchKey") {
                throw new Error(`Object not found in storage: ${objectName}`);
            }
            throw new InternalServerError(`Failed to generate download URL for object "${objectName}"`);
        }
    }

    /**
     * Deletes an object from the specified Minio bucket.
     */
    async deleteObject(objectName: string, bucketName: string = this.defaultBucketName): Promise<void> {
        if (!this.isS3Enabled) {
            logger.warn(`Attempted to call deleteObject for "${objectName}" when S3 is disabled.`);
            throw new Error("S3 storage functionality is currently disabled.");
        }
        if (!this.minioClient) {
            throw new Error("Minio client not available for deleteObject.");
        }

        try {
            logger.info(`Attempting to delete object "${objectName}" from bucket "${bucketName}"...`);
            await this.minioClient.removeObject(bucketName, objectName);
            logger.info(`Successfully deleted object "${objectName}" from bucket "${bucketName}".`);
        } catch (error: any) {
            if (error.code === "NoSuchKey") {
                logger.warn(`Object "${objectName}" not found in bucket "${bucketName}" during deletion (might already be deleted).`);
            } else {
                logger.error(`Error deleting object "${objectName}" from Minio bucket "${bucketName}":`, error.message || error);
                // Optional: throw new InternalServerError(`Failed to delete object "${objectName}"`);
            }
        }
    }
}

// Export a singleton instance
export const blobService = new BlobService();
