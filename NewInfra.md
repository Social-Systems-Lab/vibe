Vibe Cloud SaaS – Consolidated Implementation Spec  
(“v 1.0 alpha”, 15 Jun 2025)

==================================================
0 Purpose
==================================================
Provide one authoritative blueprint that combines every decision we have
made so far:

-   Multi-tenant architecture on Scaleway.
-   Single-technology persistence (CouchDB + S3).
-   Waku for web UI, ElysiaJS for data-plane API.
-   One Bun monorepo with clear app/package boundaries.
-   Easy self-hosting and CI/CD.

==================================================
1 Top-level repo layout
==================================================

```
/apps                     # deployable artefacts
  vibe-web/               # Waku front-end + server actions
  vibe-cloud-api/         # ElysiaJS data-plane service
  vibe-agent/             # Chrome extension (legacy code)

 /packages                # reusable libraries
  vibe-types/             # zod models, DTOs, CouchDB doc types
  vibe-sdk/               # browser/node SDK; talks to agent or cloud-api
  vibe-react/             # React hooks built on sdk
  vibe-crypto/            # (optional) pure crypto helpers

/infra                    # IaC and ops
  terraform/              # Scaleway resources
  helm/                   # charts for kubernetes deploys
  selfhost/               # docker-compose.yml for home servers

/bun.lockb                # single lock-file
/package.json             # Bun workspace manifest
/README.md
```

workspace roots (`package.json`):

```json
{
    "private": true,
    "name": "vibe",
    "workspaces": ["apps/*", "packages/*", "infra"]
}
```

==================================================
2 Services
==================================================
2.1 apps/vibe-web

-   Stack: Waku (React 18 + Server Components + Server Actions).
-   Routes
    -   GET / → marketing / docs
    -   GET /signup → page
    -   GET /login → page
    -   GET /dashboard → protected page
-   Server actions
    -   signup(email, password) → calls IdentityService.register
    -   login(email, password) → calls IdentityService.login
-   Env: API_INTERNAL=http://vibe-cloud-api:3000

    2.2 apps/vibe-cloud-api

-   Stack: Bun + ElysiaJS 0.7.
-   Exposed port: 3000.
-   Responsibilities

    -   Identity, Data, Blob, Permission WebSocket feed.

    2.3 apps/vibe-agent  
    Unchanged; still Manifest V3. Later it will talk to the same
    `/auth/did-challenge` endpoints exposed by cloud-api.

==================================================
3 Shared libraries
==================================================
3.1 packages/vibe-types  
Purpose: canonical, dependency-free data models.

```ts
import { z } from "zod";

export const IdentityDoc = z.object({
    _id: z.string(), // idn:<uuid>
    email: z.string().email(),
    pwdHash: z.string(),
    salt: z.string(), // base64
    keyWrapped: z.string(), // base64
    createdAt: z.string(),
});

export type IdentityDoc = z.infer<typeof IdentityDoc>;
```

3.2 packages/vibe-sdk

-   Detects agent presence (`window.vibe`).
-   Falls back to direct HTTP calls with JWT.
-   Re-exports types from `vibe-types`.

    3.3 packages/vibe-react

-   `useIdentity`, `useCollection`, etc.

    3.4 packages/vibe-crypto (optional)

-   `wrapKey`, `unwrapKey`, `generateKeyPair`, DID helpers.

==================================================
4 Persistence design (CouchDB 3.x)
==================================================
Database namespace (all are per-cluster, sharded):

-   identities – one doc per identity
-   db\_<idn>\_data – arbitrary app data
-   db\_<idn>\_permissions – app permission docs
-   db\_<idn>\_groups – group docs (later)

Mango index created on cluster bootstrap:

```json
{
    "index": { "fields": ["email"] },
    "name": "byEmail",
    "ddoc": "identities",
    "type": "json"
}
```

Blob bucket: `vibe-objects`  
Object key format: `<idn>/<uuid4>.<ext>`

==================================================
5 Authentication & key custody flow
==================================================

