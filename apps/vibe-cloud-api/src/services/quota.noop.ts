export class QuotaServiceNoop {
    async reserve(userDid: string, instanceId: string, size: number, key: string, ttlSeconds = 1800) {
        const uploadId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
        return { uploadId };
    }
    async commit(userDid: string, uploadId: string, actualSize: number) {
        return;
    }
    async release(userDid: string, uploadId: string) {
        return;
    }
    async debit(userDid: string, size: number) {
        return;
    }
    async usage(userDid: string) {
        return {
            used_bytes: 0,
            reserved_bytes: 0,
            limit_bytes: Number.POSITIVE_INFINITY,
            burst_bytes: 0,
            percent: 0,
        };
    }
}
