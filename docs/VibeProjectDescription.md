# Vibe Cloud — Project Description (v0.1)

_Last updated: 2025‑09‑04_

## Elevator pitch

Vibe Cloud is a self‑sovereign app platform and personal cloud that returns ownership of identity, data, and social connections to individuals. Apps connect via consented access to a user’s data—so your profile, files, posts, and audiences become portable across apps, not trapped in silos.

## Mission

Vibe returns ownership of identity, data, and social connections to individuals. We’re building a user‑controlled platform where your digital life is portable across apps, with privacy and consent at the core—offering a practical, joyful alternative to Big Tech.

## Why now

Creators, movements, and everyday users need resilience and portability. Grassroots organizers want less fragility and lower censorship risk; creators want to take their audiences and content with them instead of being locked in. At the same time, developers keep rebuilding the same foundations (auth, storage, privacy) in every app. Vibe consolidates these into a user‑controlled base so people and developers both gain freedom and velocity.

## Product summary — what Vibe is

Vibe is a personal cloud and app platform: a user‑owned service for identity, data (CouchDB), files (S3‑compatible) and permissions that apps connect to via consent. Developers use our SDKs and components for auth, storage, real‑time sync, and cross‑app data sharing. Public documents can be discovered globally via **DocRefs**, enabling fast feeds and search while ownership remains with the user.

## Core principles

Self‑sovereignty as a path, not a dogma. In **v1**, keys are held by the managed server (with transparent custody and export), **v2** enables self‑hosting of the full stack, and **v3** moves keys to the device (e.g., via a browser extension). Consent and transparency govern all access; interoperability is built‑in through shared schemas rather than silos; we prefer local‑first with cryptographically verifiable sources and permissions; and the whole stack is open and self‑hostable. Pragmatism drives the order—we ship useful building blocks first and expand iteratively.

## Core components

-   **Vibe Cloud API** (ElysiaJS):

    -   OAuth 2.0 + OIDC identity provider; iframe **Hub** for silent login and cross‑app sessions (PKCE).
    -   Per‑user data stores (CouchDB) and file storage (S3‑compatible).
    -   Consent management UI and policies.
    -   Certificate service for issuing/revoking verifiable claims.
    -   Global index of **DocRefs** for public discovery/feeds.
    -   Real‑time endpoints (CouchDB `_changes`, subscriptions).

-   **Vibe SDK** (TS/JS): Auth, read/write/subscribe, files, consent, certificates; strategies for agent/standalone/auth‑proxy.
-   **Vibe React**: Provider, hooks, and UI components (auth widgets, layout, pickers, permission dialogs, profile menu, etc.).
-   **Example apps**: `vibe‑notes` (skeleton), `vibe‑collections` (Drive‑like), `vibe‑feeds` (social feed; planned) to demonstrate interop and consent.

## Architecture overview

**Identity & sessions.** Users are identified with DIDs; sessions use OAuth 2.0 PKCE. V1 uses server custody for keys (with a clear migration to self‑hosted custody in v2 and device keys in v3). An iframe‑based **Hub** enables silent login and cross‑app sessions.

**Data plane.** Per‑user CouchDB databases; the client uses PouchDB for caching and real‑time sync via `_changes`.

**Files.** S3‑compatible object storage. Quotas are enforced with reserve → pre‑signed POST → commit plus nightly reconciliation.

**Global index.** Public documents publish **DocRefs** to a global DB for efficient range scans and subscriptions. We are evaluating storing the full document in the global DB for advanced queries, while returning DocRefs to apps.

**Consent.** App manifests describe requested collection operations; in v1 scopes are broad (read/write doc types). "Ask" mode and finer scopes are planned. We are also exploring a certificate‑based model where apps receive issued rights like users.

**Certificates & ACL.** Documents carry ACLs with allow/deny and certificate predicates (e.g., `member‑of`, `proof:age`). Backend verification is ready; the UI for issuing/managing certificates is forthcoming.

## Data & identity model

-   **Documents**: JSON docs in per‑user DBs. Access via `read`, `readOnce`, `write`, `remove` (SDK).
-   **ACLs**: `{ read | write | create: { allow: [ … ], deny: [ … ] } }` where entries can be DIDs or certificate predicates.
-   **Certificates**: Issued/revoked via API/SDK; stored by issuer and subject; evaluated during access checks.
-   **DocRef**: Lightweight pointer `{ type, ownerDid, ref, aclSummary, timestamps }` published to global DB when ACLs allow public discovery.

## Developer experience

-   **Zero‑backend path**: Front‑end apps can ship without servers (host on Vercel/Netlify/GitHub Pages) using Vibe SDK for auth, data, and files.
-   **React ergonomics**: `VibeProvider`, `useVibe()` hook, and components for consent/profile/storage pickers.
-   **Queries**: Filter/sort/limit; `expand` relations; `global: true` for public queries across users.
-   **Files**: `upload(file, metadata)` handles quota‑aware pre‑signed POST and file records.
-   **Content Managers (dashboard)**: Apps can register **Content Managers** to declare how their content is created/edited/viewed inside Vibe Cloud; a compiler generates CouchDB design docs for efficient discovery.

