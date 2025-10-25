# Vibe Cloud Data Model Spec — PostgreSQL + JSONB

**Status:** Draft v1 · **Scope:** Modeling user/app data, document refs, and access control with PostgreSQL + JSONB; RLS; indexing; realtime; migration path from CouchDB.

---

## 1) Goals & Principles

-   **Emergent schema**: apps can define arbitrary types/fields without central migrations.
-   **Great queryability**: fast global and per-tenant queries; selective indexing.
-   **Secure multi-tenancy**: enforce at the database layer via **Row-Level Security (RLS)**.
-   **Simple reference model**: generic edges for relationships; no explosion of jx tables.
-   **Gradual optimization**: start with a single table; promote hot types to projections/read models later.
-   **Realtime-friendly**: clean path to publish updates to clients (SignalR/WebSockets) from DB changes.

---

## 2) Physical Layout

-   **One PostgreSQL database** for all users/apps.
-   **Single primary table** `documents` for all documents, plus a generic `doc_edges` for references.
-   **RLS** for isolation/authorization, driven by a precomputed ACL index table.
-   **Optionally partition** by `owner_did` (LIST/HASH) or by `type` (LIST), and/or by `created_at` (RANGE) when scale demands.

Why not DB-per-user?

-   Complicates pooling/backups/migrations and makes global discovery/analytics hard. Keep single DB with RLS; offer cluster-per-big-tenant only when required.

---

## 3) Core Tables (DDL sketch)

### 3.1 `documents`

The canonical store for all entities.

```sql
CREATE TABLE documents (
  id           uuid PRIMARY KEY,                    -- prefer ULID/UUIDv7 generated in app
  type         text NOT NULL,                       -- e.g. 'post', 'event', 'message', 'user_profile'
  owner_did    text NOT NULL,                       -- tenant/space/user key
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  acl          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- app-defined policy source
  data         jsonb NOT NULL DEFAULT '{}'::jsonb   -- app-defined fields
);

-- Core indexes
CREATE INDEX idx_documents_type         ON documents (type);
CREATE INDEX idx_documents_owner        ON documents (owner_did);
CREATE INDEX idx_documents_created_at   ON documents (created_at DESC);
CREATE INDEX idx_documents_updated_at   ON documents (updated_at DESC);

-- JSONB index options (choose one to start):
-- A) default GIN (flexible operators, larger)
CREATE INDEX idx_documents_data_gin ON documents USING GIN (data);
-- B) jsonb_path_ops (smaller/faster for @> containment, fewer operators)
-- CREATE INDEX idx_documents_data_gin ON documents USING GIN (data jsonb_path_ops);
```

**Targeted expression/partial indexes (add when proven by workload):**

```sql
-- Example: fast lookup by slug for posts only
CREATE INDEX idx_posts_slug
ON documents ((data->>'slug'))
WHERE type = 'post' AND data ? 'slug';

-- Example: uniqueness per owner
CREATE UNIQUE INDEX uq_owner_post_slug
ON documents (owner_did, (data->>'slug'))
WHERE type = 'post' AND data ? 'slug';
```

### 3.2 `doc_edges`

Generic references between documents (replaces many jx tables).

```sql
CREATE TABLE doc_edges (
  source_id    uuid    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field        text    NOT NULL,           -- e.g. 'author', 'parent', 'tags', 'attachments'
  target_id    uuid    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  rel_type     text    NOT NULL,           -- 'one' | 'many' | or app-defined ('authored_by', ...)
  ord          int     NOT NULL DEFAULT 0, -- order within arrays (tags, attachments)
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, field, target_id)
);

-- Indexes to support expansions and reverse lookups
CREATE INDEX idx_doc_edges_source_field_ord ON doc_edges (source_id, field, ord);
CREATE INDEX idx_doc_edges_target           ON doc_edges (target_id);
CREATE INDEX idx_doc_edges_field            ON doc_edges (field);

-- Optional partial index for very hot relations
-- CREATE INDEX idx_doc_edges_author ON doc_edges (source_id, ord) WHERE field = 'author';
```

### 3.3 Certificates & Principals

Model cryptographic entitlements held by users/apps.

```sql
CREATE TABLE certificates (
  cert_id     text PRIMARY KEY,     -- stable identifier/fingerprint
  issuer      text NOT NULL,
  cert_type   text NOT NULL,        -- e.g. 'member_v1', 'organizer_v1'
  not_before  timestamptz,
  not_after   timestamptz,
  revoked_at  timestamptz
);

CREATE TABLE principal_certs (
  principal_did text NOT NULL,
  cert_id       text NOT NULL REFERENCES certificates(cert_id) ON DELETE CASCADE,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_did, cert_id)
);

CREATE INDEX idx_principal_certs_principal ON principal_certs (principal_did);
```

### 3.4 Normalized ACL rules (optional but useful)

Keep human-readable ACL in `documents.acl` (JSONB), but also persist normalized rules for debugging and for compiling into the fast index.

