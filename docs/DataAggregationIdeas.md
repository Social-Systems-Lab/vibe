# Ideas for Core Components in Data Aggregation on the Vibe Platform

This document synthesizes ideas from our discussion on enhancing data aggregation within the Vibe platform. It builds on the existing architecture (decentralized user-owned CouchDB databases with centralized orchestration via `vibe-cloud-api`) and focuses on distributing aggregation work to clients to improve scalability, reduce server costs, and enable features like global aggregated feeds. The primary concept explored is "magnetic feeds"—throttled, shareable aggregate queries that offload computation to clients while pooling resources for efficiency.

The goal is to provide a foundation for discussion, highlighting potential implementations, integrations with existing components (e.g., Hub Mode, Standalone Mode, PouchDB), and challenges. This can evolve Vibe toward a more decentralized, collaborative ecosystem, addressing current limitations like the N+1 query problem in global feeds.

## Introduction and Motivation

Vibe's current architecture enables basic global aggregated feeds by querying multiple user databases via `vibe-cloud-api` (as seen in `readOnce` and `performGlobalQuery`). However, this centralizes heavy lifting on the server, leading to scalability issues (e.g., high latency proportional to user count, lack of true content discovery).

To address this, we propose distributing aggregation to clients using browser-based workers and local databases (PouchDB). This aligns with Vibe's hybrid model: users retain data ownership, while clients collaborate on aggregates. Key inspirations include peer-to-peer systems (e.g., IPFS for sharing, gossip protocols for discovery) and eventual consistency models.

Core principles:

-   **Client-Side Offloading**: Use browsers/apps for throttled computations to minimize server load.
-   **Resource Pooling**: Allow users with similar needs to share work, reducing individual costs.
-   **Persistence and Sharing**: Leverage PouchDB for local caching that persists across sessions and tabs.
-   **Modes**: Integrate with Hub Mode (iframe-based local proxy) and Standalone Mode (direct API calls).

## Core Concept: Magnetic Feeds

Magnetic feeds are client-registered aggregate queries that run throttled (e.g., every 10-15 minutes, on-demand, or at a slow pace) to prepare data without requiring instant results. They "attract" data over time, enabling eventual consistency for non-real-time use cases like global post feeds.

### Key Features

-   **Registration and Throttling**: Users/apps register feeds via the SDK (e.g., `{ collection: "posts", filter: { createdAt: { $gt: "24h ago" } }, global: true }`) with params like throttle rate or compute budget.
-   **Distributed Execution**: Clients perform queries locally or against peers, caching results in PouchDB.
-   **Pooling and Sharing**: Similar feeds form "pools" via a registry (centralized on `vibe-cloud-api` or decentralized DHT). Users contribute compute (e.g., each handles 10% of aggregation) and share results (e.g., via WebRTC or IPFS).
-   **Use Case: Global Index**: For a global post feed, clients build/maintain a distributed index (e.g., Merkle tree of post hashes), discovering new content peer-to-peer.

This reduces server queries, enables offline access, and scales with users.

## Leveraging Browser Workers for Distributed Work

Browser workers (Web Workers and Shared Workers) enable background tasks without blocking the UI, ideal for magnetic feed computations (e.g., aggregating data, syncing caches).

### Web Workers Overview

-   **Capabilities**: Handle CPU-intensive tasks like merging posts, filtering queries, or building local indexes. Can process 100–10,000 items per burst (1–30 seconds) on typical devices.
-   **Activity and Lifecycle**: Active while the originating tab/page is loaded; throttled in background tabs (e.g., Chrome suspends after 30–60 seconds). Terminates on tab close.
-   **Abuse Prevention**: Browsers throttle CPU/memory (e.g., to prevent crypto mining) via quotas, tab suspension, and battery-aware limits. This encourages efficient, short bursts—aligning with magnetic feeds' throttled nature. No major impact on Vibe, as tasks are opt-in and user-beneficial.
-   **Limitations**: No DOM access; variable performance (slower on mobile); terminated on inactivity.

### Shared Workers for Multi-Tab Efficiency

-   **Purpose**: A variant of Web Workers shareable across tabs/iframes (same origin). One instance manages tasks, with ports for communication.
-   **Advantages**: Centralizes operations (e.g., one sync handler), reduces redundancy in multi-tab scenarios.
-   **Integration with Vibe**:
    -   Spawn from `hub.html` (Hub Mode) or directly in apps (Standalone Mode).
    -   Example: Host PouchDB in the worker for shared access.

