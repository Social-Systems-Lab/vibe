import * as Minio from "minio";
import { logger } from "../utils/logger";
import { Readable } from "stream";

// --- Types ---
// Define a simple interface for the object returned by putObject
interface UploadedObjectInfo {
    etag: string;
    versionId?: string | null;
}

// --- Configuration ---
const minioEndpoint = process.env.MINIO_ENDPOINT || "localhost";
const minioPort = parseInt(process.env.MINIO_PORT || "9000", 10);
const minioUseSSL = process.env.MINIO_USE_SSL === "true";
const minioAccessKey = process.env.MINIO_ACCESS_KEY || "minioadmin";
const minioSecretKey = process.env.MINIO_SECRET_KEY || "minioadmin";
const defaultBucketName = process.env.MINIO_BUCKET_NAME || "vibe-storage"; // Default bucket

// --- Minio Client Initialization ---
let minioClient: Minio.Client;
try {
    minioClient = new Minio.Client({
        endPoint: minioEndpoint,
        port: minioPort,
        useSSL: minioUseSSL,
        accessKey: minioAccessKey,
        secretKey: minioSecretKey,
    });
    logger.info(`Minio client initialized for endpoint: ${minioEndpoint}:${minioPort}, SSL: ${minioUseSSL}`);
} catch (error) {
    logger.error("Failed to initialize Minio client:", error);
    // Depending on the application's needs, you might want to exit or handle this differently
    process.exit(1); // Exit if Minio connection is critical
}

// --- Service Functions ---

/**
 * Ensures the specified bucket exists in Minio, creating it if necessary.
 * @param bucketName The name of the bucket to ensure exists.
 */
async function ensureBucketExists(bucketName: string = defaultBucketName): Promise<void> {
    try {
        const exists = await minioClient.bucketExists(bucketName);
        if (!exists) {
            await minioClient.makeBucket(bucketName);
            logger.info(`Minio bucket "${bucketName}" created successfully.`);
            // You might want to set a default policy here if needed, e.g., public read
            // await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
        } else {
            logger.info(`Minio bucket "${bucketName}" already exists.`);
        }
    } catch (error) {
        logger.error(`Error ensuring Minio bucket "${bucketName}" exists:`, error);
        throw new Error(`Failed to ensure Minio bucket "${bucketName}"`); // Re-throw for handling upstream
    }
}

/**
 * Uploads an object (file) to the specified Minio bucket.
 *
 * @param objectName The unique identifier for the object within the bucket (e.g., UUID).
 * @param data A Buffer or Readable stream containing the object's data.
 * @param size The total size of the object in bytes. Required for streams.
 * @param contentType The MIME type of the object (e.g., 'image/jpeg', 'application/pdf').
 * @param bucketName The name of the bucket to upload to (defaults to MINIO_BUCKET_NAME).
 * @returns A Promise resolving with the ETag and versionId of the uploaded object.
 */
async function uploadObject(
    objectName: string,
    data: Buffer | Readable,
    size: number, // Size is required by minioClient.putObject for streams
    contentType: string = "application/octet-stream",
    bucketName: string = defaultBucketName
): Promise<UploadedObjectInfo> {
    // Use the local interface
    try {
        const metaData = {
            "Content-Type": contentType,
            // Add any other custom metadata if needed, e.g., 'X-Amz-Meta-Uploader-Id': userId
        };
        logger.info(`Uploading object "${objectName}" to bucket "${bucketName}" (Size: ${size}, Type: ${contentType})`);
        const result = await minioClient.putObject(bucketName, objectName, data, size, metaData);
        logger.info(`Successfully uploaded object "${objectName}" to bucket "${bucketName}". ETag: ${result.etag}`);
        return result;
    } catch (error) {
        logger.error(`Error uploading object "${objectName}" to Minio bucket "${bucketName}":`, error);
        throw new Error(`Failed to upload object "${objectName}"`); // Re-throw for handling upstream
    }
}

/**
 * Generates a pre-signed URL for downloading an object from Minio.
 *
 * @param objectName The unique identifier of the object to download.
 * @param bucketName The name of the bucket containing the object (defaults to MINIO_BUCKET_NAME).
 * @param expirySeconds The duration (in seconds) for which the URL should be valid (default: 1 hour).
 * @returns A Promise resolving with the pre-signed download URL string.
 */
async function getPresignedDownloadUrl(
    objectName: string,
    bucketName: string = defaultBucketName,
    expirySeconds: number = 3600 // 1 hour default expiry
): Promise<string> {
    try {
        logger.info(`Generating pre-signed download URL for object "${objectName}" in bucket "${bucketName}" (Expiry: ${expirySeconds}s)`);
        const url = await minioClient.presignedGetObject(bucketName, objectName, expirySeconds);
        logger.info(`Successfully generated pre-signed URL for object "${objectName}"`);
        return url;
    } catch (error) {
        logger.error(`Error generating pre-signed download URL for object "${objectName}" in Minio bucket "${bucketName}":`, error);
        // Check if the error is specifically 'Object does not exist'
        if (error instanceof Error && "code" in error && error.code === "NoSuchKey") {
            throw new Error(`Object not found: ${objectName}`);
        }
        throw new Error(`Failed to generate download URL for object "${objectName}"`); // Re-throw generic error
    }
}

// --- Service Initialization ---
// Ensure the default bucket exists when the service loads
ensureBucketExists().catch((err) => {
    logger.error("Failed initial bucket check/creation:", err);
    // Decide if this is fatal or not
});

// --- Export Service ---
export const BlobService = {
    ensureBucketExists,
    uploadObject,
    getPresignedDownloadUrl,
    // Expose client directly if needed for advanced use cases, but generally prefer abstracted methods
    // client: minioClient
    defaultBucketName, // Export default bucket name for convenience
};
