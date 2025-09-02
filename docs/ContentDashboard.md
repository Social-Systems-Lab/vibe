# Vibe Cloud Dashboard – Content & Database Spec (v0.2 · 2025-09-02)

## 0) Purpose

Create a single, coherent dashboard experience in Vibe Cloud that:

-   Feels like "Google Drive for self‑sovereign content", but works across any third‑party apps.
-   Lets end‑users and creators manage **Content** without caring whether it's a DB document or a stored file.
-   Gives power users/devs **Advanced** tools for Database and Storage.
-   Provides a **renderer model** so apps control how their content looks (preview + full view) inside the dashboard.
-   Standardizes **engagement metrics** and **comments** across all content.

---

## 1) Audience & Modes

**Primary audiences**

1.  **End‑users / creators** – manage, create, browse, filter, preview, and open content. Focus on simplicity.
2.  **Power users / developers** – inspect raw documents, run queries, manage types, debug data.
3.  **Admins (future)** – organizational context, access control, and circle-level dashboards.

**UI Modes**

-   **Simple (default)** – Content‑centric. Unified view of posts/events/media/etc.
-   **Advanced** – Database Explorer (CouchDB docs), Storage (files/objects) with low‑level controls.
-   Mode switching: a toggle in the left nav (persist per user/space).

---

## 2) Core Concepts & Terminology

-   **Document**: A CouchDB JSON document (e.g., a post, event, config, profile, etc.).
-   **File / Object**: A stored file (e.g., image/video) living in Storage (e.g., S3‑compatible).
-   **Content**: A document or file that is considered user-facing and displayable in the dashboard. A document is identified as content if it **matches the rules** defined in a Renderer Registry document.
-   **Renderer**: An app‑provided UI that renders a piece of content inside the dashboard.
    -   **Preview renderer**: lightweight card/tile representation.
    -   **Full renderer**: immersive, interactive view.
-   **Renderer Registry**: A collection of documents (`type: "renderer"`) that define which apps can render specific types of content. Each registry document contains matching rules that the system uses to identify content.

---

## 3) Content Discovery: The Renderer Registry & Compiler

To avoid burdening developers with a manual `isContent` flag, Vibe uses a dynamic, rule-based system for content discovery.

1.  **Source of Truth**: Apps register their content types by creating a **Renderer Registry document**. This document specifies a set of rules (e.g., `doc.type === "post" && doc.author`) that define what constitutes a piece of content for that app.
2.  **Compiler Service**: A backend service automatically watches for changes to these registry documents.
3.  **Code Generation**: When a registry document is created or updated, the compiler generates a dedicated CouchDB design document (e.g., `_design/renderer_my-app_post`) containing a `map` function. This function is a compiled JavaScript version of the matching rules.
4.  **Efficient Querying**: The dashboard queries the views in these generated design documents to efficiently find all content across all apps. This approach scopes index rebuilds only to the apps that change their definitions.

### 3.1 Renderer Registry Schema

This is the core document that apps create to register a content type.

```json
{
    "_id": "renderer/app-client-id/post",
    "type": "renderer",
    "rendererId": "app-client-id/post",
    "appClientId": "app-client-id",
    "label": "Post",
    "version": 1,
    "enabled": true,
    "rules": {
        "all": [{ "eq": ["type", "post"] }, { "exists": "author" }, { "exists": "name" }, { "exists": "content" }]
    },
    "display": {
        "sortField": "createdAt",
        "icon": "MessageSquare"
    },
    "renderPaths": {
        "preview": "/render/preview",
        "full": "/render/full"
    }
}
```

### 3.2 Minimum Document Schema (SDK Suggestion)

With the registry model, an `isContent` flag is no longer needed in the document itself.

```json
{
    "_id": "...",
    "type": "post", // Matches the rule in the renderer registry
    "createdBy": { "...": "..." },
    "createdAt": "2025-09-02T10:00:00Z", // Used for sorting
    "updatedAt": "2025-09-02T10:00:00Z",
    "contentSummary": {
        "title": "...",
        "excerpt": "...",
        "coverImageRef": "storage://bucket/key"
    }
}
```

---

## 4) CouchDB Indexing & Discovery

Content discovery is handled by the compiled design documents.

-   **Per-Renderer Design Docs**: Each renderer registry entry results in a design document (e.g., `_design/renderer_app-client-id_post`) with a view.
-   **Generated Map Function**: The view's `map` function contains the compiled rules. For the example above, it would be:
    ```javascript
    function (doc) {
      if (doc.type === "post" && doc.author && doc.name && doc.content) {
        emit([doc.createdAt || doc._id, doc._id], null);
      }
    }
    ```