## PouchDB Integration for Local Persistence and Sharing

PouchDB provides a local, offline-capable database that syncs with remote CouchDB, perfect for caching aggregates.

### Persistence and Sharing Mechanics

-   **Persistence**: Data stored in IndexedDB survives tab closures, browser restarts, and device reboots (until cleared). Ideal for magnetic feeds—e.g., cache global posts locally for quick access.
-   **Cross-Tab Sharing**: Storage is shared across tabs (same origin and DB name). Multiple PouchDB instances (one per tab) access the same IndexedDB data, ensuring consistency. Writes in one tab are visible in others.
-   **Instance-Level Isolation**: Each `new PouchDB()` is separate, leading to potential redundancy (e.g., multiple syncs/listeners). Use Shared Workers to centralize into one instance.

### In Hub Mode

-   **Current Setup**: Each tab's iframe loads `hub.html`, creating a per-iframe PouchDB instance. Storage is shared via IndexedDB, but syncs/listeners are duplicated.
-   **Enhanced with Shared Worker**:

    -   Spawn a Shared Worker in `hub.html` to manage a single PouchDB.
    -   Forward operations (e.g., `DB_QUERY`, subscriptions) to the worker.

    **Code Sketch** (in `hub.html`):

    ```javascript
    // Spawn Shared Worker
    const sharedWorker = new SharedWorker('/shared-pouch-worker.js');
    sharedWorker.port.onmessage = (event) => { /* Forward to app ports */ };

    // In handleDataOperation: Forward to worker
    sharedWorker.port.postMessage({ type: 'DB_OPERATION', details: /* ... */ });
    ```

    **shared-pouch-worker.js**:

    ```javascript
    let db = null;
    self.onconnect = (event) => {
        const port = event.ports[0];
        port.onmessage = async (msg) => {
            if (!db) db = new PouchDB("vibe_db"); // Initialize once
            // Handle operations, broadcast updates
        };
    };
    ```

### In Standalone Mode

-   **Current Potential**: Apps could add PouchDB for caching, but each tab gets a separate instance (duplicated syncs).
-   **Enhanced with Shared Worker**: Spawn directly in the app/SDK for a shared instance. Wrap SDK methods (e.g., `read()`) to query the worker.

    **Code Sketch** (in `vibe-sdk`):

    ```typescript
    class VibeSDK {
        constructor() {
            this.sharedWorker = new SharedWorker("/standalone-worker.js");
            // ...
        }
        async read(collection, query) {
            // Post message to worker, await response
        }
    }
    ```

## Implementation Ideas for Magnetic Feeds

1. **Registry and Pooling**:

    - Central registry on `vibe-cloud-api` (or decentralized) for feed definitions.
    - Clients join pools for similar feeds, dividing work (e.g., via simple consensus).

2. **Client Workflow**:

    - Register feed in SDK.
    - Worker periodically fetches/peers data, aggregates in PouchDB.
    - Share results (e.g., IPFS hashes) with pool.

3. **Global Feed Example**:

    - Clients query known peers, build local index.
    - Expand refs using cached data in PouchDB (adapt `_expand`).

4. **Hybrid with API**: Fallback to server for low-compute devices.

## Architectural Challenges and Trade-Offs

-   **Performance Variability**: Workers throttle on mobile/low battery; design for bursts.
-   **Incentives and Abuse**: Tie contributions to rewards (e.g., faster feeds); monitor via compute budgets.
-   **Security/Privacy**: Enforce ACLs in pools; use signatures for shared data.
-   **Complexity**: Adds peer discovery, conflict resolution—start simple, iterate.
-   **Scalability**: Pools prevent redundancy but require robust registry.

## Future Directions

-   **Decentralized Enhancements**: Integrate DHTs (e.g., libp2p) for peer discovery; use WebAssembly for efficient worker computations.
-   **Advanced Features**: Real-time magnetic feeds via WebSockets; AI-driven pooling.
-   **Testing and Iteration**: Prototype in `vibe-feeds` with metrics on latency/cost savings.
-   **Discussion Points**: How to incentivize pooling? Integrate with federation? Prioritize Hub vs. Standalone?

This is a starting point—let's refine based on team input!
