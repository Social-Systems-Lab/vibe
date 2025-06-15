import { Vibe } from ".";
import type { BlobMetadata, PresignedUploadRequest, PresignedUploadResponse, FinalizeUploadRequest } from "./types";

export class BlobManager {
    private vibe: Vibe;

    constructor(vibe: Vibe) {
        this.vibe = vibe;
    }

    private async request<T>(endpoint: string, method: "GET" | "POST" | "DELETE", body?: any): Promise<T> {
        if (!this.vibe.instanceUrl) {
            throw new Error("Vibe instance URL is not set. Cannot make API requests.");
        }
        if (!this.vibe.appId) {
            throw new Error("Vibe App ID is not set. Cannot make API requests.");
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.vibe.token}`,
            "X-Vibe-App-ID": this.vibe.appId,
        };
        if (body) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(`${this.vibe.instanceUrl}/api/v1/blob${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API request failed with status ${response.status}`);
        }

        if (response.status === 204) {
            return null as T;
        }

        return response.json();
    }

    async upload(collection: string, file: File): Promise<BlobMetadata> {
        // 1. Get presigned URL
        const presignedRequest: PresignedUploadRequest = {
            collectionName: collection,
            originalFilename: file.name,
            contentType: file.type,
        };
        const { presignedUrl, objectKey } = await this.request<PresignedUploadResponse>("/upload-url", "POST", presignedRequest);

        // 2. Upload file directly to S3
        const s3Response = await fetch(presignedUrl, {
            method: "PUT",
            body: file,
            headers: {
                "Content-Type": file.type,
            },
        });

        if (!s3Response.ok) {
            throw new Error(`Failed to upload file to S3. Status: ${s3Response.status}`);
        }

        // 3. Finalize upload
        const finalizeRequest: FinalizeUploadRequest = {
            objectKey,
            originalFilename: file.name,
            contentType: file.type,
            size: file.size,
            collectionName: collection,
        };
        const metadata = await this.request<BlobMetadata>("/finalize-upload", "POST", finalizeRequest);

        return metadata;
    }

    async getReadUrl(objectKey: string): Promise<string> {
        const response = await this.request<{ url: string }>(`/download-url/${objectKey}`, "GET");
        return response.url;
    }

    async delete(objectKey: string): Promise<void> {
        await this.request<void>(`/${objectKey}`, "DELETE");
    }
}
