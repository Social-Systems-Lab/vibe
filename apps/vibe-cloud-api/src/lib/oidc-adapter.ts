import type { Adapter, AdapterPayload } from "oidc-provider";
import { StorageService } from "../services/storage";

export class CustomOidcAdapter implements Adapter {
    constructor(private readonly storageService: StorageService) {}

    async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
        await this.storageService.upsert(id, {
            ...payload,
            ...(expiresIn && { exp: Date.now() + expiresIn * 1000 }),
        });
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
        const doc = await this.storageService.find(id);
        if (doc) {
            if (doc.exp && doc.exp < Date.now()) {
                await this.destroy(id);
                return undefined;
            }
            return doc;
        }
        return undefined;
    }

    async findByUserCode(userCode: string) {
        // This is not something we need for our use case
        return undefined;
    }

    async findByUid(uid: string) {
        // This is not something we need for our use case
        return undefined;
    }

    async destroy(id: string) {
        await this.storageService.destroy(id);
    }

    async revokeByGrantId(grantId: string) {
        // This is not something we need for our use case
    }

    async consume(id: string) {
        const doc = await this.storageService.find(id);
        if (doc) {
            doc.consumed = Date.now();
            await this.storageService.upsert(id, doc);
        }
    }
}
