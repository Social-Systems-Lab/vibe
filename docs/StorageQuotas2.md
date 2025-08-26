# Vibe Cloud — Storage, Levels, Trust & Discovery (MVP+) Spec

**Purpose:** Ship a cohesive MVP that feels like a personal cloud from day one, with clear progression and anti-abuse guardrails. This spec unifies:

* Storage foundation (Scaleway S3) + usage & quotas
* Levels & points unlocking persistent storage
* Creator burst credits (temporary storage) tied to quality interactions
* Trust scoring (phone quality + device attestation) gating rewards
* Contact import & consent-based discovery (Google, Outlook, Facebook, phone/email)
* Minimal compute quotas and spam controls

---

## 0) Product objectives & principles

1. **First-session value:** user sees "my space" (uploads + usage bar) and a path to unlock more.
2. **Self-sovereignty:** transparent consent, revocation, and access controls.
3. **Progression over paywall:** earn storage by trust + participation before any billing exists.
4. **Abuse containment:** rewards gated by trust; burst storage expires; rate limits everywhere.
5. **Privacy by default:** hashed identifiers for discovery, short-lived tokens, least-privilege scopes.

---

## 1) Scope (MVP+)

**Included**

* Object Storage quotas (reserve → upload → commit) with usage bar
* Levels 0–3 persistent caps (25 MB → 5 GB), micro-rewards
* Burst credits up to +20 GB (rolling 30 days)
* Trust Score (phone intel + optional device attestation)
* Contact import (Google, Outlook) and consent-based discovery (Google/Outlook/Facebook/Phone/Email)
* Minimal compute quotas (embeddings/jobs) + DM send limits
* Basic dashboard UI cards (Storage, Level Progress, Connectors, Add Contacts)

**Excluded (flagged)**

* Inbox (Gmail) read-only connector (feature-flagged; not blocking MVP)
* Calendar, monetization, advanced consent UI

---

## 2) High-level architecture

```
Next.js (vibe-cloud-ui)
  ├─ Dashboard: StorageCard, LevelProgressCard, ConnectorsCard, AddContacts
  └─ Settings: Discovery toggles, Phone verify, Security (Passkey)

vibe-cloud-api
  ├─ StorageSvc  (S3 driver, reservations, reconciler)
  ├─ ProgressSvc (levels, points, awards, burst calc)
  ├─ TrustSvc    (phone intel adapters, device attest)
  ├─ ContactsSvc (Google/Outlook import)
  ├─ DirectorySvc(discovery hashes; mutual-consent matching)
  └─ Rates/Abuse (limits, velocity, graph checks)

Data plane
  ├─ Scaleway Object Storage (bucket: vibe-prod)
  └─ CouchDB (partitioned): user docs, quota, tier, trust, events, indexes
```

---

## 3) Storage foundation (Scaleway S3)

### 3.1 Bucket layout

```
s3://vibe-prod/u/<uid>/...        # counts toward user quota
s3://vibe-prod/cache/<uid>/...    # evictable, excluded from quota
s3://vibe-prod/system/...         # shared assets
```

Lifecycle rule: expire `cache/` after 14–30 days.

### 3.2 Quota model

* `user::<uid>:quota` → `{ limit_bytes, used_bytes, reserved_bytes, burst_bytes, updatedAt }`
* Ground truth = object sizes under `u/<uid>/`; reconciler heals drift nightly.

### 3.3 Upload protocol (Reserve → Upload → Commit)

1. **Reserve**: check `(used + reserved + size) ≤ limit + burst`, CAS-increment `reserved_bytes`.
2. **Upload**: presigned **POST** with `content-length-range = size`, key `u/<uid>/<objectId>`.
3. **Commit**: verify HEAD size, move `reserved → used`, write `obj` index doc.

Deletion subtracts size and removes index. Cleaner reclaims stale reservations.

### 3.4 API (Storage)

