# Vibe v2 (Minimal) — Spec and Plan

Status: Draft for green‑field bootstrap inside current monorepo

Goal

- Stand up a minimal, Postgres‑backed Vibe stack with the smallest set of features to log in, consent, obtain an access token, read/write a simple document type, and render it in a demo app. No Couch/Pouch, no hub data path. Keep hub only if needed for silent login later.

Non‑Goals (for v2‑minimal)

- Row Level Security, ACL compiler, certificates, file uploads, renderers/managers, global projections, migrations from Couch.

Outcomes

- New “v2” projects live alongside current code and can run independently.
- One end‑to‑end flow works: App → authorize → consent (first time) → token → /users/me → read/write `notes`.

Repo Layout (new)

- apps/
  - vibe-api-v2/ (Bun + Elysia or Node + Fastify; this spec assumes Bun + Elysia for speed)
  - vibe-ui-v2/ (Next.js minimal app)
- packages/
  - vibe-sdk-v2/ (TS SDK with direct API + simple auth)
- infra/
  - dev-v2/docker-compose.yml (postgres + pgadmin; optional minio later)

Environment

- Postgres 16+. Local via docker-compose.
- JWT signing secret: `JWT_SECRET` (HS256). Access tokens carry `sub` (user did) and `instanceId` claim.
- Cookie: `vibe_session` (HttpOnly, SameSite=None, Secure) stores refresh/session identifier.

Database (DDL — minimal)

```sql
CREATE TABLE IF NOT EXISTS users (
  did                 text PRIMARY KEY,
  email               text UNIQUE NOT NULL,
  password_hash       text NOT NULL,
  display_name        text,
  instance_id         text NOT NULL,
  public_key          text NOT NULL,
  encrypted_private_key text NOT NULL,
  key_enc_version     int  NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  did         text NOT NULL,
  hash        text PRIMARY KEY,
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS user_consents (
  did        text NOT NULL,
  client_id  text NOT NULL,
  origin     text NOT NULL,
  scopes     text[] NULL,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (did, client_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id          text PRIMARY KEY,
  type        text NOT NULL,
  owner_did   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_documents_owner_type ON documents(owner_did, type);
```

Auth Flow (minimal)

1) App redirects to `GET /auth/authorize?client_id&redirect_uri&scope&state&code_challenge&code_challenge_method=S256`.
2) If session cookie exists and consent is granted, server issues one‑time auth code and redirects to `redirect_uri?code&state`.
3) App exchanges code at `POST /auth/token` with `{ grant_type=authorization_code, code, code_verifier, client_id, redirect_uri }`.
4) API responds `{ access_token, token_type: 'Bearer' }`, HS256 token with `sub` and `instanceId`.
5) App calls `GET /users/me` with `Authorization: Bearer <token>`.
6) First visit (no consent) redirects to `/auth/wizard` to approve scopes. On approve, stores consent and returns to (1).

API Endpoints (v2)

- `GET /health` → `{ status: 'ok' }`
- `GET /auth/authorize` → redirect to app or wizard
- `POST /auth/token` → `{ access_token, token_type }`
- `POST /auth/login` → sets session cookie; returns redirect to authorize
- `POST /auth/signup` → sets session cookie; returns redirect to wizard/profile
- `GET /auth/session-check` → iframe path for silent login; responds via postMessage with `{ status, user?, code?, hasConsented }`
- `POST /auth/consent` → store consent; redirect to authorize
- `GET /users/me` (Bearer) → `{ user: { did, instanceId, displayName } }`
- `POST /data/types/:type` (Bearer) → write doc for current user; returns created record
- `POST /data/types/:type/query` (Bearer) → list docs for current user; supports `{ _id?, expand?, limit? }`

SDK (v2)

- Config: `{ appName?, apiUrl, clientId, redirectUri, scopes?: string[], debug?: boolean }`
- Methods:
  - `init()` → performs silent login via `/auth/session-check`; if code present, exchanges for token
  - `login()` / `signup()` → redirect to authorize
  - `handleRedirectCallback(url)` → parse `code`/`state`, call `/auth/token`, set token
  - `getUser()` → GET `/users/me`
  - `readOnce(type, query)` → POST `/data/types/:type/query`
  - `write(type, data)` → POST `/data/types/:type`
  - `getToken()` → returns access token
- No hub dependency for data; hub only for silent login (can also be replaced later with same‑origin check).

UI (v2)

- Pages:
  - `/` → simple notes list + “Add note” form (uses SDK)
  - `/auth/wizard` → consent page (prompt single allow)
  - `/auth/callback` → calls `sdk.handleRedirectCallback()` and redirects to `/`
- Minimal styles only.

Infra (dev‑v2 compose)

- Services:
  - postgres:16‑alpine with volume
  - pgadmin: latest, port 5051
- No CouchDB, no MinIO initially.

Acceptance Criteria

- Fresh DB: sign up -> consent -> redirect to app -> token exchange -> `/users/me` returns 200 with `did` and `instanceId`.
- Create a note via UI -> appears in list via `readOnce`.

Phased Build Steps

1) Scaffold projects: `apps/vibe-api-v2`, `apps/vibe-ui-v2`, `packages/vibe-sdk-v2`, `infra/dev-v2/docker-compose.yml`.
2) API: wire Postgres pool + migrations; implement endpoints above; jose HS256 for JWT.
3) SDK: implement auth + readOnce/write; no hub for data; silent login via `/auth/session-check` iframe or an XHR cookie check.
4) UI: minimal Next.js app with provider wrapper + pages.
5) Compose: start Postgres/pgAdmin; seed `.env` files for API/UI/SDK.
6) E2E: run dev, complete flow, verify.

Envs (example)

```
# API
PORT=5055
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=vibe_v2
PGUSER=postgres
PGPASSWORD=postgres
JWT_SECRET=dev-secret
CORS_ORIGIN=http://localhost:4005,http://127.0.0.1:4005

# UI
NEXT_PUBLIC_API_URL=http://localhost:5055
NEXT_PUBLIC_CLIENT_ID=http://localhost:4005

# SDK (bundled via UI config)
```

Notes

- Keep old stack intact; do not delete files. v2 should be independent and small.
- Once v2 is stable, retire hub data ops entirely and consider dropping hub.html in favor of a pure token‑based silent login.

