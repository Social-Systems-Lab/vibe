# Vibe Cloud Layered Architecture Outline

Status: Draft · Purpose: Define a minimal inner core and iterative layers to accrete capabilities cleanly.

---

## Layered Overview

- Layer 0 — Core Kernel (MVP inner core)
  - Single `documents` store (PostgreSQL JSONB) with `id`, `type`, `owner_did`, timestamps, `data`.
  - Minimal ASP.NET Core API: `POST /documents`, `GET /documents`, `GET /documents/{id}`, `PUT /documents/{id}`, `DELETE /documents/{id}`.
  - Health checks, structured logging, ID generation (UUIDv7/ULID), request correlation.
  - Permissive access (dev mode) to unblock iteration; no ACLs yet.

- Layer 1 — Identity Context & RLS Scaffold
  - Establish `app.current_did` per-request/session.
  - Enable RLS with basic owner check (owner-only write/read), still flexible for public reads.
  - Token model and claims shape (JWT) defined, without consent screens.

- Layer 2 — Certificates, ACL Compiler, and Enforcement
  - Tables: `certificates`, `principal_certs`, `doc_acl_rules`, `doc_acl_index`.
  - Compiler job to materialize `doc_acl_index` from `documents.acl` and certificate validity.
  - Tighten RLS policies to consult `doc_acl_index` for `read`/`write`/`owner`.

- Layer 3 — References & Expansion
  - `doc_edges` for relationships; convenience expansions and reverse lookups.
  - Query patterns for authors, tags, parents, attachments.

- Layer 4 — Realtime Outbox & SignalR
  - `doc_outbox` for durable change events; dispatcher to SignalR hub.
  - Redis backplane for scale.

- Layer 5 — Projections & Search
  - Projection tables (e.g., `posts_projection`) for hot paths, full-text (`tsvector`).
  - Query optimization and selective indexing.

- Layer 6 — App Accounts, Quotas, Storage
  - App-scoped accounts, independent billing, quotas, object storage integration.
  - App-user grants and global analytics backends.

- Layer 7 — SDK & Developer Experience
  - TypeScript SDK alignment, OpenAPI, examples, local dev tooling.

- Layer 8 — Migration & Ops
  - CouchDB → Postgres migration tooling, observability, CI/CD hardening.

---

## Layer 0 — Inner Core Build Spec

### Goals

- Provide a minimal, production-viable document store and API with clean boundaries.
- Optimize for simplicity and iteration speed; defer ACLs, refs, realtime.

### Scope (strict)

- PostgreSQL with one table: `documents` and baseline BTREE indexes.
- ASP.NET Core API with CRUD endpoints and JSON payloads.
- Basic JWT parsing (optional in Layer 0); no consent or complex auth UX.
- Dockerized local environment; health checks; basic telemetry.

### Database DDL (minimal)

```sql
CREATE TABLE IF NOT EXISTS documents (
  id           uuid PRIMARY KEY,
  type         text NOT NULL,
  owner_did    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_documents_type       ON documents (type);
CREATE INDEX IF NOT EXISTS idx_documents_owner      ON documents (owner_did);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at DESC);

-- Optional in Layer 0: GIN on data (add when query patterns emerge)
-- CREATE INDEX IF NOT EXISTS idx_documents_data_gin ON documents USING GIN (data);
```

### API Endpoints (Layer 0)

- `POST /documents`
  - Body: `{ type: string, owner_did: string, data: object }`
  - Returns: created document with `id`.

- `GET /documents`
  - Query: `type?`, `owner_did?`, `limit?`, `cursor?`
  - Returns: list page of documents.

- `GET /documents/{id}`
  - Returns: document.

- `PUT /documents/{id}`
  - Body: `{ data: object }` (partial merge or replace; choose one for Layer 0)
  - Returns: updated document.

- `DELETE /documents/{id}`
  - Soft delete (`deleted_at` set); hard delete can be deferred.

### Service Design (ASP.NET Core)

- Project: `Vibe.Api` (Web API)
  - Controllers: `DocumentsController`
  - Services: `IDocumentService`, `DocumentService`
  - Persistence: `DocumentRepository` using Npgsql/EF Core
  - Cross-cutting: `RequestIdMiddleware`, `HealthChecks`, minimal logging

- Model (C#)
  - `Document { Guid Id; string Type; string OwnerDid; DateTime CreatedAt; DateTime UpdatedAt; DateTime? DeletedAt; JsonDocument Data; }`

### Acceptance Criteria

- Can create, list, fetch, update, and delete documents in Postgres.
- Handles JSONB `data` round-trip without loss; timestamps updated correctly.
- Returns 2xx/4xx/5xx appropriately; includes correlation ID in logs.
- Docker Compose runs API + Postgres locally; health checks pass.

### Layer 0 Work Plan

1. Bootstrap ASP.NET Core Web API project and solution.
2. Add Npgsql + EF Core; configure `documents` entity and migrations.
3. Implement `DocumentsController` with endpoints above.
4. Add simple paging (`limit`, `cursor` by `created_at` or `id`).
5. Wire health checks and basic structured logging.
6. Provide Docker Compose for local dev (`api`, `postgres`).
7. Add unit tests for `DocumentService` and repository.

### Non-Goals (Layer 0)

- No ACL/RLS enforcement beyond basic access; public development mode.
- No references (`doc_edges`), no realtime, no projections.
- No consent UX; tokens optional.

---

## Layer 1 — Identity Context & RLS Scaffold (Preview)

- Set `app.current_did` at request start.
- Enable RLS on `documents` with owner-based checks.
- Introduce JWT parsing and minimal claims (subject DID, app ID).

---

## Notes

- This outline intentionally keeps the inner core minimal to accelerate feedback.
- Later layers (ACL compiler, refs, realtime) match `PostgresDbDraft.md` and will be added once Layer 0 stabilizes.