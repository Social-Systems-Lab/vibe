# Vibe: Your Everything

Vibe is a movement and a technology platform dedicated to empowering individuals by reclaiming control over their digital lives, identities, data, and connections from centralized entities. It aims to provide foundational tools for secure communication, self-sovereign identity, decentralized commerce, and civic participation.

Inspired by the need for greater digital autonomy and equitable access, Vibe is building an ecosystem that fosters dignity, self-determination, and collective upliftment.

## Core Components

The Vibe ecosystem currently comprises two primary components, actively in prototyping:

1.  **Vibe Agent:**

    -   A browser extension (currently targeting Chrome with Manifest V3) that acts as a secure identity vault, permission mediator, and request proxy.
    -   Manages user-controlled Ed25519 key pairs for multiple digital identities (`did:vibe:`).
    -   Facilitates DID-based authentication to Vibe Cloud.
    -   Provides a user interface for managing identities, granting consent to Vibe-enabled applications, and viewing/managing permissions.
    -   Injects a `window.vibe` API for web applications to interact with the Vibe ecosystem.

2.  **Vibe Cloud:**
    -   A personal server node software package that acts as a user's sovereign digital hub.
    -   Provides persistent, secure, and user-controlled storage for identity-related data, application data, and files.
    -   Utilizes CouchDB for document storage and synchronization, and an S3-compatible interface (like Minio) for blob storage.
    -   Exposes a secure WebSocket and HTTP API for the Vibe SDK, enabling applications to interact with user data based on client-side managed permissions.
    -   Designed for flexible deployment, including self-hosting (behind a reverse proxy for IP privacy and HTTPS) or via trusted providers.

## Vision & Principles

Vibe is guided by the following core principles:

-   **Empowerment Through Ownership:** User control over identity and data.
-   **Resilience & Decentralization:** Distributing control and data ownership.
-   **Accessibility & Inclusion:** Lowering barriers to entry.
-   **Transparency & Trust:** Leveraging cryptography and open protocols.
-   **Community & Connection:** Fostering direct connections and collective action.

## Current Status

Vibe is actively prototyping its core components. This repository contains the source code for:

-   `vibe-agent/`: The Vibe Agent browser extension.
-   `vibe-cloud/`: The Vibe Cloud backend, including the API for individual instances (`vibe-cloud-api`), the control plane for instance management (`vibe-cloud-control-plane`), infrastructure definitions (`vibe-cloud-infra`), and self-hosting configurations (`vibe-cloud-selfhost`).
-   `vibe-sdk/`: Vibe SDK for interfacing with the Vibe Agent.
-   `vibe-react/`: React hooks and components for interfacing with the Vibe Agent.
-   `apps/`: Example and test applications built using the Vibe SDK (e.g., `apps/test`).

## Getting Started

Please refer to the `README.md` files within the `vibe-agent` and `vibe-cloud` directories for specific setup and development instructions for each component.
