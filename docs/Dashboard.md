# Vibe Cloud Dashboard – Content & Database Spec (v0.1 · 2025‑08‑24)

## 0) Purpose

Create a single, coherent dashboard experience in Vibe Cloud that:

* Feels like “Google Drive for self‑sovereign content”, but works across any third‑party apps.
* Lets end‑users and creators manage **Content** without caring whether it’s a DB document or a stored file.
* Gives power users/devs **Advanced** tools for Database and Storage.
* Provides a **renderer model** so apps control how their content looks (preview + full view) inside the dashboard.
* Standardizes **engagement metrics** and **comments** across all content.

---

## 1) Audience & Modes

**Primary audiences**

1. **End‑users / creators** – manage, create, browse, filter, preview, and open content. Focus on simplicity.
2. **Power users / developers** – inspect raw documents, run queries, manage types, debug data.
3. **Admins (future)** – organizational context, access control, and circle-level dashboards.

**UI Modes**

* **Simple (default)** – Content‑centric. Unified view of posts/events/media/etc.
* **Advanced** – Database Explorer (CouchDB docs), Storage (files/objects) with low‑level controls.
* Mode switching: a toggle in the left nav (persist per user/space).

---

## 2) Core Concepts & Terminology

* **Document**: A CouchDB JSON document (e.g., a post, event, config, profile, etc.). Has `type` (aka **document type**).
* **File / Object**: A stored file (e.g., image/video) living in Storage (e.g., S3‑compatible).
* **Content** (boolean): A document or file intended to be **user‑facing, shareable, and displayable** in the dashboard. If `isContent=true`, it shows up in **Content**.
* **Document type**: Logical kind of document (e.g., `post`, `event`, `profile`, `appConfig`). Used for filtering and discovery.
* **Renderer**: App‑provided UI that renders a piece of content inside the dashboard.

  * **Preview renderer**: lightweight card/tile representation.
  * **Full renderer**: immersive, interactive view (comments, actions, paywall, etc.).

**Why boolean `isContent`?**

* We only need to decide if an item appears in the Content section. All other data (config, profiles, connections) remains out of Content but visible in Advanced.

---

## 3) Data Model (Documents & Files)

### 3.1 Minimum document schema (SDK suggestion)

```json
{
  "_id": "...",
  "type": "post | event | media | ...",
  "isContent": true,
  "createdBy": {
    "userId": "did:vibe:...",
    "appId": "app.example",
    "displayName": "..."
  },
  "createdAt": "2025-08-24T12:34:56Z",
  "updatedAt": "2025-08-24T12:58:00Z",
  "contentSummary": {
    "title": "...",
    "excerpt": "...",
    "coverImageRef": "storage://bucket/key" ,
    "tags": ["..."]
  },
  "previewContract": {
    "requiredFields": ["contentSummary.title", "coverImageRef"],
    "sizeHint": "s | m | l",  
    "aspectRatio": "1:1 | 4:3 | 16:9"
  },
  "visibility": "private | followers | public",
  "relations": {
    "author": "docId-or-did",
    "attachments": ["storage://...", "doc://..."]
  }
}
```

Notes:

* `type` = **document type** (used for filters).
* `isContent` governs inclusion in the Content UI.
* `previewContract` lets the dashboard layout fast previews without fetching entire docs per card.

### 3.2 Files/Objects as Content

* Files gain a minimal wrapper record (virtual or materialized) with:

  * `isContent=true`, `type=media`, `mimeType`, `size`, `thumbnailRef`, `createdBy`, `createdAt`.
* Enables unified browsing alongside documents.

### 3.3 Engagement & Comments (standardized)

* **Engagement event** doc (append‑only):

```json
{
  "type": "engagementEvent",
  "contentId": "docId-or-objectId",
  "event": "impression | view | open | like | comment | share | purchase | unlock",
  "ts": "2025-08-24T12:34:56Z",
  "actor": "hashedUserIdOrNull",
  "appId": "app.example",
  "context": {"surface": "contentGrid | fullView | app"}
}
```

* **Comment** doc (shared service):

