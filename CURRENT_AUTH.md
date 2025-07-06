# Vibe Authentication System

This document provides an overview of the authentication system used in the Vibe project, detailing the flow of credentials and the key components involved.

## Core Components

-   **`vibe-sdk` (Client-side):** The SDK, specifically the `StandaloneStrategy`, manages the user's authentication state, including access and refresh tokens.
-   **`vibe-cloud-api` (Server-side):** The API handles user registration, login, token refreshing, and all data operations.
-   **`vibe-web` (Client-side):** The web application provides the UI for login and signup, communicating with the `vibe-sdk` to manage the authentication process.

## Authentication Flow

The authentication process is based on a standard JWT (JSON Web Token) and refresh token pattern.

### 1. User Registration (`signup`)

1.  **Initiation:** The user initiates the signup process through the `vibe-web` UI, which calls the `sdk.signup()` method.
2.  **Popup Window:** The `StandaloneStrategy` opens a popup window to the `/auth/signup` page in `vibe-web`.
3.  **API Request:** The `vibe-web` app sends a `POST` request to the `/auth/signup` endpoint on the `vibe-cloud-api` with the user's email and password.
4.  **User & Database Creation:** The `IdentityService` in the API:
    -   Generates a new key pair and a unique DID (Decentralized Identifier) for the user.
    -   Creates a unique `instanceId` from the DID.
    -   Provisions a new, user-specific CouchDB database named after the `instanceId`.
    -   Creates a new CouchDB user with credentials to access this database.
    -   Grants the main admin user access to the new database.
    -   Encrypts the new database credentials and stores them in the main `users` database.
5.  **Token Generation:** The API generates a short-lived JWT (access token) and a long-lived refresh token.
6.  **Response:** The API returns the access and refresh tokens to the `vibe-web` app.
7.  **Token Storage:** The `vibe-web` app sends the tokens to the `vibe-sdk` via a `postMessage` event. The `StandaloneStrategy` stores the refresh token in local storage and the access token in memory.

### 2. User Login (`login`)

The login process follows a similar flow to signup, but instead of creating a new user, the `IdentityService` verifies the user's credentials and returns a new set of tokens.

### 3. Token Refresh

1.  **Automatic Refresh:** When the `vibe-sdk` makes an API request with an expired access token, the `vibe-cloud-api` will return a `401 Unauthorized` error.
2.  **Refresh Request:** The `StandaloneStrategy` catches this error and automatically sends a `POST` request to the `/auth/refresh` endpoint with the stored refresh token.
3.  **New Tokens:** The API validates the refresh token and, if valid, returns a new access token and a new refresh token.
4.  **Retry Request:** The `StandaloneStrategy` updates its stored tokens and automatically retries the original API request with the new access token.

### 4. Authenticated Requests

All requests to protected API endpoints (e.g., `/data/*`) must include the access token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The `vibe-cloud-api` verifies the token on every request to ensure the user is authenticated and has the necessary permissions to access the requested resources.
