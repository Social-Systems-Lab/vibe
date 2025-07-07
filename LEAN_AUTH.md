# Lean Authentication Protocol (LEAN_AUTH) - v2

## Guiding Principles

1.  **Simplicity First:** We will implement the absolute minimum required to achieve our goals. We will favor simple, direct code over complex abstractions or rigid adherence to protocols for their own sake.
2.  **Just-In-Time Implementation:** Features will be added only when they are strictly necessary to unblock the next step in our development.
3.  **Control and Transparency:** We will own the entire authentication flow, ensuring we have full control and understanding of the system. There will be no "black boxes".
4.  **Future-Proofing:** The architecture must be flexible enough to support future requirements like federation without a radical redesign.

## Core Goal: Enable Secure, User-Friendly Third-Party Authentication

The primary objective is to allow a third-party application (`test-app`) to authenticate a user and receive an access token. The flow must be secure, support a "Single Sign-On" experience, and include explicit user consent.

## Key Architectural Components

### 1. Session Management & SSO

The authentication server (`vibe-cloud-api`) will manage a persistent user session using a secure, `httpOnly` cookie. Once a user logs in, this session will be used to authenticate them for subsequent authorization requests from other applications, creating a seamless SSO experience.

### 2. The Authorization Flow (Authorization Code + PKCE)

#### Step A: The Authorization Request

-   The `test-app` will redirect the user to an `/authorize` endpoint on the `vibe-cloud-api`.
-   **Query Parameters:**
    -   `client_id`: The URL of the requesting application (e.g., `http://localhost:3001`).
    -   `redirect_uri`: The URL to redirect back to after authentication.
    -   `state`: An opaque value used to prevent CSRF attacks.
    -   `scope`: A space-delimited list of permissions the app is requesting (e.g., `profile posts:read`).
    -   `code_challenge`: The PKCE code challenge.
    -   `code_challenge_method`: Always `S256`.

#### Step B: Authentication & Consent

-   The `/authorize` endpoint checks for an active session cookie.
    -   **If no session exists:** It renders a login/signup UI. Upon successful login, the flow continues.
    -   **If a session exists:** The user is already authenticated.
-   The server then displays a **Consent Screen**, showing the user which application is requesting access and which permissions (`scopes`) it wants.
-   If the user approves, the server stores the `code_challenge`, user ID, and granted scopes, associated with a newly generated, single-use `authorization_code`.
-   It then redirects the user back to the `redirect_uri` with the `authorization_code` and the original `state`.

#### Step C: The Token Exchange

-   The `test-app`'s callback endpoint will receive the `authorization_code`.
-   It will then make a `POST` request to a `/token` endpoint on the `vibe-cloud-api`.
-   **POST Body:**
    -   `grant_type`: Always `authorization_code`.
    -   `code`: The authorization code received.
    -   `redirect_uri`: Must match the original redirect URI.
    -   `code_verifier`: The PKCE code verifier.
-   The `/token` endpoint will:
    1.  Verify the `authorization_code`.
    2.  Verify the `code_verifier` against the stored `code_challenge`.
    3.  If valid, generate a stateless JWT access token containing the user ID and granted scopes.
    4.  Return the access token to the `test-app`.

### 3. Federation & Self-Hosting (Future Considerations)

The authentication flow is designed to be portable. The `vibe-sdk` will be built to accept an optional `server_url` parameter. This allows an application to direct its authentication requests to any Vibe Cloud instance, including a user's self-hosted server. While a central discovery service may be built in the future, this parameter provides a simple and robust fallback, ensuring the architecture supports federation from day one.