```sql
CREATE TABLE doc_acl_rules (
  doc_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  rule_kind text NOT NULL,   -- 'public' | 'principal' | 'cert_type' | 'group' | etc.
  subject   text,            -- depends on rule_kind; e.g., principal DID, cert_type
  perm      text NOT NULL,   -- 'read' | 'write' | 'owner'
  constraints jsonb,
  PRIMARY KEY (doc_id, rule_kind, COALESCE(subject,''), perm)
);
```

### 3.5 Precomputed ACL index (for RLS)

A fast, materialized mapping of who may do what, factoring cert validity and revocations.

```sql
CREATE TABLE doc_acl_index (
  doc_id        uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  principal_did text NOT NULL,
  perm          text NOT NULL,   -- 'read' | 'write' | 'owner'
  expires_at    timestamptz,     -- earliest expiry of any enabling condition; NULL = no expiry
  PRIMARY KEY (doc_id, principal_did, perm)
);

CREATE INDEX idx_acl_index_principal_doc ON doc_acl_index (principal_did, doc_id);
CREATE INDEX idx_acl_index_doc_principal ON doc_acl_index (doc_id, principal_did);
```

### 3.6 Realtime Outbox (optional but recommended)

Durable change log for eventing to SignalR/WebSockets.

```sql
CREATE TABLE doc_outbox (
  id          bigserial PRIMARY KEY,
  doc_id      uuid NOT NULL,
  event_type  text NOT NULL,           -- 'created' | 'updated' | 'deleted' | 'edge_added' | ...
  payload     jsonb NOT NULL,          -- minimal info for consumers
  created_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_outbox_created ON doc_outbox (created_at);
```

---

## 4) Row-Level Security (RLS)

**Per-request context:** set the acting principal in the session (important with pooled connections).

```sql
-- At request start (via Npgsql): SELECT set_config('app.current_did', $1, true);
```

**Enable RLS** and keep policies sargable by depending only on `doc_acl_index` (plus simple public checks):

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_read ON documents
FOR SELECT
USING (
  (acl->>'visibility') = 'public'
  OR EXISTS (
    SELECT 1 FROM doc_acl_index ai
    WHERE ai.doc_id = id
      AND ai.principal_did = current_setting('app.current_did', true)
      AND ai.perm IN ('read','owner')
      AND (ai.expires_at IS NULL OR ai.expires_at > now())
  )
);

