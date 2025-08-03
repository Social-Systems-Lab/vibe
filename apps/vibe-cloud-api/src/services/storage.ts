import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { S3RequestPresigner } from "@aws-sdk/s3-request-presigner";
// Local lightweight HttpRequest to avoid depending on @aws-sdk/protocol-http
type HeaderBag = Record<string, string>;
class AwsHttpRequest {
    protocol: string;
    hostname: string;
    method: string;
    path: string;
    headers: HeaderBag;
    port?: number;
    query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
    constructor(init: {
        protocol: string;
        hostname: string;
        method: string;
        path: string;
        headers?: HeaderBag;
        port?: number;
        query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
    }) {
        this.protocol = init.protocol;
        this.hostname = init.hostname;
        this.method = init.method;
        this.path = init.path;
        this.headers = init.headers || {};
        this.port = init.port;
        this.query = init.query;
    }
}
import * as Minio from "minio";

// Minimal Sha256 wrapper using SubtleCrypto; falls back to Node crypto if available
class Sha256 {
    private toHash: Uint8Array[] = [];
    constructor(secret?: Uint8Array) {
        if (secret) this.toHash.push(secret);
    }
    update(data: Uint8Array) {
        this.toHash.push(data);
    }
    async digest(): Promise<Uint8Array> {
        const combined = new Uint8Array(this.toHash.reduce((sum, a) => sum + a.length, 0));
        let offset = 0;
        for (const chunk of this.toHash) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        // Prefer globalThis.crypto; fallback to node:crypto
        if (typeof (globalThis as any).crypto?.subtle?.digest === "function") {
            const buf = await (globalThis as any).crypto.subtle.digest("SHA-256", combined);
            return new Uint8Array(buf);
        } else {
            const nodeCrypto = await import("crypto");
            const hash = nodeCrypto.createHash("sha256");
            hash.update(Buffer.from(combined));
            return new Uint8Array(hash.digest());
        }
    }
}

// Small local formatter to avoid bringing extra dependency
const formatUrl = (req: AwsHttpRequest) => {
    const qp = req.query
        ? "?" +
          Object.entries(req.query)
              .flatMap(([k, v]) =>
                  Array.isArray(v)
                      ? v.map((vv) => `${encodeURIComponent(k)}=${encodeURIComponent(String(vv))}`)
                      : `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
              )
              .join("&")
        : "";
    const port = req.port ? `:${req.port}` : "";
    return `${req.protocol}//${req.hostname}${port}${req.path}${qp}`;
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
        // Build a signed URL for PUT using AWS SDK v3 low-level presigner
        const endpoint = this.config.endpoint?.startsWith("http") ? this.config.endpoint : `https://${this.config.endpoint}`;
        const url = new URL(endpoint);
        // virtual-hosted style
        const hostname = `${bucket}.${url.hostname}`;
        const request = new AwsHttpRequest({
            protocol: url.protocol,
            hostname,
            method: "PUT",
            path: `/${key}`,
            headers: {
                host: hostname,
                ...(contentType ? { "content-type": contentType } : {}),
            },
        });

        const presigner = new S3RequestPresigner({ ...this.client.config, sha256: Sha256 } as any);
        const signed = await presigner.presign(request, { expiresIn: expiresSeconds });
        return {
            bucket,
            key,
            url: formatUrl(signed),
            headers: contentType ? { "Content-Type": contentType } : undefined,
            strategy: "presigned",
        };
    }

    async presignGet(bucket: string, key: string, expiresSeconds = 300): Promise<PresignGetResult> {
        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
            const cmd = new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            });
            const urlSigned = await getSignedUrl(this.client as any, cmd as any, { expiresIn: expiresSeconds });
            return { url: urlSigned, strategy: "presigned" };
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
