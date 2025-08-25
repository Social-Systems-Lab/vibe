Here’s a tight, implementation-ready spec for **Vibe Cloud Inbox (Gmail first) + @vibecloud.se alias**. It’s written for our stack: **vibe-cloud-ui (Next.js)** → **vibe-cloud-api** → **CouchDB** (+ optional **Scaleway Object Storage** for large artifacts).

---

# 1) Scope & goals

**Goals (MVP)**

* Let a signed-in Vibe user connect **Gmail**.
* Show their inbox (threads, labels, search, read state) inside Vibe.
* Offer an **@vibecloud.se alias** that forwards to their Gmail.
* Read-only to start (no send), with realtime-ish updates.

**Near-term (M1)**

* Reply/compose from Vibe via **Vibe SMTP (SES/Postmark)**; then **insert** sent message into Gmail “Sent”.
* Optional: enable Gmail “send-as” using our SMTP (verified alias), so Gmail-native compose also uses the alias.

**Non-goals (now)**

* Hosting full mailboxes.
* POP/IMAP generic integrations (we’ll add Outlook/Graph next).

---

# 2) High-level architecture

**Frontend (vibe-cloud-ui / Next.js)**

* Route: `/inbox`
* Components: `ConnectCard`, `GmailAccountBadge`, `SearchBar`, `LabelChips`, `MessageList`, `ThreadView`, `Composer` (hidden in MVP), `AliasPanel`.

**Backend (vibe-cloud-api)**

* Services:

  * **Auth**: Google OAuth 2.0 (offline), token vault (KMS).
  * **Gmail Sync Worker**: initial sync + incremental with **Pub/Sub push**; polling fallback.
  * **Inbox API**: list/search threads, read message, fetch attachments (on demand), label map, deep-link to Gmail.
  * **Alias Service**: manage `username@vibecloud.se` forwarding target; outbound SMTP in M1.
* Data: **CouchDB** (per-user partitioned DB recommended) for message metadata and mapping; **Scaleway** optional cache for large MIME parts if we decide to persist.

---

# 3) User journeys

## A) Connect Gmail (MVP)

1. User opens `/inbox`.
2. Sees **Connect Gmail** card → OAuth (scopes: `gmail.readonly`, `gmail.metadata`).
3. On callback, API stores tokens, kicks **initial sync** (last 30–90 days) and registers **watch** (Pub/Sub).
4. UI renders list within seconds as metadata lands.

## B) Alias setup

1. User opens **AliasPanel** → offered `username@vibecloud.se`.
2. User enters **forwarding destination** (defaults to connected Gmail).
3. Backend creates/updates routing rule (e.g., Cloudflare Email Routing or equivalent).
4. Test mail button → confirms delivery to Gmail.

## C) Reply/Compose (M1)

* Compose in Vibe → send via **Vibe SMTP** (DKIM/DMARC aligned to `vibecloud.se`) → API **inserts** MIME into Gmail “Sent”.
* Optional: enable Gmail **send-as** with our SMTP; once verified, UI allows choosing From: `username@vibecloud.se`.

---

# 4) Gmail integration details

**Scopes (progressive):**

* MVP: `https://www.googleapis.com/auth/gmail.readonly`, `…/gmail.metadata`
* M1 send: `https://www.googleapis.com/auth/gmail.send` (or full `mail.google.com` only if truly needed)
* Manage send-as (later): `…/gmail.settings.sharing` (+ `…/gmail.settings.basic`)

**Initial sync strategy**

* Timeboxed: last **90 days** (config).
* Fetch **threads** with `q` default `in:inbox -category:promotions newer_than:90d` (tunable per user).
* Store **headers/snippets/labels**, not full bodies.
* Bodies & attachments fetched **on demand**.

**Incremental updates**

* Register `users.watch` → receive Pub/Sub push to `/integrations/google/gmail/push`.
* Keep `historyId` per user. On push, call `users.history.list(startHistoryId)`; if too old, do a bounded delta resync.
* Re-register watch daily; Google expires at ≤7 days.

**Quotas & perf**

* Batch `messages.get` where possible, aggressive ETag caching, exponential backoff.
* Reduce API surface by rendering list from our **CouchDB index**; fetch body only when thread is opened.

**Search mapping**

* UI search box passes Gmail-style search syntax to backend (we **do not** attempt to reimplement search).
* Backend executes `users.messages.list` with `q` and updates/merges metadata cache.

**Labels**

* Maintain a `gmailLabelId → name/color` map per user.
* Reflect read/unread, starred states via label changes.

**Attachments**

* When a message is opened and user clicks an attachment:

  * Default: **stream from Gmail** to client (proxy through API to enforce auth).
  * Optional cache: store attachment bytes in **Scaleway** for faster repeat access; record content hash and source revision.

---

# 5) Data model (CouchDB)

Use a **partitioned database** per user for scale (`user::<docId>`). Examples:

### `user::<uid>:gmail_account`

