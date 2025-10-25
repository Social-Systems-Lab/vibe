# Vibe Platform Roadmap (Proposed)

> Assumes a 6-month window to reach a managed-cloud MVP with example apps, while preserving a viable self-host path. Adjust timelines as resourcing becomes clearer.

## Guiding Objectives
- Deliver a coherent managed experience where apps and users understand billing, auth, and data ownership.
- Reduce platform complexity by picking a single data architecture for managed cloud and documenting self-host alternatives.
- Ship developer-facing SDKs/docs that reflect the new flow and power at least two reference apps (Feeds, Collections).

## Phase 0 - Alignment and Discovery
- Refer to `docs/Phase0Workshop.md` for detailed agenda, templates, and facilitation notes.
- **Architecture workshop**: decide evaluation criteria for CouchDB vs Postgres transition (`docs/PlatformRefactorNotes.md`).
- **Billing requirements**: capture product/legal needs for app-scoped accounts and charging models; align with finance.
- **MVP scope lock**: confirm which example apps, SDK flows, and hosting options are in or out.
- **Deliverables**
  - Decision matrix template for data layer.
  - Draft telemetry schema (`principal`, `initiator`, `resource_owner`).
  - Updated vision brief summarizing MVP goals.
## Phase 1 - Prototypes and Decision Points (Weeks 2-6)
- **Data layer spike**
  - Build Postgres plus JSONB prototype covering document CRUD, ACL evaluation, and change feed alternative.
  - Benchmark vs current CouchDB flows (latency, conflict handling).
- **Billing and app identity model**
  - Extend DID issuance to mint app credentials; simulate consent matrix.
  - Instrument telemetry in staging to validate cost attribution logic.
- **Auth UX exploration**
  - UX spike for one-tap widget inside `apps/vibe-cloud-ui`; validate PKCE plus consent surfaces.
- **Backend tech evaluation**
  - Targeted .NET spike limited to auth/token endpoints; gather dev velocity plus deployment findings.
- **Key Milestones**
  - Go or no-go decision on managed-cloud data store.
  - Decision on keeping Node/Elysia vs incremental .NET adoption.
  - Prototype report for one-tap feasibility.

## Phase 2 - Foundation Implementation (Weeks 6-12)
- **If Postgres chosen**
  - Stand up managed Postgres infra; define schema (`documents`, `events`, `usage` tables).
  - Build sync service bridging Postgres changes to SDK subscriptions.
  - Draft migration tooling for existing CouchDB tenants.
- **If staying on CouchDB**
  - Hardening plan: consolidate indexes, improve change-feed performance, document scaling patterns.
- **Billing and identity**
  - Implement app account onboarding flow, billing linkage, and consent UI updates.
  - Update SDK for app vs user principal handling plus telemetry headers.
- **Auth foundation**
  - Integrate one-tap auth scaffolding; provide SDK toggle for redirect vs modal.
- **Deliverables**
  - Infrastructure-as-code updates for chosen data stack.
  - SDK alpha release reflecting new auth plus billing primitives.
  - Technical runbooks for telemetry and monitoring.

## Phase 3 - Productization and Migration (Weeks 12-18)
- **Data layer rollout**
  - Dual-write (if migrating) with automated verification; migrate internal apps first.
  - Self-host story: document CouchDB/Postgres options, with migration guidance.
- **Example apps**
  - Update Feeds and Collections to use app identities, new auth flow, and telemetry.
  - Add usage dashboards or cost indicators within apps to surface billing model.
- **Docs and SDK**
  - Refresh `docs/Vibe.md`, SDK guides, and auth tutorials to match new flows.
  - Publish migration guides for third-party developers.
- **Security and compliance**
  - Threat model new auth and data pathways; update consent auditing.
- **Milestones**
  - Public beta of managed cloud with new architecture.
  - Docs freeze for developer preview.

## Phase 4 - Launch Prep and Iteration (Weeks 18-24)
- **Stabilization**
  - Load/perf testing on managed cloud; optimize cost hotspots.
  - Close migration of legacy tenants; sunset legacy auth UX (if applicable).
- **Ecosystem readiness**
  - Finalize pricing tiers; onboard pilot developers with updated SDK.
  - Produce launch-quality tutorials and demo videos.
- **Launch readiness review**
  - Verify monitoring, incident response, billing reconciliation.
  - Plan GA announcement, developer outreach, and support processes.

## Cross-Cutting Workstreams
- **Telemetry and observability**: instrument from Phase 1 onward to ensure usage accounting validity.
- **Developer experience**: keep `packages/vibe-sdk` and `packages/vibe-react` in sync with platform changes; maintain changelog.
- **Governance and policy**: update ToS/consent language to reflect app billing responsibility and unsigned access patterns.

## Risks and Mitigations
- **Data store indecision delays MVP** -> time-box Phase 1 spikes and make default decision if prototypes inconclusive.
- **Billing ambiguity causes trust gap** -> validate messaging with developer advisory group before rollout.
- **Auth UX fragmentation** -> standardize SDK API so developers adopt recommended flow with minimal effort.
- **Rewrite fatigue** -> favor incremental .NET adoption unless spikes show clear 2x benefit.

## Open Questions
1. What resourcing is available for parallel data-layer and billing workstreams?
2. Are there contractual obligations or compliance deadlines that affect billing/account changes?
3. How many external developers are targeted for the managed-cloud beta?
4. Do we need ActivityPub bridge in MVP or can it stay post-launch?