* `POST /storage/reserve` `{ size, mime }` → `{ uploadId, key, postPolicy, expiresAt }`
* `POST /storage/commit` `{ uploadId, etag, size }` → `{ objectId }`
* `DELETE /storage/object/:id`
* `GET /storage/usage` → `{ used_bytes, limit_bytes, burst_bytes }`
* `GET /storage/list?sort=size&cursor=...`

### 3.5 UI

* **StorageCard**: bar with used / limit / burst overlay; “Manage storage” (largest files; quick delete).
* Soft warnings at 80/90/100%; hard block when exceeding.

---

## 4) Levels, points, and storage caps

### 4.1 Persistent caps (defaults)

* **Level 0 (new):** 25 MB (avatar only; no share)
* **Level 1 (email verified):** 512 MB
* **Level 2 (regular):** 2 GB  — requires: avatar, **unique high-trust phone**, 3-day activity
* **Level 3 (power):** 5 GB    — requires: passkey + one connector (Google/Outlook) + light engagement
* Higher levels reserved for later; persistent caps stay modest.

### 4.2 Micro-rewards (one-time, piecemeal; capped per level)

* Avatar +64 MB; complete profile +64 MB; passkey +128 MB
* Verify phone (meets trust T1) +512 MB
* Connect Google/Outlook +256 MB each
* First semantic feed +128 MB; first collection+save +128 MB
* Qualified referral +512 MB (cap 2/mo)

### 4.3 Burst credits (temporary for creators)

* Based on **Quality-30 (Q30)** = interaction score over last 30 days

  * +5 GB at Q30 ≥ 100
  * +10 GB at Q30 ≥ 300
  * +20 GB at Q30 ≥ 1000 (max)
* Rolling window; **expires** if Q30 drops. Used only in `limit_bytes` calculation as `burst_bytes`.

### 4.4 Interaction score (bounded)

* Weights: like=1, comment=3, save/reshare=5, follow=8
* Trust multiplier: L2=0.6×, L3+=1.0× (cap overall multiplier)
* Uniqueness: first N per user/week count; per-post & per-creator caps
* Time decay: half-life \~14 days

### 4.5 Engine (config-driven)

* `levels.json` — gates & base caps by level
* `quests.json` — eventKey → points/MB, prereqs, caps per period
* Award engine is **idempotent** (stores `(userId, eventKey, fingerprint)`)

---

## 5) Trust score (phone + device)

### 5.1 Signals & normalization (0–100)

* Line type: mobile +20, landline +10, VOIP −30
* Reachable (HLR) +15; new port/activation −15
* SIM-swap ≤7d −40; ≤30d −20 (checked only on sensitive flows)
* Country/IP mismatch −10 (light)
* Device attestation PASS +10 (optional)
* Clamp 0–100; buckets: **T0(0–39)**, **T1(40–69)**, **T2(70–100)**

### 5.2 Policy gates

* Level 2 requires **T1+** and no SIM-swap in ≤7d
* Recovery / payout changes: require **T2** or redo OTP & wait-out swap window

### 5.3 Adapters

```ts
interface PhoneIntelProvider {
  lookup(input: { e164: string, ip?: string }): Promise<{
    score0to100: number,
    reasons: string[],
    raw?: any
  }>
}
```

Providers pluggable (e.g., Telesign/Vonage/Twilio). Store raw briefly for audit.

---

## 6) Contact import & consent-based discovery

### 6.1 Connectors

* **Google People**: import contacts (selected fields)
* **Outlook Graph**: import contacts
* **Facebook Friends**: shows only friends **who use the app** (mutual consent by design) — used **only** for matching Vibe users
* **Phone/Email**: user toggles discoverability by phone and/or email

### 6.2 Discovery directory (privacy-preserving)

* Normalize → hash identifiers: `H = SHA256(norm(value) || serverPepper)`
* Publish: `{ userId, types: [phone|email|google|outlook|facebook], hashes: [...] }`
* Match rule: return a Vibe ID **only** if (a) both parties opted into the same type and (b) query hash ∈ published hashes
* Rate limits + pepper rotation (with rehash job) prevent enumeration

### 6.3 UI

