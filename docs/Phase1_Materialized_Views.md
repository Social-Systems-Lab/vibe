# Phase 1 Design: Centralized Pre-aggregation (Materialized Views)

## 1. Problem Statement

The current data aggregation model for global queries, such as `read("posts", { global: true })`, presents a significant scalability challenge. The `vibe-cloud-api` performs on-the-fly aggregation by querying every user's database for each request. This process is resource-intensive and leads to high latency that increases linearly with the number of users. The real-time subscription model for these queries further exacerbates the issue, as the server must maintain a constant watch over all user databases for changes.

This document outlines a plan to mitigate these issues as a first step towards a more scalable architecture.

## 2. Goal

The primary goal of Phase 1 is to **immediately and significantly improve the performance and scalability of high-traffic global queries** with minimal changes to the client-side `vibe-sdk` and application code. We aim to provide a fast, consistent response time for these queries, regardless of the number of users on the platform.

## 3. Proposed Solution: Materialized Views

We will implement a system of "Materialized Views" on the server-side. This involves a background worker that pre-aggregates the results of common global queries and stores them in dedicated, optimized CouchDB databases. The API will then serve requests from these pre-computed databases instead of performing live, expensive aggregations.

### 3.1. Architectural Components

#### 3.1.1. Global Feed Registry

A new configuration or a dedicated database within `vibe-cloud-api` will be created to act as a registry for global feeds that require pre-aggregation. This provides a centralized and configurable way to manage which feeds are optimized.

**Example Registry (`global-feeds.json`):**

```json
[
    {
        "collectionName": "posts",
        "materializedViewName": "_global_posts",
        "aggregationInterval": "5m",
        "query": {
            "selector": { "type": "post" },
            "fields": ["_id", "content", "author", "createdAt"],
            "sort": [{ "createdAt": "desc" }]
        }
    },
    {
        "collectionName": "events",
        "materializedViewName": "_global_events",
        "aggregationInterval": "10m",
        "query": {
            "selector": { "type": "event", "isPublic": true },
            "fields": ["_id", "title", "location", "startTime", "organizer"],
            "sort": [{ "startTime": "asc" }]
        }
    }
]
```

#### 3.1.2. Generic Aggregation Worker

A new background service will be added to the `vibe-cloud-api`. Its responsibilities are:

1.  Periodically read the Global Feed Registry.
2.  For each registered feed, execute the defined query across all relevant user databases.
3.  Write the aggregated results into the corresponding `materializedViewName` database, completely replacing its previous contents.
4.  The process will run at the `aggregationInterval` defined for each feed.

#### 3.1.3. Modified API Endpoint

The existing API endpoint for queries (e.g., `/data/:collection/query`) will be updated:

1.  When a request with `global: true` is received for a `:collection`, the API will first consult the Global Feed Registry.
2.  **If a materialized view is registered** for the collection, the API will serve the request directly and efficiently from that pre-aggregated database.
3.  **If no view is registered**, the request will be rejected. This is a safety measure to prevent unoptimized, expensive queries from overloading the system.

### 3.2. Architectural Diagram

```mermaid
graph TD
    subgraph Client-Side
        App["App (e.g., vibe-feeds)"] -- sdk.read('posts', {global: true}) --> SDK["vibe-sdk"]
        SDK -- postMessage --> Hub["hub.html"]
        Hub -- HTTP/WebSocket --> APIEndpoint["/data/posts/query?global=true"]
    end

    subgraph Server-Side (vibe-cloud-api)
        APIEndpoint -- 1. Lookup 'posts' in Registry --> Registry["Global Feed Registry"]
        Registry -- 2. Found: Use _global_posts --> APIEndpoint
        APIEndpoint -- 3. Reads from --> MaterializedPosts["Materialized View (_global_posts DB)"]

        subgraph Background Process
            Worker["Generic Aggregation Worker"] -- Reads definitions --> Registry
            Worker -- Runs aggregation for each feed --> QueryEngine["Query All User DBs"]
            QueryEngine -- Aggregates results --> MaterializedPosts
        end
    end

    APIEndpoint -- Returns pre-aggregated data --> Hub
```

## 4. Pros and Cons

### Pros

-   **Drastic Performance Improvement:** Query response times become fast and constant.
-   **Minimal Client-Side Impact:** No changes are required for app developers using the SDK. The `read({ global: true })` interface is preserved.
-   **Increased Stability:** Protects the main API from being overloaded by expensive queries.
-   **Quick to Implement:** Delivers significant value with a backend-focused, relatively low-effort implementation.

### Cons

-   **Data Latency:** Data is not truly real-time. The "freshness" of the data is limited by the `aggregationInterval`.
-   **Limited Flexibility:** Only registered queries are optimized. Ad-hoc global queries are not supported.
-   **Centralization Persists:** The aggregation workload remains on the server, albeit shifted to a background process. This is a scaling mitigation, not a fundamental architectural shift to decentralization.

## 5. Next Steps

This document serves as the plan for implementing Phase 1. Upon approval, development can begin on the server-side components. This phase will act as a crucial stopgap, solving the immediate performance issues and providing the stability needed to design and implement the more advanced, client-centric solutions in subsequent phases.
