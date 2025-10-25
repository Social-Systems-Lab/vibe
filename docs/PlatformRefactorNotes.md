# Platform Simplification & Refactor Notes

## Starting Point
- Current stack: Node/Elysia API with per-user CouchDB stores, DocRef global index, Minio file storage, JS/TS SDKs and React bindings, and example apps (Feeds, Collections).
- Managed hosting pain points show up in cost visibility, query complexity, and balancing zero-backend dev DX with platform sustainability.
- MVP target remains: opinionated managed cloud with at least two polished example apps, clear SDK docs, and a paved path for self-hosting.

## 1. App-Scoped Accounts & Billing Responsibility
- **Intent**: give each app its own identity (and/or scoped sub-account) so it can run background/global workloads and pick up the tab.
- **Opportunities**
  - Preserve app autonomy: issue DID + credentials per app and require apps to hold a funding source.
  - Clear billing split: attribute compute/storage events to either the app DID or the end-user DID based on initiator.
  - Unlock global/background jobs: app identity can run scheduled queries without impersonating users.
- **Risks / Questions**
  - Access control: app DID still needs consent scopes from users; need matrix of (user consent) × (app global privilege).
  - CPU attribution ambiguity: queries triggered by a user but executed against app-scoped resources still muddy. Need telemetry design (who initiated, whose resources used).
  - Free-tier UX: do we gate app onboarding until billing is connected, and how to keep hobby devs engaged?
- **Next Steps**
  - Model how app manifests tie to app DID + billing profile.
  - Define event accounting schema (who initiated, principal, resource owner) so metering can be consistent.
  - Prototype: extend existing DID issuance flow to mint app credentials + consent prompts.

## 2. Consolidated Managed-Host Database
- **Intent**: merge per-user data into a shared managed cluster to simplify indexing and ops.
- **Opportunities**
  - Operational simplicity: fewer db instances, easier backup and monitoring.
  - Global queries: easier to run cross-user analytics/feeds without N-way fan-out.
  - Cost leverage: pooled resources mean better utilization on managed Postgres.
- **Risks / Questions**
  - Isolation + consent: per-user databases currently enforce hard boundaries; need row/collection level access control if moving to shared DB.
  - Sync semantics: CouchDB gives replication + `_changes`; consolidation needs equivalent CDC for clients and offline support.
  - Migration path: how do existing self-host setups or local PouchDB replication adapt?
- **Next Steps**
  - Map required capabilities (changes feed, conflict handling, attachment support) and verify if Postgres + logical decoding can cover them.
  - Decide whether to keep per-user logical partitions (schemas or table partitioning) to preserve isolation semantics.
  - Draft migration strategy for current CouchDB deployments (dual-write vs bulk migration).

## 3. PostgreSQL + JSONB as Primary Store
- **Intent**: lean on managed Postgres instead of CouchDB while keeping schemaless docs.
- **Opportunities**
  - Rich querying: SQL + JSONB indexing for complex filters/aggregations.
  - Native transactions: simpler multi-document writes and integrity checks.
  - Ecosystem: managed backups, HA, and analytics tooling.
- **Risks / Questions**
  - Offline-first story: need replacement for Couch/Pouch replication; may require custom sync service or use of logical replication + client delta protocols.
  - Conflict resolution: Couch gives deterministic conflicts; Postgres JSONB would need app-defined merge or vector clocks.
  - ACL evaluation performance: need to design indexes for per-document ACLs without full table scans.
- **Next Steps**
  - Prototype a table layout (`documents(id, owner_did, collection, acl, body jsonb, updated_at, seq)`).
  - Explore using `LISTEN/NOTIFY` or logical replication to drive real-time updates into SDK.
  - Evaluate whether we can keep CouchDB for self-host/edge cases while managed cloud uses Postgres (dual driver support in SDK).

## 4. One-Tap vs Redirect Auth Flow
- **Intent**: introduce a lighter-weight auth UX now that app identities can handle unsigned users.
- **Opportunities**
  - Better first-run UX: let users explore read-only features backed by app DID before committing.
  - Embed experiences: easier to integrate Vibe auth as modal or banner rather than full redirect.
  - Background consent refresh: silent token refresh fits with one-tap surfaces.
- **Risks / Questions**
  - Security: need to ensure one-tap still completes PKCE flow securely; iframe/SharedWorker must handle token issuance safely.
  - App developer complexity: supporting both redirect and one-tap may fragment docs; need a single recommended path.
  - Consent clarity: ensure users still see scopes + consequences even in compact UI.
- **Next Steps**
  - Audit current auth UI (apps/vibe-cloud-ui) to identify reusable components for a one-tap widget.
  - Define eligibility rules: when can an app run unauthenticated reads vs requiring sign-in?
  - Update SDK interfaces so developers can choose modal vs redirect without extra plumbing.

## 5. Considering ASP.NET Core Backend
- **Intent**: evaluate porting backend from Node/Elysia to ASP.NET Core.
- **Opportunities**
  - Strong typing + tooling: C# + .NET can improve compile-time safety and ecosystem integrations (identity, logging, metrics).
  - Performance: Kestrel + async/await may handle high-throughput queries with lower overhead.
  - Hiring: easier to tap into enterprise .NET talent if needed.
- **Risks / Questions**
  - Rewrite cost: existing TypeScript API, SDK expectations, and deploy scripts need rework.
  - Shared code loss: current packages share types/constants across API + SDK; moving to .NET breaks that unless we generate bindings.
  - Ops impact: existing infra (Bun, pnpm) vs .NET build/deploy pipelines on Scaleway.
- **Next Steps**
  - Determine scope: full rewrite vs hybrid (e.g., keep data services in Node, move auth to .NET?).
  - Identify blockers for current stack (performance, maintainability) to justify rewrite vs targeted fixes.
  - If serious, spike minimal .NET service implementing auth/token endpoints to gauge complexity.

## MVP Implications & Open Decisions
- Need to decide whether MVP targets CouchDB (existing path) or Postgres transition; dual-path may delay shipping.
- Developer docs should track chosen auth UX and data architecture to avoid churn.
- Example apps must illustrate new billing/app identity rules; consider adding cost dashboards or usage indicators.

## Proposed Immediate Actions
1. Hold architecture review outlining target data layer (CouchDB+index vs Postgres) and document decision matrix.
2. Draft billing/accounting model for app vs user resource consumption, including required telemetry changes.
3. UX spike on one-tap flow within `apps/vibe-cloud-ui` to validate feasibility before deeper backend changes.
4. Evaluate whether incremental improvements to current Node stack solve short-term pains before committing to .NET rewrite.