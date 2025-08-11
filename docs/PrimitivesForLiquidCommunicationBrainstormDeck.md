# Vibe Primitives for Liquid, Self‑Governing Organizations — Brainstorm Deck

> A working blueprint for proximity chat, Local Report, and fluid circles/movements on the Vibe platform.

---

## 0) TL;DR

-   Treat a **Vibe** as a portable, signed _fragrance_ of identity: a DID + layered attestations + preferences + capabilities.
-   Build three substrate layers once, reuse everywhere:

    1. **Attestations & Capabilities** (self‑sovereign claims + object‑capability grants).
    2. **Event Log & CRDT State** (signed, mergeable, portable data with local‑first sync).
    3. **Lens & Scope Engine** (who/where/when/what semantics for visibility, proximity, and propagation).

-   Model organizations as **fuzzy sets** ("circles") with soft boundaries, not binary membership. Circles can nest, overlap, and form **movements** (super‑circles) by resonance.
-   **Proximity Chat** and **Local Report** are just lens presets over the same substrate (spatial/time lenses + relay policies + consent).
-   Add **resonance graph** primitives to power discovery, routing, and governance without brittle group boundaries.

---

## 1) Mental Model: What is a Vibe?

A **Vibe** is an identity signature that is more than the sum of its parts. Concretely:

-   **Core identifier:** a DID (or equivalent) + key material.
-   **Fragrance layers:** composable, revocable **attestations** (skills, affiliations, location proofs, safety badges, taste profiles, devices) signed by self or others.
-   **Preferences & intents:** what you want to see/do; your social/coordination posture.
-   **Capabilities:** explicit, scoped grants you give apps/agents to act _for_ your Vibe (post, relay, moderate, spend, bridge, etc.).
-   **Portability:** everything exportable/importable; nothing trapped.

> Result: a Vibe can unlock doors (literal and metaphorical), join circles, publish signals, and participate in governance, all with auditable, revocable consent.

---

## 2) Core Primitives (platform level)

### 2.1 Identity

-   **DIDs & Keys** per persona/device with key rotation, recovery, and delegation.
-   **Personas** (work, pseudo, anon) composed under one Vibe; each with its own policies.

### 2.2 Attestations

-   Signed **claims** about a subject (you, a post, a place, a circle): Verifiable Credential–style docs.
-   Types: proof‑of‑presence, membership, reputation badge, content label, safety flag, org charter hash, relay approval.

### 2.3 Capabilities (Object‑capability model)

-   **Grants**: `granter → grantee` with **scope** (resources + verbs), **constraints** (time, radius, TTL, hops), **revocation**.
-   Example verbs: `post`, `relay`, `moderate`, `attest`, `mint`, `vote`, `merge`, `bridge`.

### 2.4 Consent UX

-   Standard **Grant Cards** shown by Vibe OS: clear scope, duration, data touched, revoke button, audit trail.
-   **Intent flows**: app requests intent; Vibe OS compiles into least‑privilege capability.

### 2.5 Event Log + CRDT Store

-   Append‑only, signed **event log** per entity (vibe/circle/movement).
-   **CRDT views** on top for conversations, profiles, charters, proposals.
-   Local‑first storage + opportunistic sync via peers, relays, or clouds.

### 2.6 Lens & Scope Engine (the secret sauce)

A **Lens** defines a set of constraints on _who can read/act_ and _how content propagates_. Composable:

-   **Spatial:** center, radius, shape (H3 cells), jitter/fuzz policy.
-   **Temporal:** validity windows, backfill ranges, decay/half‑life.
-   **Topical:** tags, embeddings, content labels.
-   **Social:** circles with minimum **membership score** (fuzzy membership 0..1), mutuals, trust thresholds.
-   **Propagation:** TTL (hops), relayability, bridge policies, rate‑limits.

### 2.7 Resonance Graph

-   Weighted, typed edges between vibes, circles, topics, places. Edges sourced from events, reactions, co‑presence, shared charters.
-   Drives discovery, ranking, and governance (who should see/propose/moderate?).

### 2.8 Safety & Health

-   Pluggable **moderation policies** as capabilities (who can label/hide/appeal).
-   **Sybil resistance** via attestations (no hard mandate), rate‑limits, staking/bonding _optional_.

---

## 3) Spatiotemporal Substrate (for Proximity & Local Report)

-   **Indexing:** H3 or S2 cells for geo; time buckets.
-   **Privacy:** Snap to cells; **geo‑fuzz** with radius‑dependent jitter; optional zk range proofs ("within 5 km of X") without exact coordinates.
-   **Transport:** Gossip by cell; relays subscribe to cells/time windows + topic filters.
-   **Proof‑of‑locality (optional):** device secure enclave + network beacons + witness co‑signatures ("witness packs").

---

## 4) Messaging & Discovery Primitives