1. Signup

    - Client sends email + password.
    - Service generates Ed25519 key.
    - Derive wrapKey = scrypt(password, salt, N=32768, r=8, p=1).
    - AES-GCM encrypt private key → `keyWrapped`.
    - Store IdentityDoc, create per-identity DBs, make S3 prefix.

2. Login

    - Verify Argon2id hash.
    - Issue JWT
        - sub = identityId
        - scp = ["data:*","blob:*"] (MVP)
        - exp = 15 min

3. JWT refresh: httpOnly refresh-token cookie, `/auth/refresh`.

4. Agent path (future)
    - GET /auth/challenge → { nonce, aud }
    - Agent signs with Ed25519 → POST /auth/response → JWT.

==================================================
6 API surface (cloud-api)
==================================================

```http
POST   /auth/signup              email, password
POST   /auth/login               email, password
POST   /auth/refresh             refresh cookie → new JWT
GET    /me                       returns IdentityDoc (redacted)

GET    /data/:collection         query params ?q=…
POST   /data/:collection         JSON body
PUT    /data/:collection/:id
DELETE /data/:collection/:id

POST   /blob/upload-url          { mime, size } → { url, id }
POST   /blob/finalize-upload     { id, meta }
GET    /blob/download-url/:id    → 302 signed URL

WS     /realtime                 subscribes to _changes feed
```

All endpoints require `Authorization: Bearer <jwt>` except `/auth/*`.

==================================================
7 Infrastructure (infra/)
==================================================
terraform/

-   VPC, public subnet, NAT GW.
-   scaleway_k8s_cluster “vibe-prod”.
-   scaleway_object_bucket “vibe-objects”.
-   scaleway_lb “vibe-lb”.
-   Output: `web_url`, `api_url`.

helm/

-   release name: vibe
-   Charts
    -   couchdb (bitnami) – 3 pod STS, clusterCookie from secret.
    -   vibe-cloud-api – deployment 2 replicas.
    -   vibe-web – deployment 2 replicas.
    -   ingress – TLS via cert-manager (`vibe.cloud` domain).

selfhost/docker-compose.yml

-   couchdb, minio, vibe-cloud-api, vibe-web mapped to ports 5984/3000/3001.

==================================================
8 CI/CD
==================================================
GitHub Actions `ci.yml`

-   Checkout.
-   `bun install`.
-   `bun run build` inside each app.
-   Build and push images:
    -   rg.fr-par.scw.cloud/vibe/vibe-cloud-api:${{sha}}
    -   rg.fr-par.scw.cloud/vibe/vibe-web:${{sha}}
-   `helm upgrade --install vibe infra/helm --set image.tag=${sha}`
-   Auto-promote to staging namespace, manual approval to prod.

==================================================
9 Local developer workflow
==================================================

```bash
bun install
bun run dev -w apps/vibe-web         # starts Waku on :3001
bun run dev -w apps/vibe-cloud-api   # starts API on :3000
docker compose -f infra/selfhost/docker-compose.yml up couch
```

The web app points at `http://localhost:3000` via env var
`VITE_API=http://localhost:3000`.

==================================================
10 Roadmap (high-level)
==================================================
Sprint 1 (1 week)

-   Scaffold repo, add workspace config.
-   CouchDB cluster bootstrap script.
-   IdentityService with signup/login.
-   Waku pages & actions.
-   End-to-end sign-up succeeds locally.

Sprint 2

-   Data & Blob endpoints migrated from legacy.
-   Helm chart, Terraform cluster in Scaleway staging.
-   CI/CD pipeline green.

Sprint 3

-   Web dashboard minimal.
-   Rate-limiter, email verification, HTTPS.
-   Invite first alpha testers.

==================================================
11 Self-hosting promise
==================================================

-   All apps run with `docker compose up` from `infra/selfhost`.
-   Zero proprietary Scaleway features required; replace S3 endpoint +
    delete Helm if desired.

==================================================
12 Naming convention
==================================================
“Identity” is the canonical term. Paths, DB names, code all use
`identity` or `idn`. Human-facing copy can still say “Create your
account” for clarity.

==================================================
Deliverables
==================================================
The repo plus this spec are now the single source of truth for all
sub-teams (backend, web, agent, infra). Any change proposal should be
submitted as a PR that patches this document.
