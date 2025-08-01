# Phase 0 Design: Live Global Database & Shared Worker

## 1. Abstract

This document outlines a new foundational architecture for data aggregation on the Vibe platform. It supersedes the "Materialized Views" concept in favor of a more robust, real-time solution. The core of this approach is a centralized **Global Database** that contains live copies of all documents with public-facing Access Control Lists (ACLs), updated directly on every `write()` operation. This is complemented by the introduction of a **SharedWorker** on the client-side to ensure efficient resource management.

This design addresses key scalability challenges while providing a solid, extensible foundation for future features.

## 2. Core Components

### 2.1. Client-Side: SharedWorker

To ensure efficient multi-tab operation and prepare for more advanced client-side logic, a `SharedWorker` will be implemented within `hub.html`.

-   **Purpose**: The `SharedWorker` will act as a singleton resource manager for all Vibe-related activities within the same origin.
-   **Responsibilities**:
    -   Managing a single PouchDB instance for local caching, eliminating redundant syncs and listeners from multiple tabs.
    -   Handling all API communication, centralizing requests.
    -   Serving as the foundation for future client-side processing, such as the "Magnetic Feeds" concept.
-   **Benefit**: Reduces CPU, memory, and network overhead when a user has multiple application tabs open.

### 2.2. Server-Side: The Global Database

A new, central CouchDB database, named `global` (CouchDB reserves the `_` prefix for system databases), will be created within the `vibe-cloud-api`.

-   **Purpose**: To hold a live, aggregated collection of all documents from all users that are explicitly marked as accessible to others via their ACLs.
-   **Mechanism**: This database is populated and maintained in real-time during standard data operations, not by a background batch process.

## 3. Data Flow and Logic

### 3.1. Modified `write()` Operation

The primary change is in the `vibe-cloud-api`'s data writing endpoint (e.g., `/data/:collection`).

1.  A standard `write()` request is received for a user's personal database.
2.  The document is written to the user's personal database as usual.
3.  **After the write, the API inspects the document's ACL.**
4.  **If the ACL permits global access**:
    -   The API transforms the document's ID to prevent collisions (see Section 4.1).
    -   The API creates and writes a lean "pointer" document (a DocRef) to the `global` database (see Section 4.3).
5.  **If an existing document's ACL is updated to remove global access**:
    -   The API deletes the corresponding document from the `global` database.

### 3.2. Modified `read({ global: true })` Operation

The global read operation becomes significantly simpler and faster.

1.  A `read()` request with `{ global: true }` is received.
2.  The API ignores the user's personal database and **queries the `global` database directly.**
3.  Real-time subscriptions (`read()` with a callback) will listen to the `_changes` feed of the `global` database, which is highly efficient.

### 3.3. Architectural Diagram

```mermaid
sequenceDiagram
    participant App
    participant SDK
    participant Hub as hub.html (SharedWorker)
    participant API as vibe-cloud-api
    participant UserDB as User's Personal DB
    participant GlobalDB as global DB

    App->>SDK: sdk.write('posts', {..., acl: {global: true}})
    SDK->>Hub: postMessage({ type: 'DB_WRITE', ... })
    Hub->>API: POST /data/posts

    API->>UserDB: Writes original document
    UserDB-->>API: Success

    API->>API: Inspects ACL -> Global access is true
    API->>API: Transform ID (e.g., 'posts/did:user:abc/...')
    API->>GlobalDB: Writes DocRef pointer document
    GlobalDB-->>API: Success

    API-->>Hub: Write operation successful
    Hub-->>SDK: Success
    SDK-->>App: Success
```

## 4. Key Architectural Challenges & Solutions

### 4.1. Document ID Collision

**Problem**: Documents from different users might have the same `_id`, which would cause conflicts in the `global` database.

**Solution**: We will enforce unique and queryable IDs in the `global` database by creating a composite key that preserves the collection prefix.

-   **Original `_id`**: `posts/1753556109407-4da7b627643df8`
-   **Owner's DID**: `did:vibe:zDxUwpkymXAzDwiKMvwWeYtWS6r7JdxvCWX5fEaK1enUsbTrU`
-   **Global DB `_id`**: `posts/did:vibe:zDxUwpkymXAzDwiKMvwWeYtWS6r7JdxvCWX5fEaK1enUsbTrU/1753556109407-4da7b627643df8`

This format guarantees uniqueness and allows for efficient range queries on the `_id` field to retrieve all documents for a specific collection (e.g., using `startkey="posts/"`).

### 4.2. Sequencing and Fetching Changes

**Problem**: A common and critical operation will be for clients to fetch only what's new since their last query.

**Solution**: We will leverage CouchDB's native **filtered `_changes` feed**. This allows clients to subscribe to changes for only the collections they are interested in.

1.  **Design Document**: A design document will be created in the `global` database with a filter function that matches documents based on their collection prefix.
    ```javascript
    // In _design/app
    {
      "filters": {
        "by_collection": "function(doc, req) { return doc._id.startsWith(req.query.collection + '/'); }"
      }
    }
    ```
2.  **Client Request**: The client can then request a changes feed for a specific collection.
    `GET /global/_changes?filter=app/by_collection&collection=posts`
3.  **Sequencing**: This feed provides a `last_seq` value, allowing the client to resume listening from that point using the `since` parameter, ensuring no updates are missed.

### 4.3. Global Document Structure (DocRefs)

**Problem**: Storing full copies of documents in the `global` database leads to significant data duplication and can make the central database very large.

**Solution**: The `global` database will not store full documents. Instead, it will store lightweight "pointer" documents, or **DocRefs**. This keeps the global database lean and fast, serving as a discoverable index of content, while leveraging the client's existing `_expand` and caching logic to fetch the full data.

-   **Example DocRef in `global` database**:
    ```json
    {
        "_id": "posts/did:vibe:zDxUwpkymXAzDwiKMvwWeYtWS6r7JdxvCWX5fEaK1enUsbTrU/1753556109407-4da7b627643df8",
        "_rev": "1-...",
        "ref": {
            "did": "did:vibe:zDxUwpkymXAzDwiKMvwWeYtWS6r7JdxvCWX5fEaK1enUsbTrU",
            "ref": "posts/1753556109407-4da7b627643df8"
        },
        "acl": { "read": { "allow": ["*"] } }
    }
    ```
-   **Client Workflow**:
    1.  Client fetches a list of these DocRefs from the `global` database.
    2.  For each DocRef, the client uses the `vibe-sdk`'s `_expand` mechanism to fetch the full document content from its original location (`did` + `docId`).
    3.  The results are served from the client's local PouchDB cache if available, minimizing API calls.

## 5. Future Considerations

This Phase 0 architecture provides a powerful foundation. The `global` database, replicated locally to the client's PouchDB via the SharedWorker, becomes the ideal source for client-side aggregation features like "Magnetic Feeds" to operate on, without needing to iteratively fetch from every user. This design is not a temporary fix, but the first major step in our long-term scalability strategy.