* **ConnectorsCard**: connect Google/Outlook/Facebook; toggles for "Discoverable by phone/email"
* **Add Contacts**: tabs → Friends on Vibe (mutual matches) / Invite contacts (email/SMS)

---

## 7) Compute & messaging quotas

* **Embeddings per month:** L0 200, L1 500, L2 2k, L3 5k, L4+ 10k–25k
* **Background jobs (re-rank):** soft cap per level; backoff when hot
* **DM send/day:** L0 0, L1 10, L2 50, L3 200

---

## 8) Anti-abuse & fraud controls

* Award events **rate-limited** per device/IP; monthly caps (e.g., referrals)
* **Idempotent** awards; no duplicate credit
* **Trust-gated** quests (most require phone T1 first)
* Only **Level 2+** interactions count toward Q30
* **Dormancy**: burst expires naturally; persistent MB never silently shrinks
* **Phone uniqueness**: 1 verified phone → 1 active account (cooldown on release)
* Block known disposable/VOIP for level gating (still allowed for recovery)

---

## 9) Data model (CouchDB, partitioned)

Doc ID prefix convention: `u:<uid>+a:<appId>:` for app data; system docs use `user::<uid>:`.

* `user::<uid>:quota` → storage totals (persistent + burst)
* `user::<uid>:tier`  → `{ points, level, history[] }`
* `user::<uid>:trust` → `{ phone: { e164, score, reasons, updatedAt }, device: {...} }`
* `user::<uid>:directory` → published discovery hashes & flags
* `user::<uid>:award::<eventKey>` → idempotency records
* `user::<uid>:obj::<objectId>` → `{ key, size, status }`
* `user::<uid>:events::<ts>` → analytic events (optional, sampled)

Cluster settings: set `max_document_size = 1MB`; add `validate_doc_update` to enforce owner/app, field caps, and block `_attachments`.

---

## 10) API surface (selected)

**Storage**

* `POST /storage/reserve` · `POST /storage/commit` · `DELETE /storage/object/:id` · `GET /storage/usage` · `GET /storage/list`

**Progress**

* `POST /progress/emit` `{ eventKey, payload }` → awards points/MB if prereqs met
* `GET /progress` → `{ level, points, persistentCap, burstCap, nextActions[] }`

**Trust**

* `POST /trust/phone/verify` (OTP) → verifies control
* `POST /trust/phone/intel` (server) → scores phone (provider call)

**Contacts & Discovery**

* `POST /connect/google` · `POST /connect/outlook` · `POST /connect/facebook`
* `GET /contacts/import?source=google|outlook` → preview & select import
* `POST /directory/publish` `{ types }` (phone/email/google/outlook)
* `POST /directory/match` `{ type, identifiers[] }` → matched Vibe IDs (only mutual & opted-in)

**Security**

* `POST /security/passkey/register` · `POST /security/phone/add`

---

## 11) Dashboard UX summary

* **StorageCard**: usage bar (persistent + burst overlay), manage storage CTA
* **LevelProgressCard**: level, points, and 3 suggested actions (quests)
* **ConnectorsCard**: Google/Outlook/Facebook connects; discoverability toggles
* **AddContacts**: mutual matches; invite via email/SMS; search by handle
* **Settings**: phone verify, passkey, privacy toggles

---

## 12) Observability & KPIs

* **Activation**: signup → Level 1; Level 1 → Level 2 conversion; time-to-first upload; first feed/collection creation
* **Storage**: used vs limit, warnings fired, deletes after warnings, burst utilization
* **Trust**: phone T1/T2 distribution; SIM-swap blocks on sensitive flows
* **Discovery**: connector attach rate; match rate; invitations sent → joins → Level 2
* **Abuse**: award denials, rate-limit hits, duplicate-event attempts

---

## 13) Rollout plan

**Phase A: Foundation**

* Storage reserve/commit + usage bar, reconciler, lifecycle
* Levels 0–2 + micro-rewards; phone trust gating; passkey quest
* Google/Outlook contact import; discovery directory (phone/email)

