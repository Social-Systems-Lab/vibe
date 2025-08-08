# Quick take

-   **pgvector (on managed Postgres)** → simplest ops, transactional with your sidecar, good enough up to the low–tens of millions of vectors and moderate QPS. Great for v0.1 + lazy embedding.
-   **Qdrant** → purpose‑built ANN with better tail latency, payload filtering, quantization, and easier horizontal scaling when you push >10–20M vectors/space or need aggressive budgets/throughput.

# When pgvector wins

-   You want **one datastore** for sidecar rows + ANN and **ACID** around index updates.
-   Total vectors/space ≤ \~10–20M, dim ≤ 1536–3072, and **QPS in the hundreds** not thousands.
-   You’re fine with **HNSW/IVF** inside Postgres and can tune RAM/maintenance (ANALYZE/VACUUM, autovacuum settings).
-   Dev speed > absolute performance. (Fewer moving parts, backups and DR you already know.)

### Minimal pgvector layout

```sql
-- schema: vibe_semantic
CREATE TABLE idx_core (
  key          TEXT PRIMARY KEY,       -- "collection/_id"
  tenant       TEXT NOT NULL,
  acl_digest   BYTEA NOT NULL,         -- for prefilter
  cert_refs    JSONB NOT NULL,         -- small array of cert ids
  boosts       JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  vec          VECTOR(1536) NOT NULL
);

-- HNSW (best recall), filter on tenant/acl_digest first
CREATE INDEX ON idx_core USING hnsw (vec vector_ip_ops);
CREATE INDEX ON idx_core (tenant);
CREATE INDEX ON idx_core (acl_digest);
```

-   Keep vectors in **their own schema**; sidecar metadata in normal tables.
-   Store `space` as a separate table or one table per space (simpler ops to start).
-   Use Postgres full‑text for the **lexical prefilter**; it’s “good enough” for warmup.

# When Qdrant wins

-   You need **predictable P95/P99** and **higher insert rates** (lazy embedding backfills hard).
-   **Payload filtering & indexing** on many fields (tenant, certs, tags) with minimal SQL overhead.
-   **Quantization/compaction** (scalar/PQ) to shrink RAM/SSD footprint without DIY.
-   **Horizontal scaling** (sharding/replication) and snapshot‑based restores with less DBA tuning.

### Qdrant mapping

-   One **collection per space** (`core`, `code`, etc.).
-   Payload: `{ key, tenant, acl_digest, cert_refs, boosts, content_hash }`.
-   HNSW params tunable per collection; enable scalar/PQ quantization as you grow.
-   Use its **filtering** for pre‑ACL gate; keep your lexical prefilter in Postgres or a separate search service.

# Hybrid plan I’d ship

1. **Define an interface now**

    ```ts
    interface VectorStore {
        upsert(space: string, items: Array<{ key: string; vec: number[]; payload: any }>): Promise<void>;
        delete(space: string, keys: string[]): Promise<void>;
        search(space: string, queryVec: number[], k: number, filter?: PayloadFilter): Promise<Result[]>;
    }
    ```

    Implement `PgVectorStore` first; keep a feature flag for `QdrantStore`.

2. **Data ownership**

    - **Source of truth** for “what should exist” = your **sidecar table** in Postgres.
    - ANN (pgvector/Qdrant) is **derived**; rebuildable from sidecar + cold vectors.

3. **Operational guardrails**

    - Batch upserts (e.g., 256–1024 vectors/batch).
    - Separate **writer** and **reader** connections/pools.
    - Nightly `VACUUM/ANALYZE` on pgvector tables; watch **bloat**.
    - In Qdrant, snapshot before big re‑embeds; set reasonable `max_search_params` and quantization only after measuring recall.

# Simple decision rules (sanity checks)

-   **< 8M vectors/space, < 500 QPS, 1536 dims** → pgvector is perfect.
-   **8–30M vectors/space or > 500–1k QPS** and you care about P95 → consider Qdrant.
-   **> 30M vectors/space** or many concurrent re-embeds/promotions → Qdrant (or another specialized vector DB).

# Migration notes

-   Keep **`content_hash`** and **`space`** in the sidecar; ANN rows reference by `key`.
-   Build a **dual‑write** period (pgvector + Qdrant) gated by a flag.
-   Run **shadow searches** and compare recall/latency before cutover.
-   Flip reads by space with a routing rule: `spaceRouter['core'] = 'pgvector' | 'qdrant'`.
