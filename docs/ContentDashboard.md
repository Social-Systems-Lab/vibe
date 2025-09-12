# Vibe Cloud Dashboard – Content & Database Spec (v0.3 · 2025-09-03)

## 0) Purpose

Create a single, coherent dashboard experience in Vibe Cloud that:

-   Feels like “Google Drive for self‑sovereign content”, but works across any third‑party apps.
-   Lets end‑users and creators manage the full lifecycle of their **Content** (create, view, edit).
-   Gives power users/devs **Advanced** tools for Database and Storage.
-   Provides a **content manager model** so apps can provide UIs for creating, viewing, and editing their content from within the dashboard.

---

## 1) Audience & Modes

**Primary audiences**

1.  **End‑users / creators** – manage, create, browse, filter, preview, and open content. Focus on simplicity.
2.  **Power users / developers** – inspect raw documents, run queries, manage types, debug data.

**UI Modes**

-   **Simple (default)** – Content‑centric. Unified view of posts/events/media/etc.
-   **Advanced** – Database Explorer (CouchDB docs), Storage (files/objects) with low‑level controls.

---

## 2) Core Concepts & Terminology

-   **Document**: A CouchDB JSON document (e.g., a post, event, config, profile, etc.).
-   **Content**: A document that is considered user-facing and is managed by an app through a registered **Content Manager**.
-   **Content Manager**: A registration document (`type: "manager"`) that defines how to handle a specific content type. It includes rules for identifying the content and provides the UI paths for creating, viewing (preview/full), and editing it.

---

## 3) Content Discovery: The Content Manager Registry & Compiler

Vibe uses a dynamic, rule-based system for content discovery and management.

1.  **Source of Truth**: Apps register their capabilities by defining **Content Managers** in their manifest. During the user consent process, these definitions are used to create `type: "manager"` documents in the user's database.
2.  **Compiler Service**: A backend service automatically watches for changes to these manager documents.
3.  **Code Generation**: When a manager document is created or updated, the compiler generates a dedicated CouchDB design document (e.g., `_design/manager_my-app_post`) containing a `map` function. This function is a compiled JavaScript version of the matching rules.
4.  **Efficient Querying**: The dashboard queries the views in these generated design documents to efficiently find all content across all apps.

### 3.1 Content Manager Registry Schema

This is the core document that defines a content manager.

```json
{
    "_id": "manager/app-client-id/post",
    "type": "manager",
    "managerId": "app-client-id/post",
    "appClientId": "app-client-id",
    "label": "Post",
    "version": 1,
    "enabled": true,
    "rules": {
        "all": [{ "eq": ["type", "post"] }, { "exists": "contentSummary" }]
    },
    "display": {
        "sortField": "createdAt",
        "icon": "MessageSquare"
    },
    "managerPaths": {
        "create": "/manage/post/create",
        "edit": "/manage/post/edit/{docId}",
        "view": {
            "preview": "/render/preview",
            "full": "/render/full"
        }
    }
}
```

---

## 4) CouchDB Indexing & Discovery

Content discovery is handled by the compiled design documents.

-   **Per-Manager Design Docs**: Each manager registry entry results in a design document (e.g., `_design/manager_app-client-id_post`) with a view.
-   **Generated Map Function**: The view's `map` function contains the compiled rules.
-   **Dashboard Querying**: The dashboard fetches the list of all enabled managers, queries each of their views in parallel, and merges the results client-side to build the unified content feed.

---

## 5) SDK & App Integration

-   **Manifest Definition**: Apps define their `contentManagers` in their `VibeManifest`.
-   **Registration on Consent**: When a user consents to an app, the backend reads the `contentManagers` from the manifest and creates the corresponding `type: "manager"` documents in the user's database.
-   **UI Implementation**: Apps must provide the pages for the `create`, `edit`, `preview`, and `full` paths they defined.

---

## 6) Milestones (v0.1)

**M1 – Backend Foundation**

-   Finalize and implement the `type: "manager"` schema.
-   Update the `VibeManifest` type in the SDK to include `contentManagers`.
-   Update the `IdentityService` to process `contentManagers` during app consent.
-   Build the compiler service in `DataService` to generate design docs from manager registrations.

**M2 – Dashboard & Client-side Integration**

-   Implement the client-side service to query and merge results from all manager views.
-   Build the basic Content grid/list UI, including "Create" and "Edit" buttons that link to the appropriate app UIs.

**M3 – End-to-End Flow**

-   Update an example app to register a `contentManager`.
-   Implement the `create`, `edit`, `preview`, and `full` pages in the example app.
-   Test the full lifecycle: creating content from the dashboard, seeing it in the list, and opening it for editing.

---

_End of v0.3. Ready for implementation._
