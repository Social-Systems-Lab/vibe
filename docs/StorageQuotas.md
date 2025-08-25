Totally doable. The clean pattern is: keep **one S3-compatible bucket (Scaleway)**, namespace every object by user, and enforce **app-level quotas** with a “reserve → upload → commit” flow. You’ll get precise control per user (and per tier) without fighting bucket-level limits that don’t exist per-prefix.

## What I’d implement

### 1) Bucket layout (single bucket, clear prefixes)

```
s3://vibe-prod/u/<userId>/...        # user-owned content that counts toward quota
s3://vibe-prod/cache/<userId>/...    # evictable caches (don’t count toward quota)
s3://vibe-prod/system/...            # thumbnails, shared assets
```

Use Scaleway Object Storage’s S3 compatibility; it’s the standard “prefix-per-tenant” pattern. Add **lifecycle rules** (by prefix) to auto-expire `cache/` so caches don’t eat budget. ([Scaleway][1])

### 2) Quota accounting (soft & hard limits)

* **Docs** in CouchDB:

  * `user::<uid>:quota` → `{ tier, limit_bytes, used_bytes, reserved_bytes, updatedAt }`
  * `user::<uid>:obj::<objectId>` → `{ key, size, status }` (lightweight index so you don’t ListObjects on every request)

* **Reserve → upload → commit** flow:

  1. Client asks to upload `{size, mime}`; API checks `(used + reserved + size) <= limit`.
  2. API **reserves** bytes (`reserved_bytes += size`) with MVCC retry (CouchDB `_rev` compare-and-swap).
  3. API returns a **pre-signed POST** for `u/<uid>/<objectId>` with a `content-length-range` condition equal to the reserved size.
  4. Client uploads directly to Scaleway; then calls `POST /files/commit` with `ETag/size`.
  5. API verifies (HEAD) and **moves `reserved` → `used`**, writes `obj` doc. On failure/timeout, **release** the reservation.

  (CouchDB is MVCC/optimistic concurrency—no locks—so always retry on `_conflict`.) ([docs.couchdb.org][2])

* **Delete path:** subtract `size` from `used_bytes`, remove `obj` doc.

* **Hard limit:** block uploads when `used + reserved >= limit`.

* **Soft limit:** warn (banner/email) at 80/90/100%.

* **Reconciler** (hourly/daily): for each user, `ListObjectsV2` under `u/<uid>/`, sum sizes, and **heal** `used_bytes` if drifted (guards against rare double-commit bugs).

* **Policies:** keep bucket private; grant access only via your API (or short-lived signed URLs). Scaleway supports **bucket policies** + IAM if you later want per-service credentials, but per-user quota still lives in your API. ([Scaleway][3])

### 3) Guardrails to curb abuse

* **Rate-limits** per user: uploads/day, total new bytes/day, and egress/day.
* **Max object size** per tier (e.g., 50–200 MB on free).
* **MIME/extension allow-list** if needed; virus scan only on public-sharing flows.
* **Separate caches** (`cache/`) with lifecycle (e.g., 7–30 days) so Gmail attachment caching doesn’t burn user quota.

### 4) CouchDB notes

* Don’t store blobs in CouchDB; keep them in Object Storage.
* Keep `quota` updates tiny and **idempotent** (retry on `_conflict`). If you ever need batchy math, use a per-user **ledger** (append deltas; a nightly compactor rolls them into the `quota` doc) to avoid hot-doc contention.

---

## Tiers & starting limits (pragmatic defaults)

Think of two realities: (1) users rarely use 100% of allocation, and (2) your cost is dominated by **GB-month** (storage) and **egress** after a small free allowance.

**Reasonable starting point:**

* **Tier 0 (Free / Bronze): 2 GB**
  Good enough for documents and a few media files while keeping your cost predictable.
* **Tier 1 (Silver): 5 GB**
* **Tier 2 (Gold): 20 GB**
* **Tier 3 (Platinum): 100 GB** (paid / invite)

Gate upgrades by **points + account age** to reduce farming: e.g., verified identity, regular weekly activity, healthy inbox usage, no abuse flags.

---

## What it costs you on Scaleway (ballpark)

Scaleway Object Storage (Multi-AZ “Standard”) lists **\~€0.0146/GB-month**; One-Zone-IA is **\~€0.012/GB-month**. **Egress:** first **75 GB/month free**, then **€0.01/GB**. Requests are shown as **“included.”** (Confirm at pricing time for your region/project.) ([Scaleway][4])