```json
{
  "_id": "user::USER123:gmail_account",
  "type": "gmail_account",
  "googleUserId": "abc123",
  "email": "alice@gmail.com",
  "scopes": ["gmail.readonly","gmail.metadata"],
  "historyId": "178234987123",
  "watch": { "expiresAt": 1729999999000, "topic": "projects/…/topics/vibe-gmail" },
  "connectedAt": 1724567890000
}
```

### `user::<uid>:thread::<threadId>`

```json
{
  "_id": "user::USER123:thread::1764abcd",
  "type": "thread",
  "threadId": "1764abcd",
  "lastMessageId": "1812ef01",
  "snippet": "Here are the slides…",
  "labels": ["INBOX","CATEGORY_PERSONAL","UNREAD"],
  "participants": [
    {"name":"Sam","email":"sam@acme.com"},
    {"name":"Alice","email":"alice@gmail.com"}
  ],
  "subject": "Quarterly review",
  "updatedAt": 1724567999000
}
```

### `user::<uid>:message::<messageId>`

```json
{
  "_id": "user::USER123:message::1812ef01",
  "type": "message",
  "messageId": "1812ef01",
  "threadId": "1764abcd",
  "internalDate": 1724567998000,
  "from": {"name":"Sam","email":"sam@acme.com"},
  "to": [{"name":"Alice","email":"alice@gmail.com"}],
  "headers": { "Message-Id": "<...>", "MIME-Version":"1.0", "Content-Type":"multipart/alternative; boundary=..." },
  "hasAttachments": true,
  "sizeEstimate": 124567,
  "labelIds": ["INBOX","UNREAD"],
  "bodyState": "unfetched"  // or "fetched"
}
```

### `user::<uid>:alias`

```json
{
  "_id": "user::USER123:alias",
  "type": "alias",
  "address": "alice@vibecloud.se",
  "forwardTo": "alice@gmail.com",
  "status": "active",   // "pending","error"
  "verified": true,
  "createdAt": 1724567800000
}
```

> Notes
>
> * Keep large MIME parts **out** of CouchDB (use Scaleway if caching).
> * Add views by `type` and by `updatedAt` for list screens.
> * Store **only** what we need for UI to minimize “restricted data” footprint.

---

# 6) Backend API (contract)

**Auth & Integrations**

* `POST /integrations/google/gmail/connect` → returns `authUrl`
* `GET  /integrations/google/oauth/callback` → handles code, stores tokens, boots sync
* `POST /integrations/google/gmail/watch/renew` (worker/cron)

**Push endpoint (Google → us)**

* `POST /integrations/google/gmail/push` (verifies JWT, topic; enqueues delta sync job)

**Inbox**

* `GET  /inbox/threads?limit=50&cursor=…&q=…&label=INBOX`
* `GET  /inbox/threads/:threadId`
* `GET  /inbox/messages/:messageId/body` (streams HTML/plain + CID mapping)
* `GET  /inbox/messages/:messageId/attachments/:attId` (streams; optional cached redirect)
* `POST /inbox/messages/:messageId/labels` (M1 if we support read/star toggle)

**Compose (M1)**

* `POST /inbox/compose`
  Body: `{from, to[], cc[], bcc[], subject, html, text, attachments[]}`
  Behavior: send via Vibe SMTP → `users.messages.insert` into Gmail with `SENT` label.

**Alias**

* `GET  /alias` → current alias object
* `POST /alias` → `{ address?, forwardTo }` create/update routing rule
* `POST /alias/test` → sends a test email and records result

**Admin/ops**

* `POST /integrations/google/gmail/resync` (rebuild cache for user)
* `DELETE /integrations/google/gmail` (disconnect: revoke token, purge cache)

---

# 7) Frontend (Next.js) UI spec

**/inbox layout**

* **Left rail**: Labels (INBOX, Starred, Sent\*, Drafts\*, custom when available), quick filters (Unread, Has attachment).
* **Header**: Search input (passes Gmail `q`), account badge (connected email), overflow menu → “Open Gmail”.
* **Content**:

  * **Not connected**: `ConnectCard` with Google button, scopes listed, privacy note.
  * **Connected**: `MessageList` (virtualized), infinite scroll; `ThreadView` panel with tabs: *Content*, *Headers* (dev-mode), *Attachments*.
* **Settings drawer**: “Alias @vibecloud.se” with field for forward-to and status indicator.

**State handling**

* Use React Query/SWR with cursor-based pagination.
* Optimistic update for read/unread toggles (when enabled).
* Toasts for sync/alias status.

---

# 8) Security, privacy, compliance

* **Token security**: store refresh tokens encrypted at rest; wrap access with a per-tenant KMS key; rotate client secrets.
* **Least privilege**: start with read-only scopes; request send scopes only when user clicks “Enable send from Vibe”.
* **Google policies**: comply with Google API Services User Data Policy (Limited Use). Provide data deletion button (disconnect).
* **Data minimization**: cache only headers/snippets by default; fetch bodies on open; redact or strip embedded tracking pixels if proxying images.
* **Audit & logs**: log scope grants, token use, alias changes, and message-send events (without content).
* **PII handling**: if caching attachments, encrypt at rest; configurable TTL; respect user export/delete.

