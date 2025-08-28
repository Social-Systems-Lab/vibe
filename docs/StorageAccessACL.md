# Storage Access, ACL, and Caching Strategy

Status: Proposed  
Scope: First‑party UI (cloud dashboard), Vibe SDK, third‑party apps, API  
Author: Vibe team  
Version: 1.0

## Goals

- General mechanism usable by first‑party UI and third‑party apps (no hard‑coded special cases like “cover” vs “avatar”).
- Enforce tenant isolation and existing ACL rules (DID/certificate-based) before any access.
- Keep documents cacheable in PouchDB/CouchDB without embedding expiring URLs.
- Simple, robust client behavior for common images (avatar, cover, thumbnails).
- Efficient delivery for large files and third‑party consumption.

## Core Principles

- Documents store stable identifiers only:
  - `storageKey` (format: `u/{instanceId}/yyyy/mm/uuid.ext`)
  - Optional derived keys (e.g., `thumbnailKey`, `previewKey`) for future transforms
- Never persist presigned URLs in documents.
- Centralize access control in API:
  - Verify `storageKey` prefix for tenant isolation
  - Evaluate ACL using the existing evaluator (DIDs, certificates, allow/deny, visibility)
  - For third‑party contexts, verify user consent
- Two delivery strategies (selected by context):
  - Stream (default for first‑party UI): `GET /storage/stream?key=...`
  - Presigned (for large downloads, third‑party embed/cross‑origin): `POST /storage/presign-get`

## Data Model

- Files document fields (subset):
  - `storageKey: string`
  - `acl: any` (existing structure supporting DIDs, certificates, allow/deny lists, visibility)
  - `ownerDid: string` (creator/owner)
  - `instanceId: string` (tenant)
  - Optional: `thumbnailKey`, `previewKey` (future image pipeline)

Document invariant: No presigned URLs (e.g., no `coverUrl` that contains a presigned query string). For profile UI, store `coverStorageKey`/`pictureStorageKey` instead.

## API

### 1) GET /storage/stream

- Query: `key=storageKey` (future: `w,h,fit,format`)
- Auth: cookie (`vibe_session`) or `Authorization: Bearer`
- Checks:
  - `storageKey.startsWith("u/" + profile.instanceId + "/")`
  - Load files doc by `storageKey`; evaluate ACL using existing evaluator
  - If app context provided (`appId`/`origin`), verify consent and app-level ACL
- Behavior:
  - Stream bytes from storage provider (download or internal presigned fetch)
  - Support Range (`Accept-Ranges: bytes`) for video/audio
  - Headers:
    - `Content-Type`, `Content-Length` (if known), `Accept-Ranges: bytes`
    - `ETag` (provider ETag if available), `Last-Modified`
    - `Cache-Control`:
      - Private (default): `private, max-age=3600` (configurable), `must-revalidate`
      - Public (if `acl.visibility === "public"`): `public, max-age` configurable (e.g., 1d), suitable for CDN
    - Handle `If-None-Match` / `If-Modified-Since` (304)

Use for first‑party UI images/thumbnails to avoid client refresh complexity.

### 2) POST /storage/presign-get

- Body: `{ storageKey: string, expires?: number, appId?: string, origin?: string }`
- Auth: Bearer
- Checks: same as stream; enforce ACL + consent when app context is present
- TTL policy (env-configurable):
  - `PRESIGN_DEFAULT_TTL_SECONDS` (e.g., 300)
  - `PRESIGN_MAX_TTL_SECONDS` (cap, e.g., 3600)
  - `PRESIGN_OWNER_TTL_SECONDS` (e.g., 86400) unless `PRESIGN_FORCE_TTL_FOR_OWNER=true`
- Response: `{ url: string, expiresIn: number }`

Use for large downloads, third‑party embedding (cross‑origin), or when Authorization cookies aren’t feasible.

### 3) Optional: Public Sharing

- `POST /storage/share { storageKey, ttlSec, scope?: "orig"|"thumb", oneTime?: boolean } -> { downloadUrl }`
- `GET /storage/download?token=...` -> validate token, stream or redirect

### Upload Flow (unchanged)

- `/storage/presign-put` -> client PUTs to object store or falls back to `/storage/upload`
- `/storage/commit` -> server writes files doc with sanitized metadata and `acl`
- Avoid returning a public URL in responses unless `acl.visibility === "public"`

## ACL Enforcement (reuse existing logic)

- Always enforce tenant isolation (`storageKey` prefix `u/{instanceId}/`).
- Evaluate ACL using the existing evaluator (DID/cert-based rules, allow/deny, visibility).
- For third‑party contexts, verify user consent (`hasUserConsented`) and app-level ACL if applicable.
- Deny if evaluation fails. Only then mint presigned URL or stream.

## Caching and Hub (PouchDB)