```json
{
  "type": "comment",
  "contentId": "docId-or-objectId",
  "author": "did:vibe:...",
  "body": "markdown or richtext",
  "ts": "2025-08-24T12:34:56Z",
  "replyTo": "commentId | null",
  "moderation": {"status": "ok | flagged | removed"}
}
```

* Aggregations materialized per content (`engagementStats`) for fast reads.

---

## 4) CouchDB Indexing & Discovery

### 4.1 Document type listing without full scans

* **Design doc** `types/byType`:

  * `map(doc) { if (doc.type) emit(doc.type, 1); }`
  * `reduce: _count`
* Query with `group=true` to get distinct types + counts.
* Incremental view indexing keeps it fast as data changes.

### 4.2 Content feed queries

* View or Mango index for `isContent=true` with `updatedAt` sort.
* Secondary filter by `type` (post/event/media/...).
* Text search (future): external index optional.

---

## 5) Dashboard IA & UX

### 5.1 Navigation (left rail)

* **Content** (default)
* **Create** (composer)
* **Advanced**

  * **Database** (Explorer)
  * **Storage**

*(Future)* Space switcher on top: **My Vibe** vs **Organization/Circle**.

### 5.2 Content surface (default)

* **Toolbar**:

  * Search box
  * Filter by **document type** (radio by default: Post, Event, Media, …)
  * **Multi‑select toggle** → enables chips for selecting multiple types
  * Sort (Newest, Most viewed, Most recent activity)
  * View switcher: **Grid** / **List** / **Masonry**
* **Cards/List rows** show:

  * Preview (from **preview renderer**) using `previewContract`
  * Title, excerpt, timestamp
  * Tiny metrics (views, comments, unlocks — optional toggle)
  * App badge and renderer picker
  * Quick actions: Open (full), Open in App, Share, More

### 5.3 Renderer selection & defaults

* **Per type default renderer** (user preference map: `type → appId`)
* **Per item override** via a card “Renderer” menu
* Remember most recent choice per type in this session

### 5.4 Layout rules & performance

* Cards honor `sizeHint` + `aspectRatio` from `previewContract`.
* Virtualized scrolling (windowing) for grid/list.
* Lazy‑load previews; limit concurrent iframes.
* Use IntersectionObserver to mount/unmount off‑screen previews.
* Fallback static preview if app preview is unavailable.

### 5.5 Open flows

* **Preview** (lightweight, fast; limited fields)
* **Full view** (embedded, near full‑screen; interactive; comments/paywall enabled)
* **Open in App** (navigates to app route)

### 5.6 Create flow (global composer)

* “Create” opens a modal/surface where user selects a target **document type** & **app** (or a default).
* Apps can register composable schemas for quick create (title/body/media).
* Saved item appears immediately in Content (optimistic UI).

---

## 6) Renderer Architecture (App Integration)

### 6.1 App manifest (example)

```json
{
  "appId": "app.example",
  "handles": ["post", "event"],
  "preview": {
    "path": "/render/preview",
    "requiredFields": ["contentSummary.title", "contentSummary.coverImageRef"],
    "sizeHint": "m",
    "aspectRatio": "4:3",
    "requiresAuth": false
  },
  "full": {
    "path": "/render/full",
    "requiresAuth": true,
    "supports": ["comment", "like", "share", "paywall"]
  }
}
```

### 6.2 Data delivery to renderers

* **Preview mode** (performance‑friendly):

  * Host fetches required fields and **injects structured JSON** via `postMessage` upon iframe `load`.
  * Contract: `VIBE_INIT` → `{ mode: "preview", contentId, data, capabilities }`.
  * Optional: `VIBE_REQUEST_FIELDS` if renderer needs one‑off extras (host may grant from cache).
* **Full mode**:

  * User likely signed in; renderer may use the app’s own APIs.
  * Host still passes a minimal init payload for context and metrics.

### 6.3 Security & policies

* Allowlist renderer origins per appId.
* Validate `postMessage` origin + schema.
* Strict CSP (`frame-ancestors`), sandbox flags in iframes.
* No host secrets/tokens provided to preview frames.

### 6.4 Performance guardrails

* Max N concurrent live preview iframes; others paused/snapshotted.
* Renderer can send `VIBE_HEIGHT` messages; host may clamp to grid slot.

---

## 7) SDK Requirements (Developer)