Using **Multi-AZ** for user data, **One-Zone-IA** for `cache/` is a nice balance. (Cold “Glacier” exists at \~€0.002/GB-month but has a **€0.009/GB restore**—great for archival, not active UX.) ([Scaleway][5])

### Per-user cost at full utilization (storage only)

* **1 GB** → €0.0146 / user-month
* **2 GB** → €0.0292 / user-month
* **5 GB** → €0.0730 / user-month
* **20 GB** → €0.292 / user-month

### Example monthly storage cost (all users fill their quota)

* 10k users @ **2 GB** = 20,000 GB × €0.0146 ≈ **€292/month**
* 10k users @ **5 GB** = 50,000 GB × €0.0146 ≈ **€730/month**

In reality, avg utilization is typically **20–40%** of the cap on free tiers, so your effective cost is often 0.2–0.4× those numbers.

### Egress example

If your users collectively download **1 TB** in a month:
1,024 GB − 75 GB free = 949 GB billable → **\~€9.49** in egress. (Egress can spike if you serve lots of media; watch it.) ([Scaleway][4])

---

## API sketch (upload w/ quota)

* `POST /storage/reserve` → `{size, mime}` → `{uploadId, key, presignedPost, expiresAt}`
* Client uploads directly to `s3://.../u/<uid>/<uploadId>`.
* `POST /storage/commit` → `{uploadId, etag, size}` → updates `used_bytes`
* `DELETE /storage/object/:id` → subtracts `size` and deletes object
* `GET /storage/usage` → `{ used_bytes, limit_bytes, softPercent }`

(Use **pre-signed POST** policies with `content-length-range` and key prefix; it’s supported in S3-compatible providers like Scaleway.) ([Scaleway][5])

---

## Nice-to-haves (soon)

* **Per-user egress caps** with rolling windows.
* **Signed download URLs** with short TTLs (generate via AWSv4 on Scaleway; standard). ([Stack Overflow][6])
* **CDN** if you expect lots of reads; or keep downloads via API to enforce ACLs.
* **Bucket lifecycle**: move old, evictable thumbnails to One-Zone-IA automatically (prefix filter). ([Scaleway][1])

---

## TL;DR recommendations

* Start with **2 GB free** (Bronze), **5 GB**, **20 GB** paid tiers.
* Enforce quotas entirely in your API with **reserve → pre-signed POST → commit** and a nightly reconciler.
* Keep user data on **Multi-AZ**, caches on **One-Zone-IA** with lifecycle expiry.
* Track egress; the first **75 GB/month is free**, then it’s cheap but can balloon with media-heavy use. ([Scaleway][4])

If you want, I can drop a tiny code scaffold for the reservation flow (Next.js + API) and the CouchDB docs/indexes so eng can wire this up quickly.

[1]: https://www.scaleway.com/en/docs/object-storage/api-cli/lifecycle-rules-api/?utm_source=chatgpt.com "Managing the lifecycle of objects"
[2]: https://docs.couchdb.org/en/stable/replication/protocol.html?utm_source=chatgpt.com "2.4. CouchDB Replication Protocol"
[3]: https://www.scaleway.com/en/docs/object-storage/api-cli/bucket-policy/?utm_source=chatgpt.com "Bucket policies overview"
[4]: https://www.scaleway.com/en/pricing/storage/?utm_source=chatgpt.com "Storage Pricing"
[5]: https://www.scaleway.com/en/docs/object-storage/faq/?utm_source=chatgpt.com "Object Storage FAQ | Scaleway Documentation"
[6]: https://stackoverflow.com/questions/65801810/creating-aws-v4-signed-url-to-download-file-form-scaleway-object-storage?utm_source=chatgpt.com "python - Creating AWS V4 signed url to download file form ..."




-------------


# Vibe Cloud — Gradual Quotas for Scaleway Object Storage & CouchDB

This doc proposes a **phased plan** to introduce per-user (and per-app) quotas across our two data planes:

* **Scaleway Object Storage (S3-compatible)** — for blobs/files
* **CouchDB** — for JSON documents / metadata

It prioritizes **low-risk rollout**, **clear UX**, and **good ops hygiene** (observability, reconciliation, and abuse controls) while keeping Vibe’s sovereignty + portability goals.

---

## 0) Design principles