CREATE POLICY doc_write ON documents
FOR INSERT, UPDATE, DELETE
USING (
  EXISTS (
    SELECT 1 FROM doc_acl_index ai
    WHERE ai.doc_id = id
      AND ai.principal_did = current_setting('app.current_did', true)
      AND ai.perm IN ('write','owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM doc_acl_index ai
    WHERE ai.doc_id = id
      AND ai.principal_did = current_setting('app.current_did', true)
      AND ai.perm IN ('write','owner')
  )
);
```

**Why precompute?** Keeping joins to `principal_certs`/`certificates` _out_ of the policy makes it cheap and index-friendly. Revocation/expiry logic runs in the compiler job that updates `doc_acl_index`.

**Compiler triggers/jobs (high level):**

-   On `documents` insert/update (when `acl` changes), recompute `doc_acl_rules` and update `doc_acl_index` for affected principals.
-   On certificate issue/revoke/expire or principal membership changes, recompute impacted `doc_acl_index` rows.
-   Prefer **outbox + background worker** over heavy immediate triggers for throughput.

---

## 5) Reference Modeling & Queries

### Storing refs

-   Use `doc_edges` as the source of truth for relations. Optionally mirror single-valued pointers (like `authorId`) in `documents.data` for convenience, kept in sync by application/triggers.

### Common patterns

**Expand single author on posts**

```sql
SELECT p.id,
       p.created_at,
       p.data->>'title' AS title,
       a.id   AS author_id,
       a.data AS author
FROM documents p
LEFT JOIN LATERAL (
  SELECT a.*
  FROM doc_edges e
  JOIN documents a ON a.id = e.target_id
  WHERE e.source_id = p.id AND e.field = 'author'
  ORDER BY e.ord
  LIMIT 1
) a ON TRUE
WHERE p.type = 'post' AND p.deleted_at IS NULL;
```

**Expand many tags**

```sql
SELECT p.id,
       jsonb_agg(t.data->>'name' ORDER BY e.ord) AS tags
FROM documents p
JOIN doc_edges e ON e.source_id = p.id AND e.field = 'tags'
JOIN documents t ON t.id = e.target_id
WHERE p.type = 'post'
GROUP BY p.id;
```

**Reverse lookup: who references me?**

```sql
SELECT e.source_id, e.field
FROM doc_edges e
WHERE e.target_id = $1;
```

---

## 6) Promoting Hot Types (Projections / Read Models)

When a type becomes performance-critical (feeds, search), introduce a projection table maintained by triggers or a background projector.

```sql
CREATE TABLE posts_projection (
  id          uuid PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  owner_did   text NOT NULL,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,
  title       text,
  published   boolean,
  body_tsv    tsvector
);

CREATE INDEX idx_posts_owner_created ON posts_projection (owner_did, created_at DESC);
CREATE INDEX idx_posts_tsv ON posts_projection USING GIN (body_tsv);
```

Use the projection for read-heavy endpoints; keep `documents` authoritative for writes.

---

## 7) Indexing & Partitioning Strategy

**Baseline**

-   BTREE on `type`, `owner_did`, `created_at`, `updated_at`.
-   One GIN on `data` (choose default vs `jsonb_path_ops` per query patterns).
-   Add expression/partial indexes _on demand_ from `pg_stat_statements`.

**Edges**

-   `(source_id, field, ord)` for expansions, `(target_id)` for reverse lookups, `(field)` for broad scans.

**Partitioning (when needed)**

-   LIST/HASH by `owner_did` (tenant/space isolation) **or** LIST by `type`.
-   RANGE by `created_at` (monthly) for hot/cold management; consider BRIN for time-range scans.
-   Keep per-partition indexes small; monitor autovacuum.

**Maintenance**

-   Regularly prune unused indexes; `pg_repack`/`vacuumdb` as needed.
-   Watch GIN bloat; consider `fastupdate` tuning only if necessary.

---

## 8) Realtime Architecture

-   **Authoritative write** → `documents`/`doc_edges` → write a row to **`doc_outbox`** in the same transaction.
-   **Dispatcher** polls `doc_outbox` (or LISTEN/NOTIFY) and pushes messages to clients via **SignalR**.
-   For multi-node SignalR, use **Redis backplane**.
-   Use outbox `processed_at` for at-least-once delivery and idempotent consumers.

**Alternative**: PostgreSQL `LISTEN/NOTIFY` for light workloads (lower durability); outbox preferred as load grows.

---

## 9) .NET / EF Core Notes

-   Map JSONB columns and indexes via EF migrations; use Npgsql provider.
-   For advanced JSONB queries (`@>`, jsonpath), mix EF and hand-written SQL or Dapper.
-   Set `app.current_did` per request/transaction:

    -   Use `SET LOCAL app.current_did = :did;` at the start of a transaction, or
    -   `SELECT set_config('app.current_did', :did, true);` via Npgsql.

-   Use **Connection Multiplexing** carefully with session settings; prefer **per-request transactions** that set the context.
-   For horizontal SignalR scale, add **Redis backplane**.

---

## 10) Naming Conventions

-   **Tables**: `snake_case`, plural (e.g., `documents`, `doc_edges`, `doc_acl_index`).
-   **PK**: `id` (UUID/ULID/UUIDv7).
-   **FK**: `<table>_id`.
-   **Indexes**: `idx_<table>_<cols>`; unique: `uq_<table>_<cols>`.
-   **Junctions**: Prefer `doc_edges`. If classic jx needed, use `jx_<a>_<b>`.

---

## 11) Migration Plan (CouchDB → Postgres)

1. **Export** per-user docs; enrich with `owner_did`, `type`, timestamps, and `acl`.
2. **Load** into `documents` as-is; create `doc_edges` from Couch-style refs.
3. **Introduce RLS** (initially permissive) and ramp to strict.
4. **Build projections** for the hottest types (feeds/search) once patterns stabilize.
5. **Cut over** readers gradually; verify parity with temporary shadow reads.

---

## 12) Operational Checklist

-   Enable `pg_stat_statements`, `auto_explain` (sampled) in staging.
-   Backups + PITR; test restores.
-   Monitoring: connections, autovacuum, bloat, slow queries, CPU/IO.
-   Periodic index review & cleanup.
-   Security: limited roles, RLS tested, audit on critical tables.

---

## 13) Open Questions / Future Decisions

-   Should we adopt **owner-based partitioning** or **type-based** first when scale increases?
-   Do we want an **ACL compiler service** (outbox-driven) from day one, or start with lightweight triggers?
-   Standardize on **UUIDv7** for time-ordered IDs?
-   Introduce **tsvector** projections for full-text on posts/notes early?

---

## 14) “Start Here” — Minimal Implementation Steps

1. Apply DDL for `documents`, `doc_edges`, base indexes, and permissive RLS.
2. Implement a tiny API: `POST /docs`, `GET /docs?type=post`, `POST /docs/{id}/edges`.
3. Add SignalR hub and wire an **outbox** writer on mutations; write a background dispatcher.
4. Build one or two expression indexes based on actual queries (e.g., `posts.slug`).
5. Add ACL compiler (batch job) and tighten RLS to use `doc_acl_index`.
6. Introduce first projection (`posts_projection`) for feed/search speed.

---

**Appendix: Example `acl` JSONB**

```json
{
    "visibility": "restricted", // 'public' | 'restricted' | 'private'
    "rules": [
        { "kind": "principal", "subject": "did:alice", "perm": "owner" },
        { "kind": "cert_type", "subject": "member_v1", "perm": "read" }
    ]
}
```

**Compiler semantics (sketch):**

-   For each rule, expand to principals via `principal_certs` and certificate validity; write rows to `doc_acl_index` with `expires_at = min(not_after, revocation_time, doc_rule_expiry)`.
-   On revoke/expire, delete or update affected `doc_acl_index` rows.

---

_End of Spec v1_