-   **Dashboard Querying**: The dashboard fetches the list of all enabled renderers, queries each of their views in parallel, and merges the results client-side to build the unified content feed.

---

## 5) Dashboard IA & UX

(This section remains largely the same, as the UI/UX is not directly affected by the backend discovery mechanism.)

### 5.1 Navigation (left rail)

-   **Content** (default)
-   **Create** (composer)
-   **Advanced**
    -   **Database** (Explorer)
    -   **Storage**

### 5.2 Content surface (default)

-   **Toolbar**:
    -   Search box
    -   Filter by **document type** (radio by default: Post, Event, Media, …)
    -   **Multi‑select toggle** → enables chips for selecting multiple types
    -   Sort (Newest, Most viewed, Most recent activity)
    -   View switcher: **Grid** / **List** / **Masonry**
-   **Cards/List rows** show:
    -   Preview (from **preview renderer**)
    -   Title, excerpt, timestamp
    -   App badge and renderer picker
    -   Quick actions: Open (full), Open in App, Share, More

---

## 6) Renderer Architecture (App Integration)

### 6.1 App Manifest & Renderer Registration

Apps declare their rendering capabilities by creating one or more **Renderer Registry documents** (as defined in Section 3.1). This is typically done once during app installation or activation via an SDK call.

The app's `VibeManifest` will be updated to include a section for defining these renderers, which the SDK can then use to register them.

```json
// Example addition to VibeManifest in vibe-sdk
"contentRenderers": [
  {
    "id": "post",
    "label": "Post",
    "rules": { "all": [{ "eq": ["type", "post"] }, { "exists": "content" }] },
    "display": { "sortField": "createdAt" },
    "renderPaths": { "preview": "/render/preview", "full": "/render/full" }
  }
]
```

### 6.2 Data delivery to renderers

(This section remains the same.)

-   **Preview mode** (performance‑friendly):
    -   Host fetches required fields and **injects structured JSON** via `postMessage` upon iframe `load`.
-   **Full mode**:
    -   User likely signed in; renderer may use the app's own APIs.

---

## 7) SDK Requirements (Developer)

-   **Renderer Registration**: The SDK will provide a method for an app to register its content renderers with the Vibe backend, which will create the `type: "renderer"` documents.
-   **Document Creation**: The `createDocument` API no longer requires an `isContent` flag. Developers simply create documents that conform to the structure they defined in their renderer rules.
-   **Rendering**: Apps must expose the `/render/preview` and `/render/full` routes as specified in their renderer registration.

---

## 8) Advanced Area

(This section remains the same.)

### 8.1 Database Explorer (three‑pane)

### 8.2 Storage

---

## 9) Milestones (v0.1)

**M1 – Backend Foundation**

-   Finalize and implement the `type: "renderer"` schema.
-   Build the compiler service in `vibe-cloud-api` to generate design docs from renderer registrations.
-   Create an SDK method and API endpoint for apps to register their renderers.

**M2 – Dashboard & Client-side Integration**

-   Implement the client-side service in `vibe-cloud-ui` to query and merge results from all renderer views.
-   Build the basic Content grid/list UI with filtering by renderer `label`.
-   Implement the iframe-based preview renderer system using `postMessage`.

**M3 – End-to-End Flow**

-   Update an example app to register a renderer.
-   Demonstrate that creating a matching document in the example app makes it appear correctly in the dashboard's Content section.

---

## 10) Open Questions

(This section remains relevant.)

1.  Do we allow preview frames to _fetch_ any data, or must all preview data be injected?
2.  Per‑document renderer overrides: persist globally or per user only?
3.  How much of commenting UI is host‑native vs provided by app in full view?
4.  Do we allow anonymous preview for public content when user is signed out?

---

## 11) Future Considerations & Out of Scope for v0.1

This section contains features from the original spec that are important but not critical for the initial implementation of the Content Dashboard.

### 11.1 Engagement & Comments

-   **Engagement event** doc (`impression`, `view`, `like`, etc.).
-   **Comment** doc and a shared commenting service.
-   Materialized `engagementStats` for fast reads.

### 11.2 Analytics & Metrics

-   Standard counters per content (impressions, opens, etc.).
-   Dashboard widgets for trends and top content.
-   Privacy-aware metrics.

### 11.3 Access Control & Spaces

-   Personal space (**My Vibe**) vs **Organization/Circle** space.
-   Space switcher to change the context of the dashboard.

### 11.4 Other Features

-   Full-text search across all content.
-   Cross-space global feeds.
-   Complex workflow/approval systems.

---

_End of v0.2. Ready for implementation._