1. **Single source of truth per plane**: user-visible “storage used” is based on **Object Storage**. CouchDB quotas exist to deter abuse and protect cluster health, not to meter billable storage.
2. **Gradual enforcement**: warn → soft cap → hard cap. Always ship observability before enforcement.
3. **Predictable keys & partitions**: deterministic S3 keys and CouchDB partitions allow fast accounting and recovery.
4. **Idempotent flows**: every step is safe to retry; counters reconcile from ground truth.
5. **Privacy & least privilege**: only store what we need; short-lived signed URLs; per-tenant scoping for credentials.

---

## 1) Phased roadmap

### Phase A — Instrumentation (no enforcement)

* Implement bucket keying, size accounting, and per-user usage dashboards.
* Add CouchDB partitioning and per-partition usage reporting.
* Ship UX that displays usage bars in Settings.

### Phase B — Object Storage soft caps

* Reserve → upload → commit flow with **warnings at 80/90/100%**.
* No hard rejections yet (except blatantly oversized individual uploads).

### Phase C — Object Storage hard caps + lifecycle

* Enforce hard caps on new uploads; offer “manage storage” UX (sort by size, quick delete).
* Enable lifecycle on `cache/` prefixes to auto-expire evictable data.

### Phase D — CouchDB abuse quotas & rates

* Enforce per-doc size limits; per-(user, app) JSON-bytes and write-rate caps at API layer.
* Add `validate_doc_update` safety checks.

### Phase E — Per-app budgets & tier upgrades

* Distinct budgets per third-party app. Tier-based default limits and point-driven upgrades.

---

## 2) Object Storage (Scaleway S3) quotas

### 2.1 Bucket layout

```
s3://vibe-prod/u/<userId>/...        # counts toward user quota
s3://vibe-prod/cache/<userId>/...    # evictable; excluded from quota
s3://vibe-prod/system/...            # shared assets; excluded from quota
```

Use server-side **lifecycle** rules to auto-expire `cache/` after N days. Keep bucket **private**; access via API or short-lived signed URLs.

### 2.2 Accounting model

* **Quota doc** (CouchDB): `user::<uid>:quota` → `{ tier, limit_bytes, used_bytes, reserved_bytes, updatedAt }`.
* **Object index doc** (optional but recommended): `user::<uid>:obj::<objectId>` → `{ key, size, status }`.
* **Ground truth**: S3 object sizes under `u/<uid>/`. A periodic **reconciler** sums sizes to heal drift.

### 2.3 Upload protocol — Reserve → Upload → Commit

1. **Reserve**

   * Client requests `{size, mime}` → API verifies `(used + reserved + size) ≤ limit`.
   * API atomically increments `reserved_bytes` (CouchDB `_rev` CAS); emits `uploadId`, S3 **pre-signed POST** with `content-length-range = size` and key `u/<uid>/<objectId>`.
2. **Upload**

   * Client uploads directly to S3 using returned POST policy.
3. **Commit**

   * Client calls `POST /files/commit {uploadId, etag, size}`.
   * API performs S3 `HEAD` to verify size, then moves `reserved → used` and writes `obj` doc.

**Timeout & failure**

* If commit not received within T minutes, a cleaner releases the reservation after verifying object absence.
* If upload succeeded but commit failed, reconciler will pick it up and heal counters (idempotent).

### 2.4 Delete & move

* **Delete** subtracts `size` from `used_bytes` and removes the index doc.
* **Move** (rename) is copy+delete; the index doc updates key but not size; no quota change.

### 2.5 Soft vs hard caps

* **Soft**: allow upload but show banners, email nudges, and block share links >100% until cleared.
* **Hard**: reject reserves when `used + reserved ≥ limit`. Provide a remediation link to “Manage storage.”

### 2.6 Egress controls (optional)

* Track monthly egress per user. Add soft/hard egress caps for heavy sharers. For public shares, prefer CDN or stricter TTLs.

### 2.7 API surface (Object Storage)

* `POST /storage/reserve` → `{size, mime}` ⇒ `{uploadId, key, presignedPost, expiresAt}`
* `POST /storage/commit` → `{uploadId, etag, size}` ⇒ `{objectId}`
* `DELETE /storage/object/:id`
* `GET /storage/usage` ⇒ `{ used_bytes, limit_bytes, softPercent }`
* `GET /storage/list?sort=size&cursor=...` (for “Manage storage” UI)

### 2.8 Pseudocode (Node-ish)

