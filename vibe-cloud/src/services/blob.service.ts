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
// Keep configuration constants at the module level
const minioEndpoint = process.env.MINIO_ENDPOINT || "127.0.0.1";
const minioPort = parseInt(process.env.MINIO_PORT || "9000", 10);
const minioUseSSL = process.env.MINIO_USE_SSL === "true";
const minioAccessKey = process.env.MINIO_ACCESS_KEY || "minioadmin";
const minioSecretKey = process.env.MINIO_SECRET_KEY || "minioadmin";
const defaultBucketName = process.env.MINIO_BUCKET_NAME || "vibe-storage";

export class BlobService {
    private minioClient: Minio.Client;
    public readonly defaultBucketName: string = defaultBucketName;
    private initializationPromise: Promise<void> | null = null;

    constructor() {
        try {
            this.minioClient = new Minio.Client({
                endPoint: minioEndpoint,
                port: minioPort,
                useSSL: minioUseSSL,
                accessKey: minioAccessKey,
                secretKey: minioSecretKey,
            });
            logger.info(`Minio client configured for endpoint: ${minioEndpoint}:${minioPort}, SSL: ${minioUseSSL}`);
            // Defer bucket check until initialize is called
        } catch (error) {
            logger.error("Failed to configure Minio client:", error);
            throw new Error("Minio client configuration failed."); // Throw during construction
        }
    }

    /**
     * Initializes the service, ensuring the default bucket exists.
     * Should be called during application bootstrap.
     */
    async initialize(): Promise<void> {
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
        bucketName: string = this.defaultBucketName // Use instance property
    ): Promise<UploadedObjectInfo> {
        try {
            const metaData = { "Content-Type": contentType };
            logger.info(`Uploading object "${objectName}" to bucket "${bucketName}" (Size: ${size}, Type: ${contentType})`);
            const result = await this.minioClient.putObject(bucketName, objectName, data, size, metaData);
            logger.info(`Successfully uploaded object "${objectName}" to bucket "${bucketName}". ETag: ${result.etag}`);
            return result;
        } catch (error) {
            logger.error(`Error uploading object "${objectName}" to Minio bucket "${bucketName}":`, error);
            // Use Elysia error for consistency in request handling context
            throw new InternalServerError(`Failed to upload object "${objectName}"`);
        }
    }

    /**
     * Generates a pre-signed URL for downloading an object from Minio.
     */
    async getPresignedDownloadUrl(
        objectName: string,
        bucketName: string = this.defaultBucketName, // Use instance property
        expirySeconds: number = 3600 // 1 hour default expiry
    ): Promise<string> {
        try {
            logger.info(`Generating pre-signed download URL for object "${objectName}" in bucket "${bucketName}" (Expiry: ${expirySeconds}s)`);
            const url = await this.minioClient.presignedGetObject(bucketName, objectName, expirySeconds);
            logger.info(`Successfully generated pre-signed URL for object "${objectName}"`);
            return url;
        } catch (error: any) {
            logger.error(`Error generating pre-signed download URL for object "${objectName}" in Minio bucket "${bucketName}":`, error);
            if (error.code === "NoSuchKey") {
                // Throw NotFoundError (or let DataService handle metadata not found first)
                throw new Error(`Object not found in storage: ${objectName}`); // More specific than InternalServerError
            }
            throw new InternalServerError(`Failed to generate download URL for object "${objectName}"`);
        }
    }

    /**
     * Deletes an object from the specified Minio bucket.
     */
    async deleteObject(
        objectName: string,
        bucketName: string = this.defaultBucketName // Use instance property
    ): Promise<void> {
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
