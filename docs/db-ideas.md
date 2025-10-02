# Database and Schema Ideas for Vibe

This document summarizes our discussion about database choices, schema design, and indexing strategies for the new Vibe architecture.

---

## Current Model (CouchDB)

-   **Per-user databases**: Each user has their own CouchDB instance.
-   **DocRefs + Global DB**: A global CouchDB stores references to documents in user DBs for discovery and feeds.
-   **Expansions**: Queries often require fetching from multiple user DBs, which can be slow unless cached.
-   **Strengths**: Strong isolation, clear ownership, aligns with self-sovereignty principles.
-   **Weaknesses**: Global queries are expensive, cross-user joins are slow, operational complexity at scale.

---

## Proposed Model (PostgreSQL + EF Core)

-   **Single database**: Consolidate all user and app data into one Postgres instance.
-   **Entity Framework Core**: Use EF for relational mapping, with JSONB for dynamic fields.
-   **Hybrid schema**:
    -   Core relational columns: `id`, `ownerDid`, `type`, `createdAt`, `updatedAt`, `acl`.
    -   JSONB column: Stores app-defined dynamic fields.
-   **Benefits**: Strong query capabilities, efficient global queries, flexible schema for emergent app data.

---

## Query Translation

-   **Challenge**: Current SDK selectors map directly to CouchDB queries. In Postgres, these must be translated into EF/LINQ or SQL.
-   **Approach**:
    -   Build a query translation layer that maps JSON selectors to EF/LINQ.
    -   Use EF for relational parts, raw SQL for JSONB-heavy queries.
-   **Complexity**: Simple filters/sorts are easy; expansions and ACL-aware queries are more complex.

---

## JSONB Query Performance

-   **Postgres JSONB**: Supports rich operators (`->`, `->>`, `@>`, `?`).
-   **Indexing**:
    -   GIN index on JSONB for general containment queries.
    -   Expression indexes for frequently queried fields.
    -   Partial indexes for specific collections.
-   **EF Integration**: Use `EF.Functions.JsonContains` or raw SQL for JSONB queries.

---

## Indexing Strategy

-   **Core columns**: BTREE indexes on `ownerDid`, `type`, `createdAt`, `updatedAt`, `acl`.
-   **JSONB**: GIN index for general queries.
-   **Targeted indexes**: Expression/partial indexes for hot fields or collections.
-   **Governance**:
    -   Avoid auto-indexing every field.
    -   Allow apps to suggest indexes, but require admin approval or heuristics.
    -   Monitor query logs to auto-suggest indexes.
    -   Prune unused indexes periodically.

---

## Schema Philosophy

-   **Option 1: Purely Emergent**

    -   All types defined dynamically in JSONB.
    -   Shared meaning emerges through schemas (Zod/JSON Schema).
    -   Pros: Maximum flexibility.
    -   Cons: Harder to optimize queries.

-   **Option 2: Hybrid (Core + Extensions)**

    -   Minimal universal fields in relational columns.
    -   Optional relational optimizations for common types (e.g., `Post`, `UserProfile`).
    -   Pros: Efficient queries for common cases, flexibility for others.
    -   Cons: Risk of schema creep.

-   **Recommendation**: Start with minimal relational fields + JSONB for everything else.
    -   Encourage apps to publish schemas.
    -   Optimize popular types later with relational columns or materialized views.

---

## Summary

-   Move from per-user CouchDB to a single Postgres DB with JSONB.
-   Use EF Core for relational mapping, JSONB for dynamic fields.
-   Implement a query translation layer for SDK selectors.
-   Adopt a hybrid indexing strategy (core BTREE + JSONB GIN + targeted indexes).
-   Keep schema emergent, with minimal relational fields and optional optimizations for common types.
-   This balances **flexibility**, **performance**, and **self-sovereignty** while enabling a shared ecosystem of app-defined data.