* **Creation API**: `createDocument({ type, isContent, body, contentSummary, relations, visibility })` → returns `_id`.
* **Mandatory fields**: `type`, `isContent`.
* **Preview contract**: apps declare `requiredFields`, `sizeHint`, `aspectRatio` in manifest; dashboard honors it.
* **Rendering**: app exposes `/render/preview` and `/render/full` routes.
* **VibeProvider preview mode**: `mode="preview"` skips full auth/bootstrap and reads injected data:

  * Example: `<VibeProvider mode="preview" initialData={dataFromHost}>`
* **Events API**: `trackEngagement({ contentId, event, context })` (sent by host and/or app).
* **Comments API** (shared): `listComments(contentId)`, `createComment(contentId, body)`.

---

## 8) Advanced Area

### 8.1 Database Explorer (three‑pane)

* **Left**: Document types (from `types/byType`), counts.
* **Middle**: Paginated list of documents for selected type (id, key fields, updatedAt).
* **Right**: JSON detail + schema hints; edit (if permitted), soft delete, copy curl.
* Query bar: Mango queries & saved filters. Export JSON.

### 8.2 Storage

* Buckets, objects, previews, metadata, lifecycle status.
* Link to related documents via `attachments`.

---

## 9) Analytics & Metrics (Privacy‑aware)

* **Standard counters** per content: impressions, opens, comments, likes, shares, unlocks.
* Time‑on‑content (approx) via heartbeat in full view.
* **Dash widgets**: Top content, trends over time, conversion to unlock.
* **Privacy**: opt‑in for per‑user metrics; otherwise aggregate w/ hashing & k‑anonymity thresholds.

---

## 10) Access Control & Spaces (Forward‑looking)

* Personal space (**My Vibe**) vs **Organization/Circle** space.
* Space switcher changes context of Content/Advanced.
* Certificates/roles define who can read/create/moderate.
* Org dashboard may aggregate from multiple branches (future spec).

---

## 11) Non‑Goals (for v0.1)

* Full‑text search across all content (can stub or integrate later).
* Cross‑space global feeds.
* Complex workflow/approval systems.

---

## 12) Open Questions

1. Do we allow preview frames to *fetch* any data, or must all preview data be injected?
2. Per‑document renderer overrides: persist globally or per user only?
3. How much of commenting UI is host‑native vs provided by app in full view?
4. Minimum engagement privacy floor (e.g., do not show counts < 5)?
5. Do we allow anonymous preview for public content when user is signed out?

---

## 13) Milestones

**M1 – Content MVP**

* `isContent` adopted in SDK.
* `types/byType` view + `isContent` index.
* Content grid/list with preview cards (static fallbacks).
* Renderer manifest + preview injection via `postMessage`.
* Basic comments (host‑native) + impressions/opens metrics.

**M2 – Full View & Creation**

* Full renderer embedding with auth.
* Global Create flow with app‑registered schemas.
* Renderer picker + per‑type defaults.

**M3 – Advanced & Analytics**

* Database Explorer + Storage views.
* Trend widgets + basic analytics.
* Org/Space switcher (scoped reads).

---

## 14) Acceptance Criteria (v0.1)

* Items with `isContent=true` appear in Content and can be filtered by `type`.
* Users can preview, open in full, and open in app for `post` and `media` examples.
* Renderer manifest honored for preview sizing and fields.
* Engagement events recorded for impressions and opens.
* Advanced → Database Explorer lists document types w/ counts via view; shows docs and detail.

---

## 15) Appendix: Example View & Index Definitions

* **Design doc** `types/byType` map/reduce as above (distinct types + counts).
* **Mango index** on `{ isContent: true, type: asc, updatedAt: desc }` for fast feeds.
* **Comments** stored in dedicated DB; per‑content `commentsCount` denormalized.

---

*End of v0.1. Ready for iteration and visual mockups.*





----------

Got it ✅ I’ll put this into a structured **requirements & specification document** for the Vibe Cloud Dashboard, based on everything you explored in that conversation. Here’s a first draft you can use as a foundation:

---

# Vibe Cloud Dashboard — Requirements & Specifications

## 1. Purpose & Vision

