# Vibe Semantic Retrieval & Lazy Embedding – Implementation Guide (v0.1)

**Status:** Draft for internal review
**Date:** 2025‑08‑08
**Owners:** Vibe Platform Team

---

## 0) Why this exists

We want first‑class semantic capabilities (embeddings, ANN retrieval, graph expansion, explainability) without bloating documents, breaking self‑sovereignty guarantees, or forcing apps to learn new APIs. This doc captures the architecture and contracts we agreed on.

---

## 1) Goals & Non‑Goals

### Goals

-   **Lazy by default, server‑managed.** Index/embeddings computed on demand ("on touch") with smart promotion.
-   **Minimal client surface.** Keep `read()/readOnce()` as the primary API; add small optional `semantic` options.
-   **Respect ACL & certificates.** Hard prefilter before any embedding or scoring; explainable results.
-   **No vector sync to clients.** Embeddings are server‑side artifacts only.
-   **Provider‑agnostic.** OpenAI / local / other, switchable by server policy.
-   **Inter‑app/global search.** Cross‑shard planner with ACL‑safe fan‑out + merge + optional rerank.

### Non‑Goals (for v0.1)

-   Full knowledge‑graph authoring UX. (We support lightweight edges, but not a full KG builder.)
-   Client‑chosen embedding models. (Admin/policy decides.)

---

## 2) Core Concepts

### 2.1 "Spaces" (retrieval namespaces)

A **space** bundles: embedding model + dims + preprocessing, provider/consent policy, and optional domain intent.

-   Default: `core`.
-   Create a new space only for: model incompatibility (dims/preproc), different privacy/provider boundary, strong domain specialization, or migrations (`core@v1 → core@v2`).
-   **Client exposure:** hidden by default. Advanced clients may pass a `domainHint` (server maps → space).

### 2.2 Retrieval Modes (strategy)

-   `auto` (default): server chooses based on query shape/state.
-   `keyword`: lexical only (BM25/ft index / Mango filters).
-   `semantic`: vector only (ANN → optional rerank).
-   `hybrid`: union + fusion of `keyword` + `semantic`.

### 2.3 Eligibility & Consent

-   Writers can set a single knob: **deny embedding**.

    ```json
    { "_vibe": { "semantic": { "intent": "deny" } } }
    ```

-   Server policy ultimately decides (see §5). Sensitive fields are redacted at the provider boundary.

---

## 3) Data Model & Storage

### 3.1 Keep primary docs clean

-   **Do not store vectors in primary documents.**
-   **Semantic state lives in a sidecar** collection; project it into reads when asked.

**Sidecar (server‑only, not synced to clients)**

```json
// collection: semantic.index
{
    "docId": "p_123",
    "collection": "posts",
    "tenant": "t_abc",
    "space": "core",
    "contentHash": "sha256:...",
    "fieldsMask": ["title", "body"],
    "modelId": "openai:text-emb-3-small@v1",
    "vectorRef": "ann://core/shard42/p_123#0"
}
```

**ANN index payload (per space/shard)**

```json
{ "key": "posts/p_123", "ACLDigest": "...", "certRefs": ["..."], "boosts": { "recency": 0.2 } }
```

**Cold store (optional)**

-   Compressed vectors keyed by `{contentHash}` for rebuilds (FP16/INT8/PQ codes).

### 3.2 Optional projection for client UX

-   Join state **on demand**:

```ts
const doc = await readOnce("posts", { _id, include: { semantic: true } });
// Server projects: { __semantic: { status, lastEmbeddedAt, space } }
```

-   Default responses **omit** semantic state.

---

## 4) Indexing & Lazy Embedding

### 4.1 States (managed by server)

`none | queued | ready | stale | denied | deferred`

### 4.2 On‑touch flow (per shard)

1. **Plan:** Apply ACL/cert filters → run **lexical/BM25** or metadata prefilter (N≈500) to get candidates.
2. **Split:** `ready` vs `eligible but unembedded`.
3. **Return fast:** Rank/return from `ready` (and keyword hits) immediately; stream partials.
4. **Queue:** Batch‑enqueue embedding jobs for the `eligible` set (budgeted).
5. **Backfill:** On completion, insert into ANN, rerank, and stream updates.

Pseudo:

```ts
const C = bm25Filter(q, filters, N);
const [hot, cold] = partition(C, (c) => state(c) === "ready");
emit(streamRank(hot));
queueEmbed(cold.slice(0, embedBudget(tenant, q)));
```

### 4.3 Promotion & Eviction

