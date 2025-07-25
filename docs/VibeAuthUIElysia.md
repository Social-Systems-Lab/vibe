Below is a single, copy‑/pasteable **implementation guide** for running **Next.js behind Elysia** while keeping **one public origin (`https://api.vibeapp.dev`)** so cookies “just work”.

---

# Vibe Auth UI: Next.js behind Elysia (Single-Origin) — Implementation Guide

## 1) Goal

Serve a richer, full‑screen, co‑branded signup/consent wizard with **Next.js** while **preserving your current cookie/session model** and avoiding cross‑origin headaches. The browser should only ever talk to **`https://api.vibeapp.dev`**.

---

## 2) Final topology

```
Browser  ───────────►  https://api.vibeapp.dev
   ├── /api/*         -> handled by Elysia directly
   └── /auth/*        -> Elysia reverse-proxies to Next.js (internal :4000)

Elysia (Bun) ───────► Next.js (internal, not publicly reachable)
```

Optional: static Next assets (`/_next/*`) are also proxied under `/auth/_next/*`.

---

## 3) Cookie & session contract

-   **Name**: `vibe_session`
-   **Attributes**:
    `Path=/; Domain=api.vibeapp.dev; Secure; HttpOnly; SameSite=Lax`

    -   Use `SameSite=None; Secure` **only if** you must embed flows in third‑party iframes.

-   **Issuer**: Prefer **Elysia** (single source of truth). If Next must set it, **use identical attributes**.
-   **Never expose another public origin/port**; otherwise the cookie won’t be sent.

---

## 4) Elysia: reverse proxy `/auth/*` to Next

```ts
// server.ts
import { Elysia } from "elysia";
import { proxy } from "elysia-proxy";

const app = new Elysia();

// APIs stay here
app.get("/api/health", () => "ok");

// Everything UI under /auth/* goes to Next
app.all(
    "/auth/*",
    proxy("http://127.0.0.1:4000", {
        // If you configure Next with basePath: '/auth', no rewrite is needed.
        // rewrite: (path) => path.replace(/^\/auth/, ''),
        headers: {
            "X-Forwarded-Host": "api.vibeapp.dev",
            "X-Forwarded-Proto": "https",
        },
    })
);

app.listen(3000);
```

**Make sure you forward the original `Host` (or `X-Forwarded-Host`) so Next can generate absolute URLs and cookies correctly.**

---

## 5) Next.js configuration

```js
// next.config.js
/** @type {import('next').NextConfig} */
module.exports = {
    basePath: "/auth", // so routes+assets live under /auth/*
    poweredByHeader: false,
    // If on older Next: experimental: { trustHostHeader: true }
};
```

-   Run Next on an **internal port** (e.g. `PORT=4000 bun next start -p 4000`).
-   All pages you create (e.g. `/wizard`, `/consent`, `/profile`) will resolve to `/auth/wizard`, `/auth/consent`, etc.

---

## 6) How Next talks to your API

**Best:** use **relative URLs** so requests stay same-origin and browser cookies are forwarded automatically:

```ts
// Example server component / route handler
const res = await fetch("https://api.vibeapp.dev/api/session", {
    headers: { cookie: req.headers.get("cookie") ?? "" }, // if you’re inside Next's server runtime
});
```

Inside **client components**, just call `/api/...` — it’s the same origin from the browser’s POV.

If you must call the **internal** Elysia port (not recommended), **forward the incoming cookie header manually**, or use an internal service token.

---

## 7) Auth/redirect wiring

-   Keep your existing `/auth/authorize` handler in Elysia for the protocol logic (PKCE, redirect_uri checks, etc.).
-   When you detect the user should see the wizard, **307 redirect** them to your Next page (e.g. `/auth/wizard?...`).
-   After consent/signup completes, Next calls your existing `/auth/authorize/decision` (or equivalent) API endpoints to issue codes/tokens and then redirects back to `redirect_uri`.

---

## 8) Security & headers

-   **CSP**:
    `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<generated>'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none';`

    -   Generate a nonce per request and inject into Next `<Script nonce={...}>` or use Next’s built-in nonce support.

-   **Vary** pages that depend on cookies: `Vary: Cookie`.
-   **CSRF**: Keep `state` + PKCE. For non-OAuth POSTs, add an anti-CSRF token in forms or rely on `SameSite=Lax` + token.
-   **Strict `redirect_uri` validation** stays exactly as you already do.

---

## 9) Local dev that mimics prod

**Avoid port/origin mismatches.** Two easy patterns:

1. **Single origin via Elysia in dev**

    - Run Elysia on `https://api.local.vibeapp.dev` (mkcert)
    - Proxy Next dev (`next dev -p 4000`) from Elysia at `/auth/*`.

2. **nip.io trick**
   Use `https://api.127.0.0.1.nip.io` as your single dev origin. Same reverse-proxy idea.

Do **not** open Next’s port directly in your browser when testing auth.

---

## 10) Deployment checklist

-   [ ] Public DNS points to Elysia only (`api.vibeapp.dev`).
-   [ ] Elysia proxies `/auth/*` to Next internal port.
-   [ ] `vibe_session` cookie: `Path=/`, correct `Domain`, `Secure`, `HttpOnly`, and proper `SameSite`.
-   [ ] Next `basePath: '/auth'` (or equivalent path rewrites in proxy).
-   [ ] `Host` / `X-Forwarded-Host` and `X-Forwarded-Proto` forwarded.
-   [ ] CSP, `Vary: Cookie`, and cache disabled for user-specific pages.
-   [ ] Relative API calls (or manually forwarded cookies if not).
-   [ ] Automated tests for: login redirect, consent, silent login (iframe/popup), logout.

---

## 11) Migration plan (from HTML-in-Elysia to Next)

1. **Stand up Next** with the `/auth` basePath and one page (`/auth/wizard`) that SSRs with your current data.
2. **Keep all OAuth core logic in Elysia**; expose JSON endpoints Next consumes.
3. **Redirect** from `/auth/authorize` (Elysia) to `/auth/wizard` (Next) when the immersive flow is needed.
4. **Move screens incrementally**: signup → profile → consent → MFA.
5. **Delete/fallback**: retire old inline HTML routes once parity is reached.

---

## 12) Common “why isn’t my cookie here?” pitfalls

-   Hitting `http://localhost:4000` directly (different origin) → cookie won’t be sent.
-   Setting different `Path` / `Domain` from Next and Elysia → browser stores **two** cookies with the same name.
-   `SameSite=Lax` but trying to read the cookie inside a **third‑party iframe** → use `SameSite=None; Secure`.
-   Proxy not forwarding `Host` / `X-Forwarded-*` → Next thinks it’s on `127.0.0.1:4000` and generates bad absolute URLs/cookies.

---

**That’s it.** Implement the proxy, keep one public origin, align cookie attributes, and you’ll retain the “served-from-API” simplicity while gaining full Next.js power. If you want, share your current cookie setter + intended Elysia proxy code and I’ll sanity-check it line by line.