**Phase B: Social**

* Facebook mutual-friends matching; Add Contacts UX polish
* DM limits by level

**Phase C: Creator**

* Interaction scoring & burst credits; creator analytics panel (Q30)

**Phase D: Optional**

* Inbox (Gmail) under feature flag, pending Google review

Staged cohort rollout; feature flags for new gates; dark-launch scoring before enforcement.

---

## 14) Acceptance criteria (excerpt)

* New user can: verify email, upload avatar, see **512 MB** at Level 1; unlock **2 GB** after phone T1 + activity in 3 days.
* Reserve/commit is idempotent; reconciler heals drift ≤ 64 KB tolerance.
* Discovery only returns matches when **both** sides opted-in for the same identifier type.
* Award engine prevents duplicate credit; monthly referral cap enforced.
* Interaction scoring produces burst that **expires** without sustained Q30.

---

## 15) Open questions

* Exact connector copy for consent screens (per provider requirements)
* Default burst thresholds (Q30 values) and caps per cohort
* Whether to display **burst vs persistent** breakdown in UI (leaning **yes**, transparency)
* Invite reward fraud: add payment method as an optional anti-abuse signal?

---

### Appendix A — Sample `levels.json`

```json
{
  "levels": [
    { "level": 0, "baseCapMB": 25, "requirements": [] },
    { "level": 1, "baseCapMB": 512, "requirements": ["verified_email", "avatar_uploaded"] },
    { "level": 2, "baseCapMB": 2048, "requirements": ["phone_trust_T1", "activity_3d"] },
    { "level": 3, "baseCapMB": 5120, "requirements": ["passkey_enabled", "connector_linked"] }
  ]
}
```

### Appendix B — Sample `quests.json`

```json
{
  "quests": [
    { "key": "avatar_uploaded", "mb": 64, "points": 50, "prereqs": ["verified_email"], "cap": {"per": "lifetime", "max": 1} },
    { "key": "passkey_enabled", "mb": 128, "points": 150, "prereqs": ["verified_email"], "cap": {"per": "lifetime", "max": 1} },
    { "key": "phone_verified_T1", "mb": 512, "points": 200, "prereqs": ["verified_email"], "cap": {"per": "lifetime", "max": 1} },
    { "key": "connect_google", "mb": 256, "points": 200, "prereqs": ["phone_verified_T1"], "cap": {"per": "lifetime", "max": 1} },
    { "key": "connect_outlook", "mb": 256, "points": 200, "prereqs": ["phone_verified_T1"], "cap": {"per": "lifetime", "max": 1} },
    { "key": "first_semantic_feed", "mb": 128, "points": 100, "prereqs": ["verified_email"], "cap": {"per": "lifetime", "max": 1} },
    { "key": "first_collection_save", "mb": 128, "points": 100, "prereqs": ["verified_email"], "cap": {"per": "lifetime", "max": 1} },
    { "key": "qualified_referral", "mb": 512, "points": 250, "prereqs": ["phone_verified_T1"], "cap": {"per": "month", "max": 2} }
  ]
}
```

### Appendix C — Final cap computation

```
levelCap      = baseCap(level)
persistentCap = sum(microRewards up to level caps)
burstCap      = f(Q30)  // 0, 5GB, 10GB, 20GB
limit_bytes   = MB_to_bytes(min(levelCap, persistentCap)) + MB_to_bytes(burstCap)
```

### Appendix D — PhoneTrust flow

```
User adds phone → OTP verify → TrustSvc.lookup(e164) → score & reasons
If score >= T1 and no recent SIM swap → unlock Level 2 prereq; award quest
Else: phone allowed for recovery only; show "how to improve" tips
```

### Appendix E — Discovery hashes

```
// Publish
POST /directory/publish { types: ["phone","email","google","outlook","facebook"] }
  Server computes hashes and stores under user::<uid>:directory

// Match (mutual-only)
POST /directory/match { type: "phone", identifiers: ["+4670..."] }
  → [ { userId, displayName, avatar } ]
```

---

**End of spec.**
