import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import * as Minio from "minio";

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

    async presignGet(bucket: string, key: string, _expiresSeconds?: number): Promise<PresignGetResult> {
        return { strategy: "public-or-server" };
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
        // prefer virtual-hosted style
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
            // Fallback if presigner package not available at runtime
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
}
