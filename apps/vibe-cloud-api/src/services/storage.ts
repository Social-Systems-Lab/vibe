import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as Minio from "minio";

export interface StorageProvider {
    upload(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
    getPublicURL(bucket: string, key: string): Promise<string>;
    delete(bucket: string, key: string): Promise<void>;
}

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
}

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
        return `https://${bucket}.${this.config.endpoint}/${key}`;
    }

    async delete(bucket: string, key: string): Promise<void> {
        const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
        await this.client.send(command);
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
}
