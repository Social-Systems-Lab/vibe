# Vibe Authentication System

This document outlines the current state of the Vibe authentication system, which is designed to be secure, user-friendly, and simple to integrate.

## Guiding Principles

The system is built on the principles of **OAuth 2.0** and **OpenID Connect**, using the **Authorization Code Flow with PKCE**. This is the industry standard for securing web applications.

-   **Simplicity First:** The implementation favors simple, direct code over complex abstractions.
-   **Control and Transparency:** The entire authentication flow is owned and understood, with no "black boxes."
-   **Security:** The system is built with a security-first mindset, incorporating modern best practices to prevent common vulnerabilities.

## Core Components

The authentication system is composed of three main packages:

1.  **`vibe-cloud-api`**: The central authentication server. It manages user identities, sessions, and consents. It exposes a secure API for the client-side SDK to interact with.
2.  **`vibe-sdk`**: A client-side library that handles all the complexities of the authentication flow. It provides a simple API for applications to integrate with the Vibe authentication system.
3.  **`vibe-react`**: A set of React components and hooks that make it easy to integrate the Vibe SDK into a React application. It provides UI components like the `AuthWidget` and `OneTapChip`.

## Authentication Flows

### 1. Login & Signup

-   When a new user arrives, they are presented with "Log in" and "Sign up" buttons.
-   Clicking either button opens a secure popup window to the `vibe-cloud-api` server.
-   The user enters their credentials in the popup, and upon successful authentication, they are redirected back to the application, now logged in.

### 2. Seamless Sign-In (Silent & One-Tap)

-   When a returning user visits an application, the Vibe SDK automatically checks for an active session in the background using a hidden `iframe`.
-   **Silent Login:** If the user has previously logged in and granted consent to the application, they are logged in automatically without any user interaction.
-   **One-Tap Login:** If the user has an active session but has not yet granted consent to the application, a "Continue as..." one-tap chip appears. Clicking this chip takes them through the consent flow.

### 3. Logout

-   When a user clicks "Log out," they are redirected to a central logout endpoint on the `vibe-cloud-api` server.
-   This ensures the session cookie is cleared correctly in a same-origin context, and then the user is redirected back to the application.

### 4. Consent Management

-   Logged-in users have a "Manage Consent" button available in their profile menu.
-   Clicking this button opens the consent screen, where they can review the permissions they have granted to the application.
-   If a user clicks "Deny," their consent is revoked on the server, and they are immediately logged out of that specific application.

## Security Model

The system's security is built on two core pillars of the OAuth 2.0 standard:

1.  **Strict `redirect_uri` Validation:**

    -   The `client_id` for each application is its **origin** (e.g., `https://test-app.com`).
    -   The authentication server strictly enforces that the `redirect_uri` provided in any request belongs to the origin of the `client_id`.
    -   This prevents malicious applications from impersonating legitimate ones and intercepting authorization codes.

2.  **PKCE (Proof Key for Code Exchange):**
    -   For every login attempt, the SDK generates a secret `code_verifier` and a hashed `code_challenge`.
    -   The `code_challenge` is sent to the server with the initial request.
    -   To exchange the authorization code for an access token, the SDK must provide the original `code_verifier`.
    -   This ensures that even if an authorization code is intercepted, it cannot be used without the original secret.
