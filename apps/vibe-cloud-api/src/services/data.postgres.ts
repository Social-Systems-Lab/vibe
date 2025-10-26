import { Pool } from "pg";
import { IdentityService } from "./identity";
import { GlobalFeedService } from "./global-feed";
import { Certificate, DocRef, Document as VibeDocument, ReadOnceApiResponse } from "vibe-core";
import { JwtPayload } from "./data";

type PostgresConfig = {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
};

export class PostgresDataService {
    private pool: Pool;
    private identityService: IdentityService;
    private globalFeedService: GlobalFeedService;

    constructor(cfg: PostgresConfig, identityService: IdentityService, globalFeedService: GlobalFeedService) {
        const connectionString = cfg.connectionString || process.env.PG_CONNECTION_STRING || undefined;
        this.pool = new Pool(
            connectionString
                ? { connectionString }
                : {
                      host: cfg.host || process.env.PGHOST,
                      port: cfg.port ? Number(cfg.port) : process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
                      database: cfg.database || process.env.PGDATABASE,
                      user: cfg.user || process.env.PGUSER,
                      password: cfg.password || process.env.PGPASSWORD,
                  }
        );
        this.identityService = identityService;
        this.globalFeedService = globalFeedService;
    }

    async init() {
        // Minimal DDL to get started
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id          text PRIMARY KEY,
          type        text NOT NULL,
          owner_did   text NOT NULL,
          created_at  timestamptz NOT NULL DEFAULT now(),
          updated_at  timestamptz NOT NULL DEFAULT now(),
          acl         jsonb NOT NULL DEFAULT '{}'::jsonb,
          data        jsonb NOT NULL DEFAULT '{}'::jsonb
        );
      `);
            await client.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
      `);
            await client.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_did);
      `);
            await client.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_data_gin ON documents USING GIN (data);
      `);

            await client.query(`
        CREATE TABLE IF NOT EXISTS doc_refs (
          gid        text PRIMARY KEY,
          type       text NOT NULL,
          owner_did  text NOT NULL,
          ref_id     text NOT NULL,
          acl        jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
            await client.query(`
        CREATE INDEX IF NOT EXISTS idx_doc_refs_type ON doc_refs(type);
      `);
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    private makeId(type: string, existingId?: string) {
        if (existingId) return existingId;
        const suffix = crypto.randomUUID();
        return `${type}/${suffix}`;
    }

    async write(type: string, data: any, user: JwtPayload, appOrigin?: string) {
        const items = Array.isArray(data) ? data : [data];
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            for (const item of items) {
                const id = this.makeId(type, item._id);
                const now = new Date();
                // Persist full original doc in data, but also keep type and acl for queries
                const docJson = { ...item, _id: id, type };
                await client.query(
                    `INSERT INTO documents(id, type, owner_did, created_at, updated_at, acl, data)
           VALUES ($1,$2,$3,$4,$4, COALESCE($5,'{}'::jsonb), COALESCE($6,'{}'::jsonb))
           ON CONFLICT (id) DO UPDATE SET
             type=EXCLUDED.type,
             owner_did=EXCLUDED.owner_did,
             updated_at=EXCLUDED.updated_at,
             acl=EXCLUDED.acl,
             data=EXCLUDED.data`,
                    [id, type, user.instanceId, now, item.acl || {}, docJson]
                );

                // Maintain a simple global ref for docs that have any ACL (public-ish)
                const hasAcl = item && item.acl && Object.keys(item.acl).length > 0;
                const gid = `${type}/${user.sub}/${id.split("/")[1]}`;
                if (hasAcl) {
                    await client.query(
                        `INSERT INTO doc_refs(gid, type, owner_did, ref_id, acl, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5, now(), now())
             ON CONFLICT (gid) DO UPDATE SET
               type=EXCLUDED.type,
               owner_did=EXCLUDED.owner_did,
               ref_id=EXCLUDED.ref_id,
               acl=EXCLUDED.acl,
               updated_at=now()`,
                        [gid, type, user.sub, id, item.acl || {}]
                    );
                    this.globalFeedService.publish(type, { did: user.sub, ref: id } as any);
                } else {
                    await client.query("DELETE FROM doc_refs WHERE gid = $1", [gid]);
                }
            }
            await client.query("COMMIT");
            return { ok: true };
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    async update(type: string, data: any, user: JwtPayload) {
        const items = Array.isArray(data) ? data : [data];
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            for (const item of items) {
                if (!item._id) throw new Error("Document must have an _id to be updated.");
                const id = item._id;
                // Ensure owner
                const { rows } = await client.query("SELECT owner_did FROM documents WHERE id=$1", [id]);
                if (!rows[0]) throw new Error("Not found");
                if (rows[0].owner_did !== user.instanceId) throw new Error("Forbidden");

                const now = new Date();
                const docJson = { ...item, type };
                await client.query(`UPDATE documents SET type=$2, updated_at=$3, acl=$4, data=$5 WHERE id=$1`, [
                    id,
                    type,
                    now,
                    item.acl || {},
                    docJson,
                ]);

                const hasAcl = item && item.acl && Object.keys(item.acl).length > 0;
                const gid = `${type}/${user.sub}/${id.split("/")[1]}`;
                if (hasAcl) {
                    await client.query(
                        `INSERT INTO doc_refs(gid, type, owner_did, ref_id, acl, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5, now(), now())
             ON CONFLICT (gid) DO UPDATE SET
               type=EXCLUDED.type,
               owner_did=EXCLUDED.owner_did,
               ref_id=EXCLUDED.ref_id,
               acl=EXCLUDED.acl,
               updated_at=now()`,
                        [gid, type, user.sub, id, item.acl || {}]
                    );
                    this.globalFeedService.publish(type, { did: user.sub, ref: id } as any);
                } else {
                    await client.query("DELETE FROM doc_refs WHERE gid = $1", [gid]);
                }
            }
            await client.query("COMMIT");
            return { ok: true };
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    async readOnce<T extends VibeDocument>(
        type: string,
        query: any,
        user: JwtPayload,
        appOrigin?: string
    ): Promise<ReadOnceApiResponse<T>> {
        const { global, limit, _id, ...rest } = query || {};
        const client = await this.pool.connect();
        try {
            if (global) {
                const { rows } = await client.query(
                    `SELECT gid, type, owner_did, ref_id, acl FROM doc_refs WHERE type=$1 ORDER BY updated_at DESC LIMIT $2`,
                    [type, Math.max(1, Math.min(Number(limit) || 500, 5000))]
                );
                const docs = rows.map((r) => ({
                    _id: r.gid,
                    ref: { did: r.owner_did, ref: r.ref_id },
                    acl: r.acl,
                })) as unknown as T[];
                return { docs };
            }

            // Local query by owner + type; support _id direct lookup and basic equality filters against data JSON
            const take = Math.max(1, Math.min(Number(limit) || 500, 5000));
            if (_id) {
                const { rows } = await client.query(`SELECT data FROM documents WHERE id=$1 AND owner_did=$2`, [
                    _id,
                    user.instanceId,
                ]);
                const doc = rows[0]?.data as T | undefined;
                return { docs: doc ? [doc] : [] };
            }

            // Build simple filter conditions from rest (equality on top-level and data->>'field')
            const clauses: string[] = ["owner_did = $1", "type = $2"];
            const values: any[] = [user.instanceId, type];
            let param = 2;
            Object.entries(rest || {}).forEach(([k, v]) => {
                if (v === undefined || v === null) return;
                param++;
                if (k.startsWith("data.")) {
                    const key = k.slice("data.".length);
                    clauses.push(`data->>$${param} = $${param + 1}`);
                    values.push(key, String(v));
                    param++;
                } else {
                    // try match top-level in data
                    clauses.push(`data->>$${param} = $${param + 1}`);
                    values.push(k, String(v));
                    param++;
                }
            });
            param++;
            const sql = `SELECT data FROM documents WHERE ${clauses.join(
                " AND "
            )} ORDER BY updated_at DESC LIMIT $${param}`;
            values.push(take);
            const { rows } = await client.query(sql, values);
            const docs = rows.map((r) => r.data as T);
            return { docs };
        } finally {
            client.release();
        }
    }

    async deleteById(id: string, user: JwtPayload) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const { rows } = await client.query("SELECT type FROM documents WHERE id=$1 AND owner_did=$2", [
                id,
                user.instanceId,
            ]);
            if (rows[0]) {
                const type = rows[0].type as string;
                await client.query("DELETE FROM documents WHERE id=$1 AND owner_did=$2", [id, user.instanceId]);
                const gid = `${type}/${user.sub}/${id.split("/")[1]}`;
                await client.query("DELETE FROM doc_refs WHERE gid=$1", [gid]);
            }
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    async deleteByStorageKey(storageKey: string, user: JwtPayload) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const { rows } = await client.query(
                `SELECT id, type FROM documents WHERE owner_did=$1 AND type='files' AND data->>'storageKey' = $2`,
                [user.instanceId, storageKey]
            );
            for (const r of rows) {
                const id = r.id as string;
                const type = r.type as string;
                await client.query("DELETE FROM documents WHERE id=$1 AND owner_did=$2", [id, user.instanceId]);
                const gid = `${type}/${user.sub}/${id.split("/")[1]}`;
                await client.query("DELETE FROM doc_refs WHERE gid=$1", [gid]);
            }
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    async listTypes(instanceId: string, limit: number): Promise<string[]> {
        const client = await this.pool.connect();
        try {
            const { rows } = await client.query(
                `SELECT DISTINCT type FROM documents WHERE owner_did=$1 ORDER BY type ASC LIMIT $2`,
                [instanceId, Math.max(1, Math.min(limit || 2000, 20000))]
            );
            return rows.map((r) => r.type as string);
        } finally {
            client.release();
        }
    }

    async getUserCertificates(instanceId: string): Promise<Certificate[]> {
        const client = await this.pool.connect();
        try {
            const { rows } = await client.query(`SELECT data FROM documents WHERE owner_did=$1 AND type='certs'`, [
                instanceId,
            ]);
            return rows.map((r) => r.data as Certificate);
        } finally {
            client.release();
        }
    }
}
