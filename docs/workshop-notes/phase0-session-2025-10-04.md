# Phase 0 Workshop Notes — Session 1 (2025-10-04)

## Participants
- You (platform lead)
- Codex (facilitator)

## Agenda Coverage
- Data architecture isolation & sync properties (partial)
- Managed Postgres real-time strategy (partial)
- App identity/billing ownership models (partial)
- Auth UX approach for MVP (partial)

We paused before completing telemetry mapping, success metrics, and MVP checklist alignment.

## Key Takeaways
- **Isolation & data ownership**: Current CouchDB design delivers strong per-user isolation. Moving to a shared Postgres cluster raises concerns about blast radius if the DB is compromised. Row-level security and schema partitioning will need to replicate today’s guarantees.
- **Offline/local caching**: Couch/Pouch sync currently powers offline and local caches. Postgres approach must define whether to drop offline-first features or build an equivalent sync service.
- **Real-time subscriptions**: CouchDB selectors + `_changes` make real-time feeds trivial today. Postgres path likely needs triggers or logical decoding; efficiency and per-query filter handling are open design points.
- **Trigger workload**: Generic triggers risk high churn even when no subscribers are active. Need an event fan-out strategy that avoids unnecessary processing.
- **App registration & billing**: Two competing models surfaced:
  - One-to-one: each app = dedicated Vibe Cloud account (clear quotas, isolation).
  - One-to-many: parent user/org account owns multiple app sub-entries (clear ownership, shared reputation).
  A hybrid hierarchy (parent account with non-detachable sub-accounts) seems promising but needs detailed rules.
- **Unified flow preference**: Desire to avoid hybrid auth/data flows at launch—ship one coherent path, add variations later.
- **Auth UX**: One-tap flow requires backend + SDK readiness (billing/app identity must exist first). Need to design pop-up vs embedded iframe experience while preserving clear domain signaling for security/trust.

## Decisions / Directions Agreed
- Keep MVP focused on a single auth flow rather than supporting both redirect and one-tap in parallel.
- If Postgres is adopted, design must deliver comparable isolation and sync guarantees before deprecating CouchDB.

## Open Questions & Follow-Ups
1. **Isolation strategy**: How will Postgres enforce per-user access boundaries (row-level security, schema-per-user, encryption)?
2. **Real-time design**: Should we rely on triggers, logical replication slots, or a dedicated change capture service? How do we scope notifications to active subscribers?
3. **Offline support**: Do we retain offline-first behavior in MVP or document it as out-of-scope?
4. **Account hierarchy**: Define ownership rules, billing attribution, and reputation sharing for parent/sub accounts.
5. **Telemetry schema**: Need concrete fields, retention, and privacy rules (deferred segment).
6. **Success metrics**: Identify qualitative/quantitative targets for managed-cloud MVP.
7. **Auth UX container**: Decide between browser pop-up, in-app modal, or redirect fallback; enumerate security implications.
8. **UI responsibilities**: Determine how much of the new flow lives in Vibe SDK vs React package vs cloud-hosted iframe.

## Next Areas to Explore
- Resume Segment 1 completion: gather top pain points, MVP success metrics, and guardrails.
- Segment 2 deep dive: complete decision matrix scoring for CouchDB vs Postgres vs hybrid.
- Segment 3: flesh out billing telemetry schema and consent messaging requirements.
- Segment 4: produce concrete MVP scope checklist tied to chosen architecture.

## Suggested Prep Before Next Session
- Collect current hosting cost snapshots and latency anecdotes to inform success metrics.
- Sketch potential account hierarchy diagrams (parent <-> sub account) for discussion.
- Investigate Postgres change-data-capture options (LISTEN/NOTIFY, logical replication, triggers) to compare complexity.
- Draft security considerations for pop-up vs embedded auth UI.`n---

# Phase 0 Workshop Notes — Session 2 (2025-10-05)

## Participants
- Patrik (platform lead)
- ChatGPT (facilitator)

## Segment 1 — Context & Goals
- **Pain points**: app registration responsibilities unclear; per-user CouchDB hampers global queries; redirect auth flow creates friction.
- **MVP success**: faster app onboarding, predictable per-app billing, smoother auth with high completion rate.
- **Guardrails**: keep managed MVP simple/unified, ensure self-host path is documented, preserve consent/ownership ethos.

## Segment 2 — Data Layer Deep Dive
- Draft decision matrix favors Postgres for query power, cost predictability, and developer ergonomics; CouchDB still strongest for offline/sync.
- Action: Phase 1 spike to validate Postgres change-feed and offline story before committing.

## Segment 3 — Billing & Identity Model
- Apps need dedicated DIDs.
- Compared **one-to-one** vs **one-to-many** account ownership; MVP leans one-to-one with future option for parent/sub accounts.
- Draft telemetry fields captured: `principal`, `initiator`, `resource_owner`, `event_type`, `metadata`.

## Segment 4 — Auth UX & MVP Scope
- Decision to ship a unified in-app one-tap prompt; full-screen redirect only when unavoidable.
- SDK (vanilla + React) must adopt new flow; example apps and docs to follow suit.
- Noted trade-offs between pop-up window vs in-app modal; log security implications for follow-up.

## Segment 5 — Synthesis & Next Steps
- Decisions: single auth flow, one-to-one app accounts (short term), postpone data store decision pending spike.
- Outstanding work aligns with Session 1 follow-ups: Postgres prototype, offline strategy, cost modeling, consent messaging, telemetry samples, org hierarchy design, completion of MVP checklist.

## Additional Open Points To Explore
1. Document success metrics numerically (e.g., target onboarding time, acceptable auth drop-off).
2. Flesh out telemetry event examples for data read/write, consent, and billing events.
3. Expand MVP checklist to cover Data, Billing, Auth, SDK, Example Apps, Docs.
4. Clarify security posture for in-app auth UI vs browser pop-up, including anti-phishing considerations.
5. Align on whether offline mode is MVP-critical or deferred.