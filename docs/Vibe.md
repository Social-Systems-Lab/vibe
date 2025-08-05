Project: Vibe — Self-Sovereign App Platform and Personal Cloud

Purpose
Vibe is an oligarch-free, self-sovereign app platform that gives users ownership of identity and data, and gives developers a zero-backend path to build interoperable web apps. Users can self-host or use managed Vibe Cloud. Data is portable across apps, access is governed by consent, ACLs, and verifiable certificates. The long-term goal is 1-to-1 replacements of Big Tech services (Drive, Feeds, Messenger, etc.) and a thriving third-party ecosystem.

Core Components

-   Vibe Cloud API: OAuth 2.0 + OIDC identity provider, per-user data stores (CouchDB), file storage (S3-compatible), consent management, global index (DocRefs), and real-time sync endpoints.
-   Vibe SDK: JS/TS SDK for auth, data read/write/subscriptions, files, consent, certificates.
-   Vibe React: React provider/hooks/components for quick integration.
-   Example Apps: vibe-collections (Drive-like), vibe-feeds (social feed), plus auth UI.

Data and Identity Model

-   User identity: DID-based; users hold keys; sessions via OAuth 2.0 PKCE.
-   Personal data stores: Per-user CouchDB; PouchDB on client for caching/realtime.
-   Access control: Document-level ACLs with allow/deny rules and certificate predicates.
-   Certificates: Verifiable credentials (JWT/JWS) representing relationships/claims (e.g., member-of, proof-of-age). Issued/revoked via API/SDK.
-   Global index: A “global” CouchDB with DocRef pointers for documents whose ACLs allow public discovery. Used for aggregation, feeds, search, and subscriptions.

Consent and Permissions

-   App manifests declare requested collections and operations (read/write/subscribe).
-   Users grant Always/Ask/Never, with granular prompts and per-operation visibility.
-   Subscriptions can be consented to as ongoing reads with clear scope.

Dev Experience and Interop

-   Zero-backend: Apps can be front-end only (hosted on Vercel/Netlify/GitHub Pages).
-   Data queries: read (subscribe), readOnce, write, remove; filters, sorting, limits, expand relations.
-   Schema guidance: Optional format registry and Zod schemas to converge on common shapes while preserving flexibility.
-   Reusability: Shared components (auth widgets, pickers, feed/posting/rating modules).
-   Paywalls/monetization: Apps and content can be gated; developers connect their own Stripe accounts; Vibe takes a small brokerage fee.

Reference Architecture Highlights

-   OAuth 2.0 PKCE with iframe-based “Hub” for silent login and cross-app session.
-   SharedWorker on client to unify PouchDB instance, reduce multi-tab overhead, and centralize API calls.
-   Global DB uses composite IDs: collection/did/docId to avoid collisions and enable efficient range scans and \_changes filters.
-   Real-time: Clients subscribe to personal or global \_changes feeds; use last_seq/since for incremental sync.

Priorities and Roadmap (current focus)

1. Solidify Vibe Cloud: auth flows, consent UI, stable data APIs, file uploads, DocRefs global index, real-time subscriptions.
2. Polish SDK/React: robust hooks, error handling, subscriptions, data pickers, ACL/cert helpers.
3. Upgrade example apps: vibe-collections (files) and vibe-feeds (posts) as daily-usable demos of interop (select images from Collections into Feeds, set ACLs).
4. Payments: clean Stripe integration pattern for app devs; brokerage fee handling; donation flows.
5. Messaging MVP: E2E chat (1:1 and small groups), media via Collections, cert-gated groups, migration path toward WhatsApp replacement.
6. Self-hosting: infra/docker-compose templates (CouchDB, S3/minio), smooth migrations and backups, easy domain configuration.
7. Kamooni migration path: account linking (OAuth to Vibe), email “claim” flow, progressive data migration to Vibe collections with user consent.

Non-Goals (for now)

-   Heavy federation protocols beyond current global index phase.
-   Complex moderation frameworks beyond managed-cloud policies and ACL/cert gating.
-   Native mobile OS deep integrations (focus on web + PWA first).

Key USPs (for product decisions)

-   User sovereignty: own identity and data, self-host option, export/portability.
-   Interoperability: same data across multiple apps; explicit consent and ACLs.
-   Developer velocity: zero-backend, real-time data, open SDKs/components.
-   Fair monetization: developer keeps nearly 100% (minus low brokerage fee); content/app paywalls; donation support.
-   “Thousand apps” strategy: many small apps as on-ramps into the same account/data/upgrade funnel (storage/compute).

Security and Privacy Principles

-   Least privilege by default; explicit, inspectable consent.
-   Strong isolation of collections; document-level ACL with allow/deny semantics.
-   Certificates as minimal disclosure proofs (e.g., age, membership).
-   Managed cloud enforces TOS/content policy; self-host gives maximum autonomy.

Glossary

-   DID: Decentralized Identifier for user/app identities.
-   ACL: Access Control List on documents; read/write/create rules with allow/deny.
-   Certificate: Verifiable, signed claim used in ACL evaluation (membership, age, etc.).
-   DocRef: Lightweight pointer in the global DB referencing the canonical doc in the owner’s store.
-   Hub: Iframe-based session manager enabling silent login and cross-origin auth.

Success Criteria for Contributions

-   Maintain explicit consent flows and clear user understanding of data access.
-   Preserve data portability and open formats; avoid lock-in.
-   Keep SDK ergonomics high: simple, typed, predictable error handling, good dev DX.
-   Test with example apps; ensure interop (e.g., Collections assets selectable in Feeds; ACL respected).
-   Document decisions and APIs; provide small, runnable examples.

Notes for AI Agents

-   Prefer minimal, composable abstractions in SDK and React bindings.
-   Write code in TypeScript, format with Prettier (print width 80).
-   Use CouchDB-friendly patterns (id prefixes, deterministic keys, conflict handling).
-   For UI copy, emphasize consent, portability, and user ownership.
-   When extending data models, consider ACL/cert impact and global index behavior.