-   **Publish(Event, Lens, Capabilities)** → signed, stored, routed per lens.
-   **Subscribe(Lens)** → stream of events matching lens.
-   **Bridge(FromLens → ToLens)** requires `bridge` capability + policy checks.
-   **Hints**: privacy‑preserving signals that something relevant exists just beyond a lens (no content revealed), to reduce dead‑ends.

---

## 5) Proximity Chat: Handling A—B—C Visibility

Scenario: A posts to radius 5 km. B is 5 km from A and 5 km from C. C is 10 km from A. How do we handle B seeing both, but A/C not seeing each other?

**Policies (choose per conversation/circle):**

1. **No‑Bridge (Strict Locality):** Messages do **not** propagate across disjoint lenses. B sees both, but cannot relay. Clean mental model, minimal leakage.
2. **Relay with Consent:** A’s post includes `relayable:true` + TTL=1. B holds a `bridge` capability for that conversation. To show A’s message to C, B requests a **Bridge Token** from A (one‑tap approve). Audit trail links A→B→C.
3. **Two‑Hop Reveal:** If A’s and C’s lenses overlap through B, the system can emit **Hints** to A and C ("there’s a related thread just beyond your radius"). Either side can **opt‑in** to widen their lens temporarily or request a bridge.
4. **Shadow Edges:** B can **summarize** across the gap (own words) without leaking A’s content; summaries are labeled as second‑hand with provenance.
5. **Union on Demand:** Any participant can propose a temporary **Union Lens** (A∪B∪C with new radius/TTL); requires quorum or the original posters’ consent rules.

**Example: Event payload (simplified)**

```json
{
    "id": "evt_abc",
    "author": "did:vibe:A",
    "lens": {
        "spatial": { "cells": ["8928308280fffff"], "radius_km": 5, "geo_fuzz": 120 },
        "temporal": { "start": 1740000000, "ttl_sec": 86400 },
        "propagation": { "ttl_hops": 1, "relayable": true, "bridge_policy": "consent" }
    },
    "capabilities_required": ["read:cell:8928308280fffff"],
    "signature": "..."
}
```

**Bridge token (capability)**

```json
{
    "grant": "cap_bridge_123",
    "granter": "did:vibe:A",
    "grantee": "did:vibe:B",
    "scope": {
        "resource": "evt_abc",
        "verbs": ["bridge"],
        "constraints": { "target_cells": ["8928308280fffff", "8928308281fffff"], "ttl_hops": 1, "expires": 1740003600 }
    },
    "proof": "..."
}
```

**Routing rule (pseudo):**

```ts
if (viewer ∈ Lens(evt.lens) && not revoked(evt)) show(evt)
else if (hasBridge(viewer, evt) && policy.ok) show(evt, label="bridged")
else if (lensHintsEnabled(viewer)) showHint(evt)
```

Trade‑offs: strict locality preserves privacy; consented bridges increase reach with clear provenance; hints encourage voluntary union without forced exposure.

---

## 6) Local Report: Spatiotemporal Newsfeed

**Concept:** map + time scrubber → lens over events + attestations.

**Post types:** eyewitness note, photo/video, service status, safety alert, Q/A, request for help.

**Verification:**

-   **Witness packs:** co‑signers within N minutes/km; device sensor hashes; optional org verifications.
-   **Provenance graph:** every transformation (crop, re‑share, summary) gets its own attestation edge.
-   **Privacy:** author can pick cell granularity, delay publication, or share via trusted circles first.

**Ranking:** resonance (local relevance) × freshness × credibility (attestation weight) × safety filters.

**Time travel:** same lens, different time window; CRDTs ensure edits and corrections are preserved with lineage.

---

## 7) Self‑Governing Orgs: Circles & Movements

Model membership as **fuzzy**, not binary.

**Circle**

-   Fields: `charter`, `policies`, `membershipFunction`, `capabilityPolicies`, `treasury?`.
-   Membership score derived from attestations (joins, contributions, location, endorsements).
-   **Circle types:**

    -   **Open** (anyone can view/post with low score)
    -   **Porous** (view open, post needs score > θ)
    -   **Sealed** (invite/attestation‑gated)
    -   **Ephemeral swarm** (auto‑dissolve by time/decay).

**Movements**

-   **Super‑circles** formed by union/intersection of circles with shared charter fragments or high resonance.
-   Governance by **capabilities**: who can propose, signal, merge, split, budget, or delegate?

**Lightweight governance primitives:**

-   **Signals** (emoji/score/cred‑weighted).
-   **Proposals** (capability‑gated; e.g., widen a lens, adopt a charter hash, allocate funds).
-   **Sortition panels** (randomly sampled reviewers with attestations).
-   **Delegation** (liquid; revocable; scope‑bound).

---

## 8) Reputation, Safety, Anti‑abuse

