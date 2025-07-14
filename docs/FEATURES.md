# Vibe SDK: Data Expansion and Caching Architecture

This document summarizes the implementation of two key features in the Vibe SDK: **Data Expansion** and **Server/Client-Side Caching**. These features work together to allow applications to efficiently query and display data from multiple users' databases while minimizing latency and network traffic.

---

## 1. Data Expansion (`expand`)

The `expand` feature allows an application to request that a reference to another document (`DocRef`) be replaced with the actual content of that document at query time.

### Key Concepts

-   **`DocRef` (Document Reference):** A special object used to link to a document in another user's database. It has the shape:

    ```typescript
    type DocRef = {
        did: string; // The DID of the user who owns the document
        ref: string; // The _id of the document being referenced
    };
    ```

    For example, a `Post` document might store its author as a `DocRef` pointing to a `Profile` document in the author's database.

-   **`expand` Query Parameter:** The `readOnce()` and `read()` methods accept an `expand` parameter in the query object. This tells the system which field(s) containing `DocRef`s should be expanded.
    ```javascript
    // Example: Fetch posts and expand the 'author' field
    sdk.readOnce("posts", { expand: "author" });
    ```

---

## 2. Caching Architecture

To make the `expand` feature efficient, a robust caching layer has been implemented. The core principle is to **cache only remote documents** (data belonging to other users) inside the current user's database. This avoids redundant network fetches for frequently accessed data, like user profiles.

### Caching Logic

The caching logic is applied automatically when the `expand` parameter is used. Developers can control its behavior with the `maxCacheAge` parameter.

-   **`maxCacheAge` (in seconds):** An optional parameter in the query object.

    -   **`maxCacheAge: 0`**: Forces a refresh. The cache is ignored, and fresh data is always fetched.
    -   **`maxCacheAge: 600`**: Use cached data if it is less than 10 minutes old.
    -   **`maxCacheAge: undefined` (default):** Use cached data if it exists, regardless of its age.

    ```javascript
    // Example: Fetch posts, expand the author, and use cache if it's less than 5 minutes old.
    sdk.readOnce("posts", {
        expand: "author",
        maxCacheAge: 300,
    });
    ```

### Cached Document Structure

Cached items are stored in the user's database with a special, queryable ID format and a metadata wrapper.

-   **ID Schema:** `cache/<did>/<ref>`
-   **Structure:**
    ```typescript
    interface CachedDoc<T> {
        _id: string; // e.g., "cache/did:vibe:abc-123/profiles/me"
        _rev?: string;
        type: "cache";
        data: T; // The actual remote document
        cachedAt: number; // Unix timestamp (ms)
        originalDid: string;
        originalRef: string;
    }
    ```

---

## 3. Strategy-Specific Implementations

The caching and expansion logic is implemented differently depending on the SDK strategy to maximize performance and security.

### `Standalone` Strategy

-   **Server-Side Logic:** All caching and expansion logic is handled securely on the **server** within the `vibe-cloud-api`'s `DataService`.
-   **Flow:** When the API receives a query with `expand`, it checks the current user's database for a fresh cached version of the remote document. If the cache is missing or stale (based on `maxCacheAge`), the API fetches the data directly from the remote user's database, updates the cache, and then returns the fully expanded result to the client.

### `Hub` Strategy

-   **Client-Side Logic:** All caching and expansion logic is handled on the **client** inside the sandboxed `hub.html` iframe.
-   **Flow:** When the Hub receives a query with `expand`, it checks its local PouchDB instance for a fresh cached version. If the cache is missing or stale, the Hub makes a fetch to the `/data/expand` API endpoint, updates its local PouchDB cache, and then returns the fully expanded result to the application. This local-first approach minimizes API calls.

---

## 4. Key Bug Fixes

-   **Hub Expansion Bug:** A critical bug was fixed where the Hub would incorrectly assume all `DocRef`s pointed to the local user's data. The logic now correctly differentiates between local and remote DIDs, ensuring the correct documents are fetched and expanded.
-   **Hub Sync Race Condition:** An issue causing 401 errors during PouchDB sync was resolved by implementing a short-lived, in-memory session cache in the `IdentityService`, preventing database credentials from being invalidated during an active sync.