- Hub caches JSON docs and expanded refs, not binary blobs.
- Do not store presigned URLs in docs; they will expire while docs remain cached.
- Client computes a URL at view time:
  - First‑party: ``${apiBase}/storage/stream?key=${encodeURIComponent(storageKey)}``
  - Third‑party/explicit: call `/storage/presign-get`
- If hub needs to supply a ready URL, compute it at runtime in SDK (not persisted), optionally with short `maxCacheAge` for view models only.

## Client SDK

Add helpers:
- `storage.getStreamUrl(storageKey, params?) -> string`
- `storage.getUrl({ storageKey, strategy?: "auto"|"stream"|"presigned", expires?: number, appId?: string })`

Strategy “auto”:
- First‑party same-origin with cookie: stream
- Cross‑origin or third‑party: presigned

React convenience (optional):
- `useStorageUrl(storageKey, { strategy?: "auto"|"stream"|"presigned", expires?: number })`
- `AclImage` component (only if presigned strategy is used heavily) that:
  - Calls `presign-get` on mount/visibility
  - Caches `url+expiry` in memory
  - Refreshes before expiry or on `onError`
  - Uses `IntersectionObserver` to avoid off-screen work

## Third‑Party Apps

- Apps call `/storage/presign-get` with Bearer token, passing `appId`/`origin`.
- API verifies user consent and ACL. On success, returns a short-TTL URL.
- For public assets, apps can also use `/storage/stream` without credentials if `acl.visibility === "public"` and headers allow public caching.

## Configuration

- `PRIVATE_BUCKET=true` (production)
- `PRESIGN_DEFAULT_TTL_SECONDS=300`
- `PRESIGN_MAX_TTL_SECONDS=3600`
- `PRESIGN_OWNER_TTL_SECONDS=86400`
- `PRESIGN_FORCE_TTL_FOR_OWNER=false`
- `STREAM_PRIVATE_MAX_AGE_SECONDS=3600`
- `STREAM_PUBLIC_MAX_AGE_SECONDS=86400`

## Security

- Rate-limit `/storage/stream` and `/storage/presign-get`
- Audit log (who, key, decision, TTL)
- Prefer stream for private data; use public caching/CDN only if visibility === "public"

## Migration Plan

API:
- Harden `POST /storage/presign-get`:
  - Enforce `storageKey` tenant prefix and ACL evaluation
  - TTL policy with owner override
- Add `GET /storage/stream` with ACL, Range, and caching headers
- Transitional: support `query.key` in `presign-get` with deprecation logs
- Upload responses: remove public URL unless explicitly public

UI:
- Profile page: use stream URL from `coverStorageKey`/`pictureStorageKey`
- Components (ImagePicker/FilePreview): default to stream for thumbnails; “Download” uses presign-get
- Do not persist presigned URLs; only `storageKey`

Third‑Party:
- Document `/storage/presign-get` usage with `appId`/`origin` for consent-aware checks

Hub:
- No change required; ensure expansion logic never writes ephemeral URLs into PouchDB (“cache/*” or docs)

## Decision Matrix

- First‑party small/medium images (avatar, cover, thumbnails): Stream
- Large downloads, files > few MB, save-as: Presign
- Third‑party embeds: Presign
- Public assets: Stream (public caching) or Presign + CDN, depending on infra

## Examples

First‑party image
```tsx
const src = `${apiBase}/storage/stream?key=${encodeURIComponent(storageKey)}`;
<img src={src} alt="..." />;
```

Third‑party (presign)
```ts
const { url } = await fetch(`${apiBase}/storage/presign-get`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ storageKey, expires: 900, appId }),
}).then(r => r.json());
```

Server (stream) pseudo
- Verify auth -> derive profile
- if (!key.startsWith(`u/${instanceId}/`)) 403
- doc = read files doc by storageKey
- if (!aclAllows(profile, appCtx, doc)) 403
- stat = storage.statObject(bucket, key)
- handle Range; stream storage.download(bucket, key)
- set headers: Content-Type, ETag, Last-Modified, Cache-Control (private/public), Accept-Ranges; support 304

## Diagrams

Upload (presigned)
- Client -> API: POST /storage/presign-put
- API -> Quota: reserve
- API -> Provider: presign PUT
- API -> Client: {url, headers, uploadId, storageKey}
- Client -> S3: PUT file
- Client -> API: POST /storage/commit {storageKey, name, size, mime, acl, uploadId}
- API -> Provider: statObject
- API -> Data: write files doc (owner, instanceId, acl)
- API -> Quota: commit

View (stream)
- Client -> API: GET /storage/stream?key=K
- API: verify auth, tenant, ACL
- API -> Provider: download/presign internal
- API -> Client: stream with ETag, Cache-Control

View (presigned)
- Client -> API: POST /storage/presign-get {storageKey, expires, appId?}
- API: verify auth, tenant, ACL (+consent)
- API -> Provider: presign GET
- API -> Client: {url, expiresIn}