```ts
// Reserve (CouchDB optimistic update)
async function reserve(userId, size) {
  return withCAS(`user::${userId}:quota`, async (q) => {
    if (q.used_bytes + q.reserved_bytes + size > q.limit_bytes) throw new Error('quota_exceeded')
    q.reserved_bytes += size
    q.updatedAt = Date.now()
    return q
  })
}

// Presigned POST (S3-compatible)
function createPresignedPost(key, size, mime) {
  return s3.createPresignedPost({
    Bucket: BUCKET,
    Fields: { key, 'Content-Type': mime },
    Conditions: [["content-length-range", size, size]],
    Expires: 300 // seconds
  })
}

// Commit
async function commit(userId, uploadId, key, size) {
  const head = await s3.headObject({ Bucket: BUCKET, Key: key })
  if (head.ContentLength !== size) throw new Error('size_mismatch')
  await withCAS(`user::${userId}:quota`, async (q) => {
    q.reserved_bytes -= size
    q.used_bytes += size
    q.updatedAt = Date.now()
    return q
  })
  await putObjIndex(userId, { key, size, status: 'ok' })
}
```

### 2.9 Reconciler (ground truth heal)

* Nightly (and on demand), list objects under `u/<uid>/` and sum sizes.
* Compare with `used_bytes`; if drift > ε (e.g., 64 KB), correct `used_bytes` and log a metric.
* Also reconcile missing `obj` docs.

### 2.10 Lifecycle & caches

* `cache/<uid>/` gets an auto-expire rule (e.g., 14–30 days).
* Optionally move stale thumbnails to a cheaper class.

---

## 3) CouchDB quotas (abuse prevention)

### 3.1 Partitioning & keys

* Use a **partitioned database** for app data; partition by **user** or **user+app**.
* Example doc IDs: `u:<uid>+a:<appId>:posts/<id>` (partition id is the substring before the first `:`).
* Use `GET /{db}/_partition/{partitionId}` to fetch `doc_count` and size metrics for reconciliation.

### 3.2 Limits to enforce

1. **Per-document size cap**: set `max_document_size` (e.g., 1 MB) at the cluster level.
2. **Field caps** in `validate_doc_update` (e.g., `content` ≤ 64 KB, no `_attachments`).
3. **Per-(user, app) budgets** at API:

   * `json_bytes_limit` (logical bytes of JSON)
   * `doc_count_limit`
   * **write-rate**: N writes/min, M writes/day
4. **Global per-user caps** (sum of all apps) to prevent multi-app sprawl.

### 3.3 Quota records

* `user::<uid>:cdb_quota` → `{ json_bytes_limit, json_bytes_used, doc_count_limit, doc_count_used, writes_today, window_resetAt }`
* `user::<uid>:app::<appId>:cdb_quota` for per-app budgets.
* **Ledger option** (for high contention): append-only deltas; a compactor rolls up ledgers nightly into the quota doc.

### 3.4 Write preflight & accounting

* On `PUT/POST`:

  * Compute `newBytes = byteLen(JSON.stringify(doc)) - byteLen(prevDoc || 0)`.
  * Check `(json_bytes_used + newBytes) ≤ json_bytes_limit` and `(doc_count_used + Δdocs) ≤ doc_count_limit`.
  * Check write-rate windows; increment counters atomically via `_rev` CAS.
* On delete: subtract the serialized size of the previous doc and decrement count.

### 3.5 Reconciliation

* Periodic job per partition:

  * `GET /db/_partition/{pid}` to read `doc_count` and `sizes.external` (use as logical size proxy).
  * Heal `json_bytes_used` and `doc_count_used` if drift > ε.

### 3.6 Validation function (guard rails)

```js
function validate_doc_update(newDoc, oldDoc, userCtx, secObj) {
  // 1) No attachments (blobs go to Object Storage)
  if (newDoc._attachments) throw({forbidden: 'Attachments not allowed; use Object Storage.'})

  // 2) Enforce partition consistency (owner/app)
  if (!newDoc.owner || !newDoc.appId) throw({forbidden: 'owner/appId required'})

  // 3) Field caps
  if (newDoc.type === 'posts') {
    if ((newDoc.content || '').length > 64 * 1024) throw({forbidden: 'content too large'})
  }
}
```

> Note: we keep **hard quotas in the API**, not in `validate_doc_update`, because validate hooks can’t aggregate cluster-wide usage safely.

### 3.7 Suggested starting limits (tune with telemetry)

* **Per user (all apps)**: `json_bytes_limit = 50 MB`, `doc_count_limit = 25,000`, `writes/day = 1,000`, `writes/min = 30`.
* **Per (user, app)**: `json_bytes_limit = 10 MB`, `doc_count_limit = 5,000`, `writes/day = 300`, `writes/min = 15`.
* **Per document**: `max_document_size = 1 MB`; stricter field caps by type.

