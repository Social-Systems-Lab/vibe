import type { Adapter, AdapterPayload } from "oidc-provider";
import { ClientService } from "../services/client";

export class CustomOidcAdapter implements Adapter {
    constructor(private readonly clientService: ClientService) {}

    async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
        // The 'id' is a composite key like 'client:client-id' or 'session:session-id'.
        // We only care about storing clients.
        const [type, key] = id.split(":");
        if (type === "client") {
            await this.clientService.upsert(key, payload as any);
        }
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
        const [type, key] = id.split(":");
        if (type === "client") {
            const client = await this.clientService.find(key);
            if (client) {
                return {
                    ...client,
                    // oidc-provider expects a `destroy` method on the returned object
                    destroy: async () => this.destroy(id),
                } as AdapterPayload;
            }
        }
        return undefined;
    }

    async findByUserCode(userCode: string) {
        // Not implemented for this use case
        return undefined;
    }

    async findByUid(uid: string) {
        // Not implemented for this use case
        return undefined;
    }

    async destroy(id: string) {
        const [type, key] = id.split(":");
        if (type === "client") {
            await this.clientService.destroy(key);
        }
    }

    async revokeByGrantId(grantId: string) {
        // Not implemented for this use case
    }

    async consume(id: string) {
        // Not implemented for this use case
    }
}
