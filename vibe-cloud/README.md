# Vibe Cloud: Your Sovereign Digital Hub

Vibe Cloud is the foundational infrastructure component of the Vibe ecosystem, designed to provide users with a **persistent, secure, and personally controlled digital hub**. It serves as the primary anchor for a user's Vibe identities and data, offering reliable storage, synchronization, and availability.

It shifts control and data ownership to individual users, moving away from traditional centralized silos.

## What is Vibe Cloud?

Vibe Cloud is a personal server node software package that acts as the primary backend for a user's Vibe experience. It is:

-   **User-Controlled:** Users maintain ultimate authority over their Vibe Cloud instance(s) and data, managed via client-side keys (e.g., in the Vibe Agent).
-   **Persistent:** Provides an always-available presence for identities and data, enabling asynchronous communication, backups, and multi-device sync.
-   **Secure:** Built with security and privacy at its core. It utilizes encryption for data at rest (via CouchDB) and relies on standard practices like HTTPS (handled by a reverse proxy) for data in transit.
-   **Interoperable:** Serves as the central point for data access and permission management for Vibe-compatible applications via the Vibe SDK.

## Key Features & Capabilities (Vibe Cloud Software)

Based on the project specifications and current implementation (`vibe-cloud-api`):

-   **Identity Association & Management:**

    -   Securely links to and manages data for specific user identities.
    -   The `AuthService` in `vibe-cloud-api/src/services/auth.service.ts` handles aspects like admin user creation and checks.
    -   The `AuthService` in `vibe-cloud-control-plane/src/services/auth.service.ts` handle higher-level identity registration and authentication.

-   **Encrypted Data Storage (CouchDB):**

    -   Provides reliable, document-oriented storage for user profile data, application data (notes, contacts, posts, etc.).
    -   Leverages CouchDB's built-in encryption-at-rest capabilities and access control.
    -   The `DataService` (`vibe-cloud-api/src/services/data.service.ts`) provides comprehensive CRUD operations and database interaction logic.
    -   Data models and schemas (e.g., `UserSchema`, `AppSchema`, `GenericDataDocumentSchema`) are defined in `vibe-cloud-api/src/models/models.ts`.

-   **Blob Storage Integration (Minio/S3):**

    -   Manages storage and retrieval of larger binary files (images, videos, documents) via an S3-compatible interface.
    -   The `BlobService` (`vibe-cloud-api/src/services/blob.service.ts`) handles object uploads, presigned URLs, and deletions.
    -   Metadata is stored in CouchDB (see `BlobMetadataSchema`).

-   **Cross-Device Synchronization (via CouchDB):**

    -   Leverages CouchDB's replication protocol to ensure data consistency across multiple user devices connected to the same Vibe Cloud instance. This is facilitated by the `DataService`.

-   **API for Vibe SDK:**

    -   Exposes a secure WebSocket and HTTP API for the Vibe SDK.
    -   Allows authorized applications (with user consent managed client-side via Vibe Agent) to read/write data and subscribe to real-time updates.
    -   The `RealtimeService` (`vibe-cloud-api/src/services/realtime.service.ts`) manages WebSocket connections and pushes CouchDB changes.
    -   HTTP API endpoints are defined in `vibe-cloud-api/src/index.ts` (using ElysiaJS).

-   **Permission Metadata Storage & Enforcement:**

    -   Stores application permission grants decided upon by the user (via Vibe Agent).
    -   The `AppSchema` in `models.ts` includes `grants` given by a user to an app.
    -   The `PermissionService` (`vibe-cloud-api/src/services/permission.service.ts`) helps enforce these data access rules on the backend.

-   **Configuration:** Designed for easy configuration via environment variables for deployment.

## Deployment & IP Privacy

Vibe Cloud is designed for flexible deployment:

