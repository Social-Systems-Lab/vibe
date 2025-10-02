# Vibe Cloud – Proposed Architecture (2025)

## Overview

The new architecture moves from a CouchDB-per-user model to a consolidated **.NET Core + EF Core + PostgreSQL (JSONB)** stack, hosted on Scaleway. This provides stronger query capabilities, better performance, and a foundation for advanced features like real-time collaboration and media streaming.

---

## Core Components

### Backend

-   **ASP.NET Core Web API**

    -   Identity & OAuth 2.0 / OIDC provider
    -   Data API (CRUD, queries, subscriptions)
    -   File storage integration (S3-compatible)
    -   Consent & ACL enforcement
    -   Real-time hub (SignalR)

-   **Entity Framework Core**

    -   Relational schema for core metadata (`Users`, `Documents`, `ACLs`, `DocRefs`)
    -   JSONB columns for app-defined dynamic fields
    -   LINQ + JSON operators for flexible queries

-   **PostgreSQL (JSONB)**
    -   Managed by Scaleway
    -   Stores all user and app data in a single DB
    -   Indexes on `ownerDid`, `type`, `createdAt`, ACL fields
    -   JSONB for arbitrary app-defined schemas

---

### Real-Time Layer

-   **SignalR (ASP.NET Core)**

    -   Bi-directional communication with clients
    -   Used for:
        -   Subscriptions (CouchDB `_changes` equivalent)
        -   Global feeds (public posts, discovery)
        -   Collaboration (presence, typing indicators, shared editing)
        -   Signaling for WebRTC sessions

-   **Postgres Triggers + NOTIFY**

    -   On row changes, trigger `NOTIFY` events
    -   Backend listens and pushes updates to subscribed clients via SignalR

-   **Future Scaling**
    -   Option to use CDC (Change Data Capture) with Debezium/Kafka for high-volume feeds

---

### Frontend / SDK

-   **vibe-core**: Shared logic (auth, crypto, ACL evaluation)
-   **vibe-sdk**:
    -   Wraps REST + SignalR client
    -   Provides `read`, `readOnce`, `write`, `remove`, `subscribe` APIs
    -   Abstracts away transport (HTTP vs SignalR)
-   **vibe-react**:
    -   React hooks (`useVibe`, `useSubscription`)
    -   Components for auth, feeds, storage, collaboration
    -   Developers don’t need to know about SignalR/WebRTC internals

---

### Media & Streaming

-   **SignalR**: Used for signaling/control (who’s in a call, session setup, metadata).
-   **WebRTC**: Used for peer-to-peer or SFU-based video/audio conferencing.
-   **HLS/DASH**: For one-to-many live streaming scenarios.
-   **Integration**: `vibe-sdk` exposes `startCall`, `joinStream`, etc., abstracting the underlying protocols.

---

## Data Flow Examples

### 1. Real-Time Subscription

1. Client calls `read("posts", { global: true }, callback)` via `vibe-sdk`.
2. SDK opens SignalR connection, sends subscription request.
3. Backend registers subscription, listens for Postgres NOTIFY events.
4. On new post, backend re-runs query, pushes update via SignalR.
5. SDK invokes callback, React UI updates.

### 2. Video Call

1. User initiates call via `vibe-sdk.startCall()`.
2. SDK uses SignalR to exchange WebRTC offer/answer/ICE candidates.
3. Media flows directly peer-to-peer or via SFU.
4. SignalR continues to handle presence, chat, and metadata.

---

## Benefits

-   **Performance**: Single DB with indexes enables fast global queries.
-   **Flexibility**: JSONB supports arbitrary app schemas.
-   **Real-time**: SignalR + Postgres NOTIFY provides CouchDB-like subscriptions, but more powerful.
-   **Extensibility**: Same real-time layer can support collaboration and media.
-   **Developer DX**: SDK/React layer hides complexity; developers just use simple hooks.
-   **Future-proof**: Can scale to CDC/Kafka if needed.

---

## Indexing Strategy

To balance flexibility with performance, Vibe will use a **hybrid indexing model**:

### Core Columns

Move common query fields into dedicated relational columns with BTREE indexes:

-   `id`
-   `ownerDid`
-   `type`
-   `createdAt`
-   `updatedAt`
-   `acl` (or summary field for ACL evaluation)

These cover the majority of queries (ownership, type filtering, time-based sorting, ACL checks).

### JSONB Column

Keep app-defined fields in a `data JSONB` column:

-   Apply a **GIN index** for general containment queries (`@>`).
-   This allows reasonably fast lookups for arbitrary fields without predefining them.

### Targeted Indexes

-   Use **expression indexes** for high-traffic fields (e.g., `(data->>'title')`).
-   Use **partial indexes** for specific collections (e.g., posts).

### Governance

-   Avoid auto-indexing every new field to prevent index bloat.
-   Allow apps to _suggest_ indexes, but require admin approval or automated heuristics (e.g., only create if a field is queried frequently).
-   Monitor query logs to auto-suggest indexes for hot fields.
-   Periodically prune unused indexes.

### EF Core Integration

-   EF maps core columns directly.
-   JSONB queries use `EF.Functions.JsonContains` or raw SQL.
-   Index creation handled in migrations (core fields) or via background jobs (dynamic fields).

---

## Next Steps

1. Prototype minimal .NET Core API with EF + Postgres JSONB.
2. Implement SignalR hub for subscriptions.
3. Extend `vibe-sdk` to support SignalR transport.
4. Validate with a simple app (e.g., global feed with live updates).
5. Explore WebRTC integration for media.
