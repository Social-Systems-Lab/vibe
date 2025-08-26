import Nano from "nano";

export type Quota = {
  tier?: string;
  limit_bytes: number;
  burst_bytes?: number;
  used_bytes: number;
  reserved_bytes: number;
  updatedAt: string;
  reservations?: Record<string, { size: number; key: string; expiresAt: string }>;
};

function nowIso() {
  return new Date().toISOString();
}

function bytesFromMb(mb: number) {
  return Math.floor(mb * 1024 * 1024);
}

function uuid() {
  // Simple UUID v4 polyfill without external dep
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class QuotaService {
  private nano: Nano.ServerScope;
  private usersDb: Nano.DocumentScope<any>;

  private defaultLimitBytes: number;

  constructor() {
    const url = process.env.COUCHDB_URL!;
    const user = process.env.COUCHDB_USER!;
    const pass = process.env.COUCHDB_PASSWORD!;
    if (!url || !user || !pass) {
      throw new Error("QuotaService missing CouchDB env (COUCHDB_URL/USER/PASSWORD)");
    }
    this.nano = Nano(url);
    // Authenticate eagerly
    this.nano.auth(user, pass).catch(() => {
      // Will retry on first calls
    });
    this.usersDb = this.nano.db.use("users");

    const limitMb =
      Number(process.env.QUOTA_DEFAULT_LIMIT_MB) ||
      Number(process.env.LEVEL_BASE_CAP_MB) ||
      512;
    this.defaultLimitBytes = bytesFromMb(limitMb);
  }

  private async reauth() {
    try {
      await this.nano.auth(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
    } catch {
      // ignore
    }
  }

  private initQuotaIfMissing(userDoc: any): { updated: boolean } {
    if (!userDoc.quota || typeof userDoc.quota !== "object") {
      userDoc.quota = {
        limit_bytes: this.defaultLimitBytes,
        burst_bytes: 0,
        used_bytes: 0,
        reserved_bytes: 0,
        updatedAt: nowIso(),
        reservations: {},
      } as Quota;
      return { updated: true };
    }
    const q: Quota = userDoc.quota;
    let changed = false;
    if (typeof q.limit_bytes !== "number") {
      q.limit_bytes = this.defaultLimitBytes;
      changed = true;
    }
    if (typeof q.burst_bytes !== "number") {
      q.burst_bytes = 0;
      changed = true;
    }
    if (typeof q.used_bytes !== "number") {
      q.used_bytes = 0;
      changed = true;
    }
    if (typeof q.reserved_bytes !== "number") {
      q.reserved_bytes = 0;
      changed = true;
    }
    if (!q.reservations || typeof q.reservations !== "object") {
      q.reservations = {};
      changed = true;
    }
    if (changed) {
      q.updatedAt = nowIso();
    }
    return { updated: changed };
  }

  private async findUserByDid(did: string): Promise<any | null> {
    await this.reauth();
    const res = await this.usersDb.find({
      selector: { did },
      limit: 1,
    } as any);
    if (res.docs && res.docs.length > 0) return res.docs[0];
    return null;
  }

  private async casUpdateById(_id: string, mutate: (doc: any) => void | Promise<void>): Promise<any> {
    const maxRetries = 5;
    let lastErr: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.reauth();
        const current = await this.usersDb.get(_id);
        this.initQuotaIfMissing(current);
        await mutate(current);
        const res = await this.usersDb.insert(current);
        // attach new _rev
        (current as any)._rev = (res as any).rev || (res as any)._rev;
        return current;
      } catch (e: any) {
        lastErr = e;
        if (e.statusCode === 409) {
          await new Promise((r) => setTimeout(r, 50 * (i + 1)));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  private ensureCanReserve(q: Quota, size: number) {
    const limit = (q.limit_bytes || 0) + (q.burst_bytes || 0);
    const current = (q.used_bytes || 0) + (q.reserved_bytes || 0);
    if (current + size > limit) {
      const remaining = Math.max(0, limit - current);
      const err: any = new Error("quota_exceeded");
      err.code = "quota_exceeded";
      err.meta = { remaining, limit, used: q.used_bytes, reserved: q.reserved_bytes, requested: size };
      throw err;
    }
  }

  async reserve(userDid: string, instanceId: string, size: number, key: string, ttlSeconds = 1800): Promise<{ uploadId: string }> {
    if (!Number.isFinite(size) || size <= 0) {
      const err: any = new Error("invalid_size");
      err.code = "invalid_size";
      throw err;
    }
    const user = await this.findUserByDid(userDid);
    if (!user) {
      throw new Error("user_not_found");
    }
    const uploadId = uuid();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await this.casUpdateById(user._id, (doc) => {
      this.initQuotaIfMissing(doc);
      const q: Quota = doc.quota;
      this.ensureCanReserve(q, size);
      q.reserved_bytes += size;
      q.updatedAt = nowIso();
      if (!q.reservations) q.reservations = {};
      q.reservations[uploadId] = { size, key, expiresAt };
    });

    return { uploadId };
  }

  async commit(userDid: string, uploadId: string, actualSize: number): Promise<void> {
    const user = await this.findUserByDid(userDid);
    if (!user) throw new Error("user_not_found");
    await this.casUpdateById(user._id, (doc) => {
      const q: Quota = this.initQuotaIfMissing(doc) && (doc.quota as Quota);
      const resv = q.reservations?.[uploadId];
      const reservedSize = resv?.size || 0;
      q.reserved_bytes = Math.max(0, (q.reserved_bytes || 0) - reservedSize);
      q.used_bytes = Math.max(0, (q.used_bytes || 0) + (Number(actualSize) || 0));
      if (q.reservations) delete q.reservations[uploadId];
      q.updatedAt = nowIso();
    });
  }

  async release(userDid: string, uploadId: string): Promise<void> {
    const user = await this.findUserByDid(userDid);
    if (!user) return;
    await this.casUpdateById(user._id, (doc) => {
      const q: Quota = this.initQuotaIfMissing(doc) && (doc.quota as Quota);
      const resv = q.reservations?.[uploadId];
      const reservedSize = resv?.size || 0;
      q.reserved_bytes = Math.max(0, (q.reserved_bytes || 0) - reservedSize);
      if (q.reservations) delete q.reservations[uploadId];
      q.updatedAt = nowIso();
    });
  }

  async debit(userDid: string, size: number): Promise<void> {
    const user = await this.findUserByDid(userDid);
    if (!user) return;
    await this.casUpdateById(user._id, (doc) => {
      const q: Quota = this.initQuotaIfMissing(doc) && (doc.quota as Quota);
      q.used_bytes = Math.max(0, (q.used_bytes || 0) - (Number(size) || 0));
      q.updatedAt = nowIso();
    });
  }

  async usage(userDid: string): Promise<{ used_bytes: number; reserved_bytes: number; limit_bytes: number; burst_bytes: number; percent: number; tier?: string }> {
    const user = await this.findUserByDid(userDid);
    if (!user) {
      return { used_bytes: 0, reserved_bytes: 0, limit_bytes: this.defaultLimitBytes, burst_bytes: 0, percent: 0 };
    }
    const q: Quota = (user.quota || {}) as Quota;
    const used = q.used_bytes || 0;
    const resv = q.reserved_bytes || 0;
    const limit = (q.limit_bytes || this.defaultLimitBytes) + (q.burst_bytes || 0);
    const percent = limit > 0 ? Math.min(100, Math.round(((used + resv) / limit) * 100)) : 0;
    return {
      used_bytes: used,
      reserved_bytes: resv,
      limit_bytes: limit,
      burst_bytes: q.burst_bytes || 0,
      percent,
      tier: q.tier,
    };
  }
}