-   **Badges**: earned and issued (journalist, first‑aid, neighborhood steward, bridgekeeper).
-   **Rate‑limit & cost curves**: lightweight friction; optionally stake small bonds for high‑impact actions (e.g., mass bridge).
-   **Appeals & redress**: capabilities to challenge labels; mediation circles.

---

## 9) Economics (optional, pluggable)

-   **Tips/boosts** on posts; **bounties** for reporting/services; **budgets** at circle/movement level.
-   Multi‑rail settlement (fiat on‑ramps, crypto rails, vouchers), abstracted behind capabilities (`spend:<=X`).

---

## 10) Interop Strategy

-   **Adapters**: ActivityPub, AT Protocol (Bluesky), Matrix, Nostr. Map Vibe entities → foreign posts/actors.
-   **Consent translation:** only bridge if scopes can be preserved; downgrade when needed; refuse if not.
-   **Addressing:** `vibe://circle/{id}`, `vibe://event/{id}` URIs; shareable in/out of platform.

---

## 11) SDK Surface (sketch)

### Key Types (TypeScript)

```ts
export type DID = string;

export interface VibeID {
    did: DID;
    persona: string;
    pubkey: string;
}

export interface Attestation<T = any> {
    id: string;
    issuer: DID;
    subject: string;
    type: string;
    claims: T;
    issuedAt: number;
    expiresAt?: number;
    proof: string;
}

export interface Capability {
    id: string;
    granter: DID;
    grantee: DID;
    scope: { resource: string | string[]; verbs: string[]; constraints?: Record<string, any> };
    issuedAt: number;
    expiresAt?: number;
    proof: string;
    revoked?: boolean;
}

export interface Lens {
    spatial?: { cells?: string[]; radius_km?: number; geo_fuzz?: number };
    temporal?: { start?: number; end?: number; ttl_sec?: number };
    topical?: { tags?: string[]; embedding?: number[] };
    social?: { circles?: string[]; minScore?: number };
    propagation?: { ttl_hops?: number; relayable?: boolean; bridge_policy?: "none" | "consent" | "open" };
}

export interface Event {
    id: string;
    author: DID;
    lens: Lens;
    kind: "post" | "summary" | "attestation" | "proposal";
    content: any;
    createdAt: number;
    sig: string;
}
```

### Core APIs

```ts
publish(event: Event, caps?: Capability[]): Promise<void>
subscribe(lens: Lens, handler: (e: Event)=>void): Unsubscribe
requestBridge(evtId: string, targetLens: Lens): Promise<Capability>
revoke(capId: string): Promise<void>
attest<T>(a: Attestation<T>): Promise<void>
```

### Example: Proximity post with bridgeable scope

```ts
const lens: Lens = {
    spatial: { radius_km: 5, geo_fuzz: 120 },
    temporal: { ttl_sec: 3600 },
    propagation: { relayable: true, ttl_hops: 1, bridge_policy: "consent" },
};

await publish({ id, author: me.did, lens, kind: "post", content, createdAt: Date.now(), sig });
```

### Example: B requests bridge from A

```ts
const bridge = await requestBridge("evt_abc", { spatial: { radius_km: 5 } });
// Vibe OS shows A a Grant Card; if approved, B receives a Capability to bridge to the new cells.
```

---

## 12) Roadmap (phased)

**Phase 1 — Substrate & Basic Lenses**

-   DIDs/personas, event log + CRDT, attestations, capabilities, subscribe/publish.
-   Spatial/time lenses; proximity chat (strict locality); Local Report read‑only.

**Phase 2 — Bridges, Circles, Safety**

-   Bridge tokens + hints; fuzzy membership circles; badges; moderation capabilities; witness packs.
-   Local Report authoring + verification; map/time UI.

**Phase 3 — Movements & Interop**

-   Movement unions/intersections; governance primitives; treasury/bounties (optional).
-   Adapters to ActivityPub/AT/Matrix; import/export.

---

## 13) Open Questions / Design Dials

-   **Default privacy:** strict locality by default, or hint‑friendly?
-   **Membership math:** how to compute scores (simple weighted sum vs. learned embeddings)?
-   **Proof‑of‑locality:** optional/opt‑in only? acceptable witness models?
-   **Economic rails:** opt‑in modules vs. built‑in minimal tipping?
-   **Inter‑app contracts:** capability vocabulary we standardize across the ecosystem?
-   **Bridge governance:** who can become a "bridgekeeper"; training wheels for abuse?

---

## 14) What This Enables (examples)

-   A neighborhood **mutual‑aid swarm** that self‑organizes during a storm, then gracefully dissolves.
-   A **porous activist circle** that recruits via resonance, not hard gates; proposals travel by consented bridges.
-   A **local news desk** where stories accrue credibility through witness packs and provenance graphs, not pure virality.
