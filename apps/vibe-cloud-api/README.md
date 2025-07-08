# Vibe Cloud API

The Vibe Cloud API is the central service that powers the Vibe ecosystem. It is responsible for user identity, authentication, and data storage.

## Core Responsibilities

-   **Identity Provider:** The API acts as an OpenID Connect-compliant identity provider, managing user accounts and issuing authentication tokens.
-   **Authentication Server:** It implements the OAuth 2.0 protocol, allowing client applications to securely authenticate users and obtain access to resources.
-   **Data Storage:** The API provides a personal data store for each user, with a simple API for reading, writing, and subscribing to data collections.
-   **Consent Management:** It provides a mechanism for users to grant and revoke application access to their data.

## How it Fits into the Vibe Ecosystem

The `vibe-cloud-api` is the backend for the Vibe platform. It is the single source of truth for user identity and data, and it is the central hub that all client applications connect to via the `vibe-sdk`.
