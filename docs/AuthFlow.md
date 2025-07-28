# Vibe Authentication Flow Analysis

## Authorization Code Flow with PKCE

The following diagram illustrates the "default" authentication flow, which is intended to follow the Authorization Code Flow with PKCE standard.

```mermaid
sequenceDiagram
    participant User
    participant FeedsApp as vibe-feeds (Client)
    participant CloudAPI as vibe-cloud-api (Auth Server)

    User->>+FeedsApp: Initiates action requiring login
    FeedsApp->>FeedsApp: Generates PKCE code_verifier and code_challenge
    FeedsApp->>FeedsApp: Generates and stores 'state' parameter
    FeedsApp->>+CloudAPI: Redirects user to /auth/authorize with client_id, redirect_uri, scope, state, code_challenge
    CloudAPI->>CloudAPI: Verifies client_id
    CloudAPI->>CloudAPI: Redirects user to login/consent UI
    User->>+CloudAPI: Enters credentials
    CloudAPI->>CloudAPI: Authenticates user
    CloudAPI->>CloudAPI: Generates and stores authorization code linked to user, client_id, and code_challenge
    CloudAPI->>-FeedsApp: Redirects user back to redirect_uri with authorization 'code' and 'state'
    FeedsApp->>FeedsApp: Verifies 'state' parameter
    FeedsApp->>+CloudAPI: Sends POST request to /auth/token with grant_type, code, code_verifier, client_id, redirect_uri
    CloudAPI->>CloudAPI: Verifies authorization code, code_verifier, client_id, and redirect_uri
    CloudAPI->>-FeedsApp: Returns access_token and token_type
    FeedsApp->>FeedsApp: Stores access_token
    FeedsApp->>User: User is now logged in
```

## Analysis

Based on my review of the code and the diagram, the current implementation appears to correctly follow the Authorization Code Flow with PKCE. The key steps are all present:

-   **PKCE:** The client generates a `code_verifier` and `code_challenge`, which are used to secure the token exchange.
-   **State:** The `state` parameter is used to prevent Cross-Site Request Forgery (CSRF) attacks.
-   **Token Exchange:** The client exchanges the authorization code for an access token by making a POST request to the `/auth/token` endpoint.

However, the persistent "400 Bad Request" and CORS errors indicate a fundamental problem in the implementation of the `/auth/token` endpoint on the `vibe-cloud-api` server. My previous attempts to fix this by adjusting the CORS headers and error handling have failed, which suggests that the issue lies deeper.

I will now re-examine the code with this diagram in mind to identify the root cause of the problem.