## Storage & quota model (MVP)

We use **levels** rather than named tiers. A new, untrusted user starts small (≈ **10–25 MB**) for avatars and basic docs, and can quickly unlock more by verifying email/phone, etc. A **trusted free level** is preliminarily around **≈1 GB** (final numbers depend on cost modeling). Quotas are enforced entirely in the API: `reserve → upload (pre‑signed POST) → commit`, with drift healed from object‑storage ground truth. We show warnings at 80/90/100% and block new uploads above the limit. CouchDB quotas serve as abuse safeguards (JSON bytes, doc counts, write rates) and are not user‑visible. Temporary **burst credits** and level rewards are under consideration but not finalized.

## Security & privacy

-   Least‑privilege scopes by default; explicit and inspectable consent.
-   Short‑lived signed download URLs; private buckets by default.
-   Strong isolation across collections; validate functions prevent attachments in JSON docs (files live in object storage).
-   Audit logs for consent changes, certificate issuance, and quota adjustments.

## Deployment & self‑hosting

-   **Managed cloud**: Reference deployment on Scaleway Kapsule (K8s), Helm charts, GitHub Actions CI/CD.
-   **Self‑host**: Docker Compose stack with CouchDB and the API; DNS & CORS steps documented.

## Roadmap (draft)

We are intentionally not fixing a strict order yet. Near‑term focus areas include:

-   **Develop example apps**: bring `vibe‑collections`, `vibe‑feeds` and `vibe‑notes` to daily usability and showcase interoperability (e.g., pick images from Collections into Feeds with ACLs).
-   **Payments & brokerage**: patterns for app/content monetization via Stripe/Donorbox.
-   **Messaging MVP**: E2E 1:1 and small groups with replies, attachments, emojis/reactions, delete and notifications.
-   **Self‑hosting DX**: docker‑compose, backups/migrations, domain setup; clarify global index when data spans multiple servers.
-   **Kamooni migration**: account linking (OAuth→Vibe), email "claim", and progressive data migration.
    (This list is incomplete and may be reordered.)

## Non‑goals (now)

-   Heavy federation protocols (beyond current global index).
-   Complex moderation frameworks (beyond managed‑cloud policies and ACL/cert gates).
-   Deep native OS integrations (focus on web/PWA first).

## Monorepo structure (high level)

```
apps/
  vibe-cloud-api   # ElysiaJS backend (auth, data, storage, certs, global index)
  vibe-cloud-ui    # Next.js dashboard (profile, apps, content, storage, consent)
  vibe-notes       # Example app integrating with Vibe
packages/
  vibe-core        # crypto, DID, shared types
  vibe-sdk         # TS SDK for auth/data/files/certs
  vibe-react       # React provider, hooks, UI components
infra/
  helm, selfhost   # K8s Helm charts; Docker Compose stack
```

## Personas & launch narrative

**Social media users and creators.** From everyday posters who want to carry audience and content across apps, to writers and video/image creators who need smoother rights and access control.

**Developers.** Want to build self‑sovereign apps without backend overhead and participate in an ecosystem that frees users from Big Tech.

**Activists and political influencers.** Seek lower risk from deplatforming and censorship and a stronger foundation for their digital presence.

## Implementation status (Sep 2025)

-   **Auth/Hub**: Basic flows are done. Consent exists with broad scopes (read/write doc types); "Ask" mode and finer scopes planned. Exploring a cert‑based model where apps are granted rights as subjects.
-   **DocRefs / Global index**: Implemented; needs work for searchability. Considering storing full documents in the global DB for advanced queries while returning DocRefs to apps.
-   **Certs & ACL**: Backend ACL verification is ready; UI and flows to issue/manage certificates (including templates) are missing.
-   **Content Manager / Compiler**: Backend started; untested; no UI yet.
-   **Notes / Collections / Feeds**: Project skeletons; no finished functionality.
-   **Security posture**: Not defined—passkeys, device/phone trust, and audit logging need investigation.
-   **Self‑hosting v1**: Potentially out of scope initially. Goal is that self‑host matches managed functionality; we need a design for global queries/index across multiple servers and fallback if managed goes down.

## Glossary

-   **DID** — Decentralized Identifier for user/app identities.
-   **ACL** — Per‑document access rules with allow/deny and certificate predicates.
-   **Certificate** — Signed claim (e.g., `friend`, `follower`, `member`, `proof:age`) used in ACL evaluation.
-   **DocRef** — Pointer in the global DB to a canonical doc in the owner’s store; enables discovery and feeds.
-   **Hub** — Iframe session manager enabling silent login and cross‑app auth.
-   **Content Manager** — App‑declared rules + UI paths so the dashboard can create/edit/view that app’s content.

---