-   **Collection promotion:** if ≥X queries or ≥Y successful hits over T minutes → switch to eager on write.
-   **Doc promotion:** if touched ≥K times or co‑occurs with strong hits → extend TTL.
-   **Neighbor speculation:** embed a small ring of neighbors (`replyTo`, `mentions`, `authoredBy`) within budget.
-   **Cold eviction:** vectors unused for N days evicted to cold store.

Example policy:

```ts
Promotion = {
    collection: { queries: 20, hits: 50, windowMins: 120 },
    doc: { touches: 3, neighborFanout: 5, ttlDays: 30 },
    budgets: { perTenantPerMin: 200, perQueryMaxEmbeds: 50 },
};
```

---

## 5) Eligibility Policy (server‑side rule engine)

Rules match on: collection regex, MIME/type, token count, creator app, certs, sensitivity labels.

```ts
const IndexPolicy = {
    default: { action: "sample", p: 0.1 },
    rules: [
        { if: { collection: /posts|notes|docs/i, tokenCount: { gt: 40 } }, then: { action: "embed", space: "core", fields: ["title", "body"] } },
        { if: { mime: /image|binary/ }, then: { action: "ignore" } },
        { if: { sensitivity: "private" }, then: { action: "defer" } },
    ],
} as const;
```

Priority: **policy > writer deny intent > heuristics > fallback**.

Heuristics (when silent): embed text‑heavy docs; skip tiny/structured docs; lazy‑index on first touch.

---

## 6) Query Planner (global + ACL)

1. **Shard fan‑out** by tenant/app/space.
2. **Pre‑filter** with ACL/cert predicates at each shard; never embed or score blocked docs.
3. **Retrieve** ANN top‑K per shard (budgeted) + lexical candidates.
4. **Merge & dedupe** by DID/URI; optional **rerank** (provider‑agnostic).
5. **Explain**: attach why/how (highlights, graph path, cert reasons).

---

## 7) Client API (minimal changes)

### 7.1 One‑shot search

```ts
const res = await readOnce("any", {
    q: "consent UX patterns for shared notes",
    semantic: {
        strategy: "auto", // optional; default "auto"
        // domainHint: "code", // optional; server may map to a space
        // k: 200               // optional candidate pool; server defaults
    },
    limit: 20, // how many results to return
    global: true,
});
```

### 7.2 More‑like‑this (doc similarity)

```ts
const sim = await readOnce("semantic.nodes", {
    semantic: {
        strategy: "auto",
        query: { doc: { collection: "posts", _id: "p_123", fields: ["title", "body"] } },
    },
    limit: 10,
});
```

### 7.3 Optional state projection

```ts
const doc = await readOnce("posts", { _id: "p_123", include: { semantic: true } });
// doc.__semantic → { status, lastEmbeddedAt, space }
```

**Notes**

-   Clients **do not** specify models or spaces by default.
-   `limit` = returned items; `k` (optional) = retrieval candidate pool size.
-   `strategy` can be exposed only to advanced clients; default to `auto`.

---

## 8) Server Admin & Ops API

-   `POST /semantic/reindex { space?: string, collection?: string }`
-   `GET  /semantic/status?collection=posts&_id=p_123` → `{ status, lastEmbeddedAt, space }`
-   `GET  /semantic/coverage?collection=posts` → indexed %, skipped reasons.
-   `POST /semantic/promote { collection }` → flip to eager‑on‑write.
-   Health: `/semantic/lag`, `/semantic/mismatch`, `/semantic/queueDepth`.

---

## 9) Security, Privacy, Consent

-   **Field‑level allowlist** for embedding/export; redact disallowed fields pre‑provider.
-   **Certificates** gate provider usage (e.g., external embedding provider) and cross‑app visibility.
-   **Audit/consent ledger:** log model/provider calls per document/field/space.
-   **Explainability API** (client‑visible):

```ts
const why = await sdk.semantic.explain({ resultId });
// → reasons: [ { type: "match", field, highlights }, { type: "edge", path }, { type: "cert", issuer, rule } ]
```

---

## 10) Rerank & Provider Abstraction

```ts
sdk.semantic.configure({
    embeddings: { provider: "openai", model: "text-embedding-3-small" },
    rerank: { provider: "openai", model: "rerank-1" },
    llm: { provider: "openai", model: "gpt-4o-mini" }, // optional for expansion/explain
});
```

-   Per‑tenant/collection overrides via policy.
-   Local‑model fallback if user opts out of external providers.

---

## 11) Graph Overlay (lightweight)

-   **Edges** as small first‑class docs (syncable):
    `semantic.edges { id, from, to, predicate, weight?, certRefs }`
-   **Nodes** virtual/materialized from base docs and edges.
-   Query expansion can hydrate neighbors (depth slider), budgeted.

