import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import * as Minio from "minio";

/**
 * Metadata passed alongside upload planning/commit.
 */
export type UploadMeta = {
    name?: string;
    mime?: string;
    size?: number;
    acl?: any | undefined;
    description?: string;
    tags?: string[] | undefined;
};

export interface PresignPutResult {
    bucket: string;
    key: string;
    url?: string; // only for providers that support URL presign (Scaleway)
    headers?: Record<string, string>;
    strategy: "presigned" | "server-upload";
}

export interface PresignGetResult {
    url?: string; // only for providers that support URL presign (Scaleway)
    strategy: "presigned" | "public-or-server";
}

export interface StorageProvider {
    upload(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
    getPublicURL(bucket: string, key: string): Promise<string>;
    delete(bucket: string, key: string): Promise<void>;
    presignPut?(bucket: string, key: string, contentType?: string, expiresSeconds?: number): Promise<PresignPutResult>;
    presignGet?(bucket: string, key: string, expiresSeconds?: number): Promise<PresignGetResult>;
    download(bucket: string, key: string): Promise<{ stream: ReadableStream<any>; contentType?: string; contentLength?: number }>;
    statObject?(bucket: string, key: string): Promise<{ size?: number; contentType?: string } | null>;
}

// Minimal sanitizers/validators used server-side
export function sanitizeText(input?: string, maxLen = 512): string | undefined {
    if (!input) return undefined;
    // Strip any HTML tags and trim
    const stripped = input.replace(/<[^>]*>/g, "").trim();
    if (!stripped) return undefined;
    return stripped.slice(0, maxLen);
}
export function sanitizeTags(tags?: string[], maxTags = 32, maxLen = 64): string[] | undefined {
    if (!tags || !Array.isArray(tags)) return undefined;
    const out = [];
    for (const t of tags) {
        if (typeof t !== "string") continue;
        const s = sanitizeText(t, maxLen);
        if (s) out.push(s);
        if (out.length >= maxTags) break;
    }
    return out.length ? out : undefined;
}
// Simple ACL shape validator: accept objects or arrays; default to undefined (private) if invalid
export function validateAclShape(acl: any): any | undefined {
    if (acl == null) return undefined;
    if (typeof acl === "object") return acl;
    return undefined;
}

export function coercePositiveNumber(n?: number): number | undefined {
    if (typeof n !== "number" || !isFinite(n) || n < 0) return undefined;
    return Math.floor(n);
}

// MinIO: no presign here (fallback to server-upload)
export class MinioStorageProvider implements StorageProvider {
    private client: Minio.Client;
    private config: Minio.ClientOptions;

    constructor(config: Minio.ClientOptions) {
        this.client = new Minio.Client(config);
        this.config = config;
    }

    async upload(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
        const bucketExists = await this.client.bucketExists(bucket);
        if (!bucketExists) {
            await this.client.makeBucket(bucket, this.config.region || "");
            const policy = {
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Principal: { AWS: ["*"] },
                        Action: ["s3:GetObject"],
                        Resource: [`arn:aws:s3:::${bucket}/*`],
                    },
                ],
            };
            await this.client.setBucketPolicy(bucket, JSON.stringify(policy));
        }
        await this.client.putObject(bucket, key, body, body.length, { "Content-Type": contentType });
    }

    async getPublicURL(bucket: string, key: string): Promise<string> {
        const port = this.config.port === 80 || this.config.port === 443 ? "" : `:${this.config.port}`;
        const protocol = this.config.useSSL ? "https" : "http";
        return `${protocol}://${this.config.endPoint}${port}/${bucket}/${key}`;
    }

    async delete(bucket: string, key: string): Promise<void> {
        await this.client.removeObject(bucket, key);
    }

    async presignPut(bucket: string, key: string, _contentType?: string, _expiresSeconds?: number): Promise<PresignPutResult> {
        return { bucket, key, strategy: "server-upload" };
    }

    async presignGet(bucket: string, key: string, expiresSeconds = 300): Promise<PresignGetResult> {
        // MinIO can generate time-limited URLs; treat as presigned
        const url = await this.client.presignedGetObject(bucket, key, expiresSeconds);
        return { url, strategy: "presigned" };
    }

    async download(bucket: string, key: string): Promise<{ stream: ReadableStream<any>; contentType?: string; contentLength?: number }> {
        const stat = await this.client.statObject(bucket, key);
        const stream = await this.client.getObject(bucket, key);
        return {
            stream: stream as any,
            contentType: stat.metaData?.["content-type"],
            contentLength: stat.size,
        };
    }

    async statObject(bucket: string, key: string): Promise<{ size?: number; contentType?: string } | null> {
        try {
            const stat = await this.client.statObject(bucket, key);
            return { size: stat.size, contentType: stat.metaData?.["content-type"] };
        } catch {
            return null;
        }
    }
}

