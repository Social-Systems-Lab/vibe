# Phase 0 Workshop Playbook

## Purpose
Lay the groundwork for a simplified Vibe platform by aligning on objectives, constraints, and evaluation criteria before committing to architectural changes. The workshop is designed for two participants (you and me) and can be completed over a focused half-day or broken into shorter sessions.

## Desired Outcomes
- Shared understanding of current pain points, MVP success metrics, and guardrails.
- Decision matrix ready to score CouchDB vs Postgres (or hybrid) for managed cloud.
- Draft telemetry schema covering `principal`, `initiator`, and `resource_owner` fields.
- Captured requirements for app-scoped billing and consent implications.
- Confirmed MVP scope checklist (apps, SDK updates, auth UX) with in/out items.

## Pre-Work (Async)
- Read `docs/PlatformRefactorNotes.md` and `docs/Roadmap.md`.
- Skim current data flow implementations:
  - `apps/vibe-cloud-api/src/index.ts` (API entry, CouchDB usage).
  - `packages/vibe-sdk/src/index.ts` (client consumption patterns).
- Gather current metrics or anecdotes on hosting cost, query latency, and developer onboarding friction.
- Review consent UX in `apps/vibe-cloud-ui/app/auth` for context on potential one-tap flow.

## Artifacts to Prepare During Workshop
1. **Decision Matrix** (see template below) comparing data layer options on stability, dev velocity, cost, migration effort, offline support, ACL fit.
2. **Billing & Consent Notes** summarizing app identity lifecycle, telemetry needs, and end-user messaging.
3. **MVP Scope Checklist** listing deliverables by track (Data, Billing, Auth, SDK, Example Apps, Docs).
4. **Risks & Unknowns Log** to capture follow-ups and research tasks.

## Agenda (Suggested Flow)

### Segment 1 · Context & Goals (45 min)
- Recap mission, current stack, and desired simplifications.
- Align on MVP definition: managed cloud focus, example apps, self-host expectations.
- Capture success metrics (e.g., time to ship a new app, cost per tenant, auth completion rate).

### Segment 2 · Data Layer Deep Dive (60 min)
- Map existing CouchDB architecture: per-user DBs, DocRefs, replication.
- Outline Postgres+JSONB proposal: shared tables, change propagation, ACL evaluation.
- Populate decision matrix using qualitative scores (High/Med/Low) and notes.
- Decide on provisional direction or list validation spikes needed.

### Break / Async Reflection (optional 15 min)
- Each person records concerns or follow-up questions based on matrix results.

### Segment 3 · Billing & Identity Model (45 min)
- Diagram app DID lifecycle: registration, consent request, billing onboarding.
- Define telemetry schema (`principal`, `initiator`, `resource_owner`, `event_type`, `cost_unit`).
- Identify policy/legal checkpoints and developer comms requirements.

### Segment 4 · Auth UX & MVP Scope (45 min)
- Review current redirect flow screens; list friction points.
- Outline one-tap concept and prerequisites (session hub updates, SDK hooks).
- Build MVP scope checklist with must-have vs nice-to-have, flag dependencies across tracks.

### Segment 5 · Synthesis & Next Steps (30 min)
- Summarize decisions, open questions, and owners.
- Assign follow-up spikes (data prototype, telemetry instrumentation, UX exploration).
- Capture workshop notes in shared doc, confirm communication plan with broader team.

## Decision Matrix Template

| Criteria | CouchDB (status quo) | Postgres + JSONB | Hybrid (managed Postgres + optional CouchDB for self-host) | Notes/Follow-ups |
| --- | --- | --- | --- | --- |
| Data isolation & consent guarantees |  |  |  |  |
| Real-time sync & offline support |  |  |  |  |
| Query performance & flexibility |  |  |  |  |
| Operational complexity & observability |  |  |  |  |
| Migration effort & risk |  |  |  |  |
| Cost predictability |  |  |  |  |
| Developer ergonomics |  |  |  |  |

*Scoring suggestion*: use High/Medium/Low with brief rationale. Highlight any criterion that requires empirical validation.

## Billing & Consent Notes Template

- App registration flow steps:
  1. 
  2. 
- Required user consent prompts:
  - 
- Telemetry fields & sample event (`principal`, `initiator`, `resource_owner`, `event_type`, `metadata`).
- Edge cases: hobby apps without billing, user-triggered heavy compute, shared/global collections.
- Policy/legal considerations: 

## MVP Scope Checklist Template

**Data Layer**
- [ ] Decision on managed cloud data store
- [ ] Prototype complete for chosen path

**Billing & Identity**
- [ ] App DID issuance flow updated
- [ ] Telemetry instrumentation plan approved

**Auth UX**
- [ ] One-tap UX prototype validated
- [ ] Redirect flow parity plan

**SDK & Dev Docs**
- [ ] API changes drafted
- [ ] Docs outline updated

**Example Apps**
- [ ] Feeds updated to new auth/billing path
- [ ] Collections updated to new auth/billing path

**Risk & Research**
- [ ] Open questions logged
- [ ] Follow-up owners assigned

## Facilitation Tips
- Keep each segment time-boxed; capture rabbit holes in the risks log.
- When disagreements arise, note assumptions and design spikes to validate.
- End each segment by confirming what was decided vs what remains open.

## After the Workshop
- Publish the filled templates to the repo (e.g., `docs/workshop-notes/YYYY-MM-DD-phase0.md`).
- Update `docs/Roadmap.md` Phase 0 bullet list with final decisions and commitments.
- Schedule Phase 1 spikes with estimated effort and owners.