---

## 12) Cost, Performance, and Budgets

-   Debounce writes (e.g., 500ms) → batch embed jobs.
-   Quantization in ANN (FP16); PQ/INT8 in cold store.
-   **Backpressure:** per‑tenant/day cost caps; per‑query embed budget; circuit breakers.
-   **Streaming UX:** render keyword hits immediately, stream semantic warmups.

---

## 13) Versioning & Migrations

-   Store `modelId@rev`, `preproc` recipe.
-   Rolling re‑embed for `core@v1 → core@v2`; mark `stale` during cutover; query fanning to both until completion.
-   Idempotent job key: `{ docId, space, contentHash }`.
-   Dedupe vectors across spaces by `contentHash` when compatible.

---

## 14) Observability

-   Metrics: `embed.jobsQueued`, `embed.jobsFailed`, `index.coverage%`, `query.latency.p50/p95`, `stream.backfill.count`, `promotion.events`.
-   Traces: per query fan‑out + shard timings.
-   Dashboards: coverage by collection, cost by tenant/provider, queue depth.

---

## 15) UI Building Blocks (optional components)

-   `<SemanticSearchBox />` – toggles (Exact/Semantic/Hybrid), scope (Local/Global/Shared‑with‑me).
-   `<ResultExplain />` – highlights, graph paths, cert provenance.
-   `<ScopePill />` – active ACL scope + certificate badges.
-   `<SimilarityPanel />` – "more like this" sidebar.
-   `<GraphExplorer />` – neighborhood view with predicate filters & depth.
-   _UX copy:_ "Warming up… 12 results are being indexed" during lazy backfill.

---

## 16) Worker Signatures (sketch)

```ts
// enqueue per doc when on‑touch decides to embed
interface EmbedJob {
    docId: string;
    collection: string;
    tenant: string;
    space: string;
    fields: string[];
    contentHash: string;
}

function embedWorker(job: EmbedJob) {
    if (alreadyIndexed(job)) return ok();
    const text = extractFields(job);
    const redacted = redact(text, policy(job));
    const vec = embed(redacted, spaceModel(job.space));
    const ref = annInsert(job, vec);
    sidecarUpsert(job, ref);
}

function embedBudget(tenant: string, q: Query): number {
    // per‑tenant rate limit + per‑query ceiling + global backpressure
    return Math.min(perTenantBucket(tenant).available(), CEIL_PER_QUERY);
}
```

---

## 17) Rollout Plan

1. **Phase A – Lazy only**

    - Implement sidecar + ANN + on‑touch embedding + streaming results.
    - Eligibility: heuristics + writer deny intent; no eager on write.

2. **Phase B – Promotion**

    - Add collection/doc promotion + neighbor speculation.
    - Add coverage reports and admin toggles.

3. **Phase C – Migrations & Spaces**

    - Introduce `core@v2` migration path; allow domain hints; keep spaces hidden by default.

4. **Phase D – Explainability & UI**

    - Ship explain API + basic UI components.

---

## 18) Open Questions

-   Do we want an explicit **client hint** to suppress projection for privacy (always server‑defaulted off in v0.1)?
-   How aggressively should neighbor speculation run under heavy load?
-   Default TTL for cold eviction per tenant size?
-   Rerank provider choice in `auto` – heuristic vs learned fusion?

---

## 19) Acceptance Criteria (v0.1)

-   Lazy embedding works end‑to‑end with ACL prefilters; no vectors sync to clients.
-   `readOnce(..., { semantic: { strategy: "auto" }, limit, global })` returns:

    -   immediate lexical hits, then streamed semantic hits;
    -   deterministically filtered by ACL/certs.

-   Sidecar reflects accurate state, and `semantic.status` returns correct info.
-   Admin endpoints for coverage, promotion, reindex exist.
-   Telemetry for queues, coverage, and latencies is live.

---

## 20) Appendix – Types

```ts
type SemanticStrategy = "auto" | "keyword" | "semantic" | "hybrid";

type SemanticQuery = { text: string } | { doc: { collection: string; _id: string; fields?: string[] } } | { vector: number[] }; // diagnostics only

interface SemanticOptions {
    strategy?: SemanticStrategy; // default: auto
    domainHint?: string; // server maps → space
    query?: SemanticQuery; // default derived from q
    k?: number; // candidate pool (server may ignore)
}

interface ReadOnceParams {
    q?: string; // natural language text
    semantic?: SemanticOptions; // optional
    limit?: number; // results to return
    global?: boolean; // cross‑db search
    include?: { semantic?: boolean };
}
```