// Scaleway: S3-compatible signing
export class ScalewayStorageProvider implements StorageProvider {
    private client: S3Client;
    private config: any;

    constructor(config: any) {
        this.client = new S3Client(config);
        this.config = config;
    }

    async upload(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            ACL: "public-read",
        });
        await this.client.send(command);
    }

    async getPublicURL(bucket: string, key: string): Promise<string> {
        const endpoint = this.config.endpoint?.replace(/^https?:\/\//, "");
        return `https://${bucket}.${endpoint}/${key}`;
    }

    async delete(bucket: string, key: string): Promise<void> {
        const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
        await this.client.send(command);
    }

    async presignPut(bucket: string, key: string, contentType?: string, expiresSeconds = 300): Promise<PresignPutResult> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
            const cmd = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                ContentType: contentType,
                ACL: "public-read",
            });
            const signedUrl: string = await getSignedUrl(this.client as any, cmd as any, { expiresIn: expiresSeconds });
            return {
                bucket,
                key,
                url: signedUrl,
                headers: contentType ? { "Content-Type": contentType } : undefined,
                strategy: "presigned",
            };
        } catch {
            return { bucket, key, strategy: "server-upload" };
        }
    }

    async presignGet(bucket: string, key: string, expiresSeconds = 300): Promise<PresignGetResult> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
            const cmd = new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            });
            const signedUrl: string = await getSignedUrl(this.client as any, cmd as any, { expiresIn: expiresSeconds });
            return { url: signedUrl, strategy: "presigned" };
        } catch {
            return { strategy: "public-or-server" };
        }
    }

    async download(bucket: string, key: string): Promise<{ stream: ReadableStream<any>; contentType?: string; contentLength?: number }> {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        const response = await this.client.send(command);
        return {
            stream: response.Body as ReadableStream<any>,
            contentType: response.ContentType,
            contentLength: response.ContentLength,
        };
    }
}

export class StorageService {
    private provider: StorageProvider;

    constructor(provider: StorageProvider) {
        this.provider = provider;
    }

    async upload(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
        return this.provider.upload(bucket, key, body, contentType);
    }

    async getPublicURL(bucket: string, key: string): Promise<string> {
        return this.provider.getPublicURL(bucket, key);
    }

    async delete(bucket: string, key: string): Promise<void> {
        return this.provider.delete(bucket, key);
    }

    async presignPut(bucket: string, key: string, contentType?: string, expiresSeconds?: number): Promise<PresignPutResult> {
        if (!this.provider.presignPut) return { bucket, key, strategy: "server-upload" };
        return this.provider.presignPut(bucket, key, contentType, expiresSeconds);
    }

    async presignGet(bucket: string, key: string, expiresSeconds?: number): Promise<PresignGetResult> {
        if (!this.provider.presignGet) return { strategy: "public-or-server" };
        return this.provider.presignGet(bucket, key, expiresSeconds);
    }

    async download(bucket: string, key: string): Promise<{ stream: ReadableStream<any>; contentType?: string; contentLength?: number }> {
        return this.provider.download(bucket, key);
    }

    async statObject(bucket: string, key: string): Promise<{ size?: number; contentType?: string } | null> {
        if (!this.provider.statObject) return null;
        return this.provider.statObject(bucket, key);
    }

    /**
     * Verify that the object exists in storage by using statObject or attempting presignGet.
     * Returns a minimal info object if available.
     */
    async verifyObjectExists(bucket: string, key: string): Promise<{ size?: number; contentType?: string } | null> {
        if (this.provider.statObject) {
            return this.provider.statObject(bucket, key);
        }
        try {
            await this.presignGet(bucket, key, 60);
            return {};
        } catch {
            return null;
        }
    }
}