---

# 9) Alias service design

**MVP**

* One address: `{username}@vibecloud.se`
* Forward target: connected Gmail by default; editable.
* Provider: Cloudflare Email Routing (or equivalent). Store provider id + status in `alias` doc.

**M1: Outbound sending as alias**

* **Path A (recommended first):** Vibe sends via SES/Postmark (DKIM/DMARC aligned). Immediately **insert** MIME into Gmail “Sent”.
* **Path B (advanced):** Create Gmail **send-as** pointing to our SMTP (programmatically via Gmail Settings API). Verification link lands at alias and forwards to Gmail; user confirms. Then Gmail compose can use the alias too.

**Deliverability**

* Dedicated subdomain/IP for auth mail if needed (e.g., `auth.vibecloud.se`).
* SPF/DKIM/DMARC set for `vibecloud.se`.
* Keep transactional and user-sending pools separate.

---

# 10) Workers & background jobs

* **Gmail watch renewer** (cron hourly): finds watches expiring in <24h, re-registers.
* **Delta sync consumer**: processes Pub/Sub pushes; idempotent per `historyId`.
* **Re-sync fallback**: if `startHistoryId` invalid, schedule segmented resync (e.g., last 7/30/90 days).
* **Alias health checker**: periodic test email; updates `alias.status`.
* **Attachment cache GC** (if enabled): removes stale cached blobs from Scaleway.

---

# 11) Error handling & edge cases

* Token revoked → mark account **disconnected**, show reconnect CTA; do not delete local cache immediately (allow read-only view for X days if allowed).
* History too old → bounded resync; surface a banner “We’re catching up your inbox.”
* Rate limits → backoff + queue; degrade gracefully to **polling** (every N minutes) if Pub/Sub is misconfigured.
* Large threads/attachments → stream to client; show size warnings >25MB.
* Alias loops (user forwards Gmail back to alias) → detect and refuse with a helpful message.

---

# 12) Observability

* Metrics: time-to-first-message after connect, delta-sync latency, API quota usage, error rate by endpoint, alias forward success %, send success %.
* Tracing: tag spans with `googleUserId`, `threadId`, `messageId` (internal only).
* Dashboards + alerts for watch expirations, quota nearing, send failures.

---

# 13) Rollout plan

**MVP (2–3 dev-weeks worth of work units, adjust to our cadence)**

* Gmail connect (read-only), initial+incremental sync with Pub/Sub, inbox UI, alias forwarding, test mail.

**M1**

* Send from Vibe via SMTP + Gmail “Sent” insert; read/unread/star toggles; attachment caching switch.

**M2**

* Gmail send-as automation; multi-account support; Outlook/Graph connector.

---

# 14) Concrete TypeScript stubs (backend)

```ts
// oauth.ts
export async function startGmailConnect(userId: string) {
  const scopes = ['https://www.googleapis.com/auth/gmail.readonly',
                  'https://www.googleapis.com/auth/gmail.metadata']
  return buildGoogleAuthUrl({ scopes, state: signState({ userId }) })
}

export async function handleGmailCallback(code: string, state: string) {
  const { userId } = verifyState(state)
  const tokens = await exchangeCodeForTokens(code)
  await tokenVault.store(userId, 'gmail', tokens)
  await gmailSync.kickoffInitialSync(userId)
  await gmailSync.ensureWatch(userId)
}
```

```ts
// gmailSync.ts (outline)
export async function kickoffInitialSync(userId: string) {
  const q = 'in:inbox newer_than:90d -category:promotions'
  for await (const page of listMessageIdsPaged(userId, q)) {
    const metas = await batchGetMessagesHeaders(userId, page.ids)
    await upsertMetadata(userId, metas)
  }
}

export async function handlePush(userId: string, historyId: string) {
  const deltas = await listHistoryFrom(userId, historyId)
  const affected = collectMessageIds(deltas)
  const metas = await batchGetMessagesHeaders(userId, affected)
  await upsertMetadata(userId, metas)
  await saveHistoryId(userId, deltas.latestHistoryId)
}
```

```ts
// compose.ts (M1)
export async function sendViaVibeAndInsertToGmail(userId: string, mime: Buffer) {
  await smtpPool.sendRaw(mime) // SES/Postmark
  await gmailApi.users.messages.insert({ userId: 'me', requestBody: { raw: base64url(mime) } })
  await gmailApi.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: ['SENT'] } })
}
```

---

# 15) Open decisions (pick defaults now, we can revise)

* **Initial sync window**: 90 days (✅ default).
* **Attachment cache**: off by default (✅), toggle per user/space later.
* **Provider for alias**: Cloudflare Email Routing (✅), abstract behind `AliasProvider`.
* **DB partitioning**: one **partitioned DB per user** or one multi-tenant partitioned DB with `user::<uid>` keys (✅ latter to start).

---

If you want, I can turn this into tickets (backend, frontend, infra) with estimates, plus a checklist for Google Cloud (OAuth client, Pub/Sub topic, push auth, service accounts) and DNS (SPF/DKIM/DMARC) so eng can kick off immediately.
