# Vibe SDK

The Vibe SDK is a client-side library for interacting with the Vibe platform. It provides a programmatic interface for authentication, data storage, and real-time data synchronization.

## Core Features

-   **Authentication:** Implements the OAuth 2.0 Authorization Code Flow with PKCE for secure user authentication.
-   **Session Management:** Handles user sessions, including seamless sign-on (silent & one-tap login) and logout.
-   **Consent Management:** Provides methods for applications to request and manage user consent for data access.
-   **Data Access:** Offers APIs for reading, writing, and subscribing to document types (type) in the user's personal Vibe Cloud.

## How it Fits into the Vibe Ecosystem

The `vibe-sdk` is the primary interface for client applications to communicate with the `vibe-cloud-api`. It abstracts the low-level details of the Vibe protocol, providing a clear and secure API for developers.
