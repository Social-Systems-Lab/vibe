# Proposed New Auth Flow for Vibe

This document outlines a proposed shift from the current **cookie + iframe** approach to a more standard **OAuth 2.0 / OIDC token-based** flow, while still supporting silent login via `hub.html`.

---

## Current Flow (Summary)

-   `vibe-cloud-ui` is served from the same domain as `vibe-cloud-api` to ensure cookies are attached.
-   `hub.html` is used in a hidden iframe by `vibe-sdk` to check if a session cookie exists.
-   Third-party apps rely on this cookie check to determine if the user is logged in.
-   This works, but is clunky and tightly couples UI and API domains.

---

## Proposed Flow (Token-Based)

### 1. Login

1. User visits an app (first-party or third-party).
2. App redirects to `vibe-cloud-api` (Auth Server) for login.
3. User authenticates (password, WebAuthn, etc.).
4. Auth Server issues:
    - **Access Token** (short-lived, e.g., 15 minutes)
    - **Refresh Token** (long-lived, stored securely, e.g., in HttpOnly cookie or secure storage)

### 2. API Access

-   Apps call `vibe-cloud-api` with the **Access Token** in the `Authorization: Bearer` header.
-   The API validates the token and enforces ACLs.

### 3. Silent Login (hub.html)

-   `hub.html` remains, but its role changes:
    -   Instead of checking cookies, it checks if a valid **Refresh Token** exists.
    -   If yes, it silently exchanges it for a new Access Token.
    -   If no, it reports that the user is logged out.
-   `vibe-sdk` uses a hidden iframe to call `hub.html` and refresh tokens without user interaction.

### 4. Logout

-   Apps call `logout()` via `vibe-sdk`.
-   Refresh Token is revoked at the Auth Server.
-   Access Tokens naturally expire.

---

## Benefits

-   **Standards-based**: Aligns with OAuth 2.0 / OIDC best practices.
-   **Cleaner separation**: No need to serve UI from the API domain.
-   **Scalable**: Works well for third-party apps without cookie hacks.
-   **Secure**: Short-lived access tokens reduce risk; refresh tokens can be revoked.
-   **Familiar**: Developers integrating with Vibe will recognize the flow.

---

## SDK Integration

-   `vibe-sdk` abstracts all of this:
    -   `login()` → Redirects to Auth Server.
    -   `read()`, `write()` → Automatically attach Access Token.
    -   `subscribe()` → Uses SignalR with token-based auth.
    -   Silent refresh handled automatically via `hub.html`.

---

## Migration Path

1. Keep cookie-based sessions for now (backward compatibility).
2. Add token issuance endpoints to `vibe-cloud-api`.
3. Update `vibe-sdk` to support token-based auth.
4. Gradually migrate apps to use tokens instead of cookies.

---

## Diagram

```
+-------------+        +----------------+        +----------------+
|   App (UI)  | <----> | vibe-sdk       | <----> | vibe-cloud-api |
+-------------+        +----------------+        +----------------+
       |                        |                          |
       |  Redirect to login     |                          |
       |----------------------->|                          |
       |                        |                          |
       |   Access + Refresh     |                          |
       |<-----------------------|                          |
       |                        |                          |
       |   API calls w/ token   |------------------------->|
       |                        |                          |
       |   Silent refresh via hub.html (iframe)            |
```

---