The Vibe Cloud Dashboard is the central hub where end users and content creators manage, view, and interact with their data and content. It must balance simplicity for casual users with transparency and advanced features for power users and developers.

Goals:

* Provide a **unified content experience** for end users.
* Offer **advanced transparency & database control** for power users.
* Support **third-party app integrations** seamlessly, without overwhelming developers.
* Empower creators with **engagement metrics** and monetization tools.
* Allow the dashboard itself to become a **place for content creation and interaction**, not only management.

---

## 2. User Roles & Audiences

* **Casual end users** → want a simple, clean interface to view, create, and share posts/events/media.
* **Content creators** → want to manage content, track engagement, monetize.
* **Power users / developers** → want access to raw database documents, storage, and configuration.
* **Organizations / Circles** (future scope) → want shared dashboards with content, members, and certificate-based access control.

---

## 3. Core Concepts

### 3.1 Content vs. Documents vs. Files

* **Content**: User-facing, shareable, interactive (e.g. posts, events, media, videos).
* **Documents**: General CouchDB records (may or may not be content).
* **Files**: Binary assets (media, docs) stored in storage (S3/MinIO).

➡ For **end users**, abstract this away into **Content**.
➡ For **advanced users**, expose Database + Storage separately.

### 3.2 Content Flagging

* Each document created through the SDK must specify if it is **content** (boolean).
* Clear **criteria for content**:

  * User-facing
  * Shareable / interactive
  * Created by a user (not background/app config)

### 3.3 Content Rendering

* Each app can provide a **renderer** for its content type.
* Two modes:

  * **Preview Mode** → minimal data fields, lightweight render (grid/list).
  * **Full View Mode** → iframe or embedded app page with full interactivity.
* Optional **Open in App** mode → launches the full app for editing/viewing.
* SDK integration: `useVibe` hook and `VibeProviderContext` can feed preview data directly.

---

## 4. Dashboard Structure

### 4.1 Navigation

* **Unified Content** (default for most users).
* **Advanced Section** (optional/toggled): Database, Storage.
* **Profile, Files, Certificates, Settings** as separate areas.

### 4.2 Content Section Layout

* Default view: **Unified feed/grid** of all content (sorted by newest).
* **Filters**:

  * Quick tabs/buttons for Posts, Events, Media.
  * Multi-select toggle for combining filters.
* **View modes**:

  * Grid / Pinterest-style cards (dynamic size per content type).
  * Table/list view (Google Drive style).

### 4.3 Interaction Flow

* Click on content → open in Preview or Full View.
* Per-content menu → choose renderer app.
* Create new content directly from dashboard (abstracted, no app required).

---

## 5. Developer Requirements

### 5.1 SDK Rules

* Must declare `isContent: true/false`.
* Must register **renderer** for content preview/full view.
* Optional: Define **preview fields** needed for minimal rendering.

### 5.2 Terminology

* **Document Type** → storage/collection grouping in CouchDB.
* **Content Category** → designation for dashboard rendering (e.g. Post, Event).

---

## 6. Engagement & Monetization

### 6.1 Engagement Metrics

* Views (reads).
* Time spent (where possible).
* Interactions (likes, comments, shares).
* Paid unlocks / purchases (for paywalled content).

### 6.2 Dashboard Display

* Engagement shown on grid/list cards (toggle on/off).
* Analytics section for creators → trends, best-performing content.

---

## 7. Community & Interaction

* **Unified commenting system** → available on all content (not app-specific).
* **Likes/Reactions** (optional extension).
* **Sharing & visibility settings** → public, private, circle-based.

---

## 8. Performance & Technical Considerations

* Use **caching / prefetching** for preview rendering.
* Previews should only load **minimal fields**.
* Avoid performance strain from multiple iframes (use structured data or postMessage).
* Full views may require user login.

---

## 9. Future Scope (Phase 2+)

* **Organization dashboards** (Circles, certificate-based).
* **Cross-dashboard global queries** (show content across multiple user/org dashboards).
* **Customizable dashboard layout** (pinning, personalization).

---

✅ This captures the **requirements, flows, and technical specs** from your conversation.

Would you like me to now **turn this into a visual architecture diagram / flowchart** (showing how content flows between apps, database, and dashboard), or keep it as a text-only requirements doc for now?