---

## 4) Tiers, pricing, and UX

### 4.1 Example tiers (Object Storage)

| Tier     |  Limit | Notes                                   |
| -------- | -----: | --------------------------------------- |
| Bronze   |   2 GB | default; good for docs + light media    |
| Silver   |   5 GB | unlock via points or small subscription |
| Gold     |  20 GB | for power users                         |
| Platinum | 100 GB | paid; manual review for abuse           |

CouchDB quotas are **not** user-facing; they are safety rails. Optionally surface a debug view for developers.

### 4.2 Cost thinking

Let **P = € per GB-month** (Scaleway Standard). Storage cost per user at full utilization: `Limit_GB × P`. Real utilization on free tiers typically runs 20–40% of cap.

Example at `P = €0.015`:

* 2 GB → €0.03/user-month
* 5 GB → €0.075/user-month
* 20 GB → €0.30/user-month

Egress: first free allowance applies account-wide; then \~€0.01/GB (confirm per region). Track heavy sharers.

### 4.3 UX states

* **Healthy** (<80%): green bar.
* **Warning** (80–99%): amber bar + call to action.
* **Full** (≥100%): red bar; block new uploads; “Manage storage” lists largest files with quick-delete.

---

## 5) Monitoring & alerting

**Metrics**

* Object Storage: `used_bytes`, `reserved_bytes`, `reconciled_bytes`, uploads/day, deletes/day, egress/user.
* CouchDB: doc\_count and sizes per partition, write rates, compaction lag, conflicts per second.

**Dashboards**

* Per-user usage; top 100 users by storage; drift histogram.

**Alerts**

* Reconciler failures, high drift, excessive 4xx on reserve (users repeatedly hitting cap), CouchDB partition > threshold, compaction lag.

---

## 6) Security & compliance

* Keep bucket private; downloads via short-lived **signed URLs** (≤ 5 minutes) or via API stream to enforce ACLs.
* Encrypt tokens and credentials with KMS; rotate keys.
* Audit log: quota changes, reserve/commit outcomes, reconciler adjustments.

---

## 7) Migration plan (existing data)

1. Backfill `obj` index docs by listing current `u/<uid>/` prefixes.
2. Compute `used_bytes` per user; initialize quota docs.
3. Enable instrumentation and dashboards (Phase A). Observe for 1–2 weeks.
4. Turn on warnings (Phase B). Validate UX and support load.
5. Flip hard caps (Phase C). Stage rollout by cohort.
6. Introduce CouchDB per-doc cap + rate limits (Phase D). Start gentle; raise as needed.

---

## 8) Test plan

* **Unit**: reserve/commit idempotency, conflict retries, delete accounting.
* **Integration**: upload races (parallel reserves), commit loss, partial uploads, reconciler healing.
* **Load**: 95th percentile reserve latency; S3 request budget; CouchDB write throughput under rate limits.
* **Chaos**: inject network errors between upload and commit; verify no phantom reservations remain.

---

## 9) Open decisions

* Initial soft-limit thresholds (80/90/100% as default).
* Whether to expose per-app quotas to end-users (likely **no**, developer-only).
* Default lifecycle TTL for `cache/` (14 vs 30 days).
* When to offer paid upgrades and what events earn “points.”

---

## 10) Implementation checklist (copy/paste)

**Object Storage**

* [ ] Create prefixes `u/`, `cache/`, `system/` and lifecycle rule for `cache/`.
* [ ] Implement `reserve → presigned POST → commit` endpoints.
* [ ] Create `user::<uid>:quota` doc + CAS helpers; add nightly reconciler.
* [ ] Build “Manage storage” UI: top-N largest, search, delete.
* [ ] Add usage bars & email nudges at 80/90/100%.

**CouchDB**

* [ ] Convert app DB to **partitioned**; enforce ID scheme in API.
* [ ] Set cluster `max_document_size` (e.g., 1 MB).
* [ ] Add `validate_doc_update` with field caps & guards.
* [ ] Implement per-(user, app) quotas & write-rate checks in API.
* [ ] Add partition reconciliation worker + alerts.

**Observability & Ops**

* [ ] Dashboards for usage and drift; alerts for thresholds.
* [ ] Run Phase A for 1–2 weeks; review metrics; adjust limits.

---

**Outcome:** This plan lets us roll out quotas with minimal user friction, strong abuse resistance, and clear pathways to raise limits via tiers/points—while keeping the system portable and cost-predictable.