-   **Self-Hosting:** Users can run their own Vibe Cloud instance.
    -   **Crucially, self-hosters must deploy Vibe Cloud behind a reverse proxy (e.g., Nginx, Caddy, Traefik).** This handles HTTPS/TLS and masks the instance's direct IP address.
    -   Dynamic DNS (DDNS) is recommended for home connections with dynamic IPs.
    -   The `vibe-cloud-selfhost/` directory provides `docker-compose.yml` for easier self-hosting setup.
-   **Trusted Providers:** Users can use instances hosted by Vibe or third parties. These providers manage infrastructure, including reverse proxies.

## Backend Structure Overview

The Vibe Cloud backend is structured as a multi-service application:

-   **`vibe-cloud-api`**: This is the data plane service. Each instance of Vibe Cloud (for a user or organization) will run this service. It handles user data, application logic, blob storage interactions, and real-time communication.
-   **`vibe-cloud-control-plane`**: This service manages the provisioning of new Vibe Cloud instances, handles administrative tasks like initial admin claims, and is intended to host the identity registry.
-   **`vibe-cloud-infra`**: This directory contains all infrastructure-as-code (IaC) definitions, including:
    -   `terraform/`: Terraform configurations for managing Scaleway Kapsule clusters and related cloud resources.
    -   `helm/`: Helm charts for deploying services (e.g., `vibe-cloud-instance`).
    -   `provisioning/`: Scripts used by the control plane to automate instance provisioning.
    -   `kubernetes/`: Raw Kubernetes manifest files.
-   **`vibe-cloud-selfhost`**: Configurations and documentation for self-hosting Vibe Cloud (e.g., `docker-compose.yml`).

## Local Development

To run the Vibe Cloud services locally for development:

1.  Ensure you have Docker and Docker Compose installed.
2.  Copy the example environment file for the API service: `cp vibe-cloud/vibe-cloud-api/.env.example vibe-cloud/vibe-cloud-api/.env`
3.  (Optional) Create an environment file for the control plane if needed: `cp vibe-cloud/vibe-cloud-control-plane/.env.example vibe-cloud/vibe-cloud-control-plane/.env` (assuming an example exists or create one).
4.  Update the `.env` file(s) with your desired settings (e.g., CouchDB credentials, JWT secret, Minio credentials).
5.  From the root of the `vibe` project, run:

    ```bash
    docker-compose -f vibe-cloud/vibe-cloud-selfhost/docker-compose.yml up --build
    ```

    (Note: The original README pointed to a root docker-compose.yml, but `vibe-cloud-selfhost/docker-compose.yml` seems more appropriate for a standalone Vibe Cloud dev setup. Adjust if a root compose file orchestrates more.)

    This will build the Docker images for `vibe-cloud-api` (and potentially `vibe-cloud-control-plane` if included in the compose file) and start them along with CouchDB and Minio services.

-   The API service will typically be available at `http://localhost:3000` (or the port specified by `APP_PORT`).
-   The Control Plane service (if run) will typically be available at `http://localhost:3001` (or the port specified by `CONTROL_PLANE_PORT`).

## Tech Stack Summary

| Category         | Technology                                   | Role                                        |
| :--------------- | :------------------------------------------- | :------------------------------------------ |
| Runtime          | **Bun**                                      | Executes server-side JS/TS.                 |
| Web Framework    | **ElysiaJS**                                 | Handles HTTP/WebSocket routing, middleware. |
| Database         | **Apache CouchDB**                           | Primary document store; handles sync.       |
| Blob Storage     | **Minio** / S3-compatible                    | Stores larger binary files.                 |
| Real-time        | **WebSockets** (via ElysiaJS + CouchDB Feed) | Pushes real-time data updates.              |
| Containerization | **Docker**                                   | Packages Vibe Cloud for deployment.         |
| Reverse Proxy    | Nginx, Caddy, etc. (User/Provider deployed)  | Handles HTTPS, hides IP. **Essential.**     |

## Further Documentation

-   See the `README.md` file within each subdirectory (`vibe-cloud-api/`, `vibe-cloud-control-plane/`, `vibe-cloud-infra/`) for more specific details about each component.
