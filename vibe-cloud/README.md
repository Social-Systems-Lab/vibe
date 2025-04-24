# Vibe Cloud

Vibe Cloud is the foundational personal server node for the Vibe ecosystem. The primary goal of Vibe Cloud is to provide users with a secure, persistent, and self-sovereign digital hub for their identity, data (structured documents and binary blobs), and application interactions. It serves as the cloud counterpart for user data, primarily intended to be accessed via a trusted **Vibe Agent** (e.g., browser extension, mobile application) acting on behalf of the user and authorized third-party applications.

# Getting Started

Install dependencies:

```bash
bun install
```

Run:

```bash
bun start
```

# Core Functionality

-   **User-Specific Data Storage:** Each authenticated user (`userDid`) gets their own dedicated CouchDB database (`userdata-<sanitized_userDid>`) ensuring strong data isolation by default.
-   **Shared Blob Storage:** Provides MinIO (or S3-compatible) object storage for binary data (images, files, etc.) in a shared bucket, with access controlled via metadata and permissions.
-   **Real-time Synchronization:** Leverages WebSockets to push data changes from a user's database to connected Vibe Agents subscribing on behalf of applications.
-   **DID-Based Identity:** User identity is primarily based on Decentralized Identifiers (DIDs). Includes an admin claim flow for initial administrative user setup using DIDs and signed messages.
-   **Permission Management:**
    -   Stores user consent for applications (`appGrants`).
    -   Stores user's direct permissions for accessing shared resources (`directPermissions`).

# Architecture: Vibe Cloud & Vibe Agent

Vibe Cloud is designed to work in tandem with a **Vibe Agent**:

1.  **User Authentication:** The User authenticates directly with the Vibe Agent (e.g., using wallet signatures, claim codes). The Agent obtains a short-lived JWT representing the user's session (`userDid`).
2.  **Application Authorization:** Third-party applications request permissions (scopes) from the user via the Vibe Agent. The Agent handles the user consent flow.
3.  **Permission Storage:** The user's decisions (which apps get which permissions) are stored securely within Vibe Cloud associated with the user's DID. This ensures consistency across multiple Agent instances (devices).
4.  **Request Proxying:** The Vibe Agent acts as a trusted proxy. When an application makes a request:
    -   The Agent verifies the application's identity (e.g., via registered URL origin or DID signature challenge).
    -   The Agent checks _locally_ (potentially using cached permissions synced from Vibe Cloud) if the application has the necessary grant from the user for the requested action.
    -   If authorized locally, the Agent forwards the request to the Vibe Cloud API.
5.  **Vibe Cloud Enforcement:** Vibe Cloud receives the request from the Agent, containing:
    -   The User's JWT (`Authorization: Bearer <token>`).
    -   The calling Application's ID (`X-Vibe-App-ID: <appId>`).
    -   Vibe Cloud verifies the User JWT.
    -   Vibe Cloud performs the **definitive permission check** against the permissions stored in its database (`PermissionService`) before executing the request. This provides defense-in-depth.

```mermaid
sequenceDiagram
    participant App as Third-Party App
    participant Agent as Vibe Agent
    participant Cloud as Vibe Cloud API
    participant UserDB as User's CouchDB
    participant SystemDB as System CouchDB
    participant BlobStore as Minio/S3

    User->>+Agent: Authenticate (e.g., DID sig)
    Agent->>+Cloud: (If needed) Obtain User JWT
    Cloud-->>-Agent: User JWT (contains userDid)

    App->>+Agent: Request Permission (e.g., read:notes)
    Agent->>User: Prompt for Consent
    User->>Agent: Grant Permission
    Agent->>+Cloud: Store App Grant (userDid grants appId 'read:notes')
    Cloud->>+SystemDB: Save Permission Doc
    SystemDB-->>-Cloud: OK
    Cloud-->>-Agent: Grant Stored OK
    Agent-->>-App: Permission Granted

    App->>+Agent: Request Data (e.g., read 'notes' collection)
    Agent->>Agent: Verify App Identity (URL/DID Sig)
    Agent->>Agent: Check Local/Cached Permissions (Optional)
    Note over Agent: If authorized locally...
    Agent->>+Cloud: Forward Request (Auth: User JWT, X-Vibe-App-ID: appId, Body: {collection: 'notes'})
    Cloud->>Cloud: Verify User JWT (extract userDid)
    Cloud->>Cloud: Verify App ID Header present
    Cloud->>+SystemDB: Fetch Permissions for userDid
    SystemDB-->>-Cloud: Permission Doc (incl. appGrants)
    Cloud->>Cloud: Check if appId has 'read:notes' grant
    Note over Cloud: If permission check passes...
    Cloud->>+UserDB: Query notes collection (db = userdata-<userDid>)
    UserDB-->>-Cloud: Query Results
    Cloud-->>-Agent: Return Data Results
    Agent-->>-App: Return Data Results

    App->>+Agent: Request Blob Upload
    Agent->>Agent: Verify App Identity
    Agent->>+Cloud: Forward Request (Auth: User JWT, X-Vibe-App-ID: appId, File Data)
    Cloud->>Cloud: Verify User JWT
    Cloud->>+SystemDB: Fetch Permissions for userDid
    SystemDB-->>-Cloud: Permission Doc
    Cloud->>Cloud: Check userHasDirectPermission('write:$blobs')
    Note over Cloud: If permission check passes...
    Cloud->>+BlobStore: Upload Blob
    BlobStore-->>-Cloud: Upload OK (Etag, etc.)
    Cloud->>+SystemDB: Create Blob Metadata (ownerDid=userDid)
    SystemDB-->>-Cloud: Metadata OK
    Cloud-->>-Agent: Return Upload Success (objectId)
    Agent-->>-App: Return Upload Success
```

# Authentication & Authorization

Vibe Cloud uses a layered approach:

1.  **User Authentication (JWT):**

    -   **Method:** Bearer Token authentication via the `Authorization` header.
    -   **Token Source:** Obtained by the Vibe Agent after successful user authentication.
    -   **Payload:** Contains the user's `userDid` (validated against `JWTPayloadSchema`).
    -   **Purpose:** Establishes the user context for the request.

2.  **Application Identification:**

    -   **Method:** Custom `X-Vibe-App-ID` HTTP header sent by the Vibe Agent.
    -   **Value:** The verified identifier of the application making the request (can be a canonical URL or a DID). The _Agent_ is responsible for verifying the app's identity before sending this header.
    -   **Purpose:** Identifies which application is acting on the user's behalf.

3.  **Authorization Logic:**

    -   **User Data (`/api/v1/data/read`, `/api/v1/data/write`):**
        -   Requires valid User JWT and `X-Vibe-App-ID` header.
        -   The target database is determined implicitly by the `userDid` in the JWT (`userdata-<sanitized_userDid>`).
        -   Permission Check: Vibe Cloud verifies that the user (`userDid`) has granted the specific application (`appId`) the required permission (`read:<collection>` or `write:<collection>`) using `PermissionService.canAppActForUser`.
    -   **Blob Data (`/api/v1/blob/upload`, `/api/v1/blob/download`):**
        -   Requires valid User JWT. The `X-Vibe-App-ID` header might be present but isn't the primary factor for blob permissions.
        -   **Upload:** Checks if the _user_ (`userDid`) has the direct permission `write:blobs` using `PermissionService.userHasDirectPermission`.
        -   **Download:** Checks if the _user_ (`userDid`) is the `ownerDid` of the blob OR if the user has the direct permission `read:blobs` using `PermissionService.userHasDirectPermission`.
    -   **WebSocket Subscriptions (`/ws`):**
        -   Connection requires valid User JWT and `appId` query parameter.
        -   `subscribe` messages require Vibe Cloud to verify that the user (`userDid`) has granted the application (`appId` from WS context) the `read:<collection>` permission using `PermissionService.canAppActForUser`.

4.  **Permission Storage (`permissions` collection in `SYSTEM_DB`):**
    -   `appGrants`: An object mapping `appId` (URL or DID) to an array of granted permission strings (scopes) for that app by that user.
    -   `directPermissions`: An array of permission strings granted directly to the user for accessing shared resources (e.g., `read:blobs`, `write:blobs`).

## API Endpoints Summary

-   **`/health` (GET):** Public endpoint to check service status.
-   **`/api/v1/admin/claim` (POST):** Unauthenticated endpoint for initial admin user creation via DID, claim code, and signature.
-   **`/api/v1/data/read` (POST):** Authenticated (User JWT + App ID Header). Reads data from the user's database based on collection and filter. Requires `read:<collection>` grant for the app from the user.
-   **`/api/v1/data/write` (POST):** Authenticated (User JWT + App ID Header). Writes/updates single or multiple documents in the user's database. Requires `write:<collection>` grant for the app from the user.
-   **`/api/v1/blob/upload` (POST):** Authenticated (User JWT). Uploads a file. Requires user to have `write:blobs` direct permission.
-   **`/api/v1/blob/download/:objectId` (GET):** Authenticated (User JWT). Gets a pre-signed URL to download a blob. Requires user to be owner OR have `read:blobs` direct permission.
-   **`/ws`:** WebSocket endpoint for real-time updates. Requires `token` (User JWT) and `appId` query parameters for connection. `subscribe` messages require the app to have `read:<collection>` grant from the user.

## Technology Stack

-   Runtime: Bun
-   Framework: Elysia.js
-   Language: TypeScript
-   Database: CouchDB (via Nano client)
-   Blob Storage: MinIO (or S3-compatible)
-   Authentication: JWT (via `@elysiajs/jwt` and `jose`)
-   Identity: Decentralized Identifiers (DIDs)

## Setup and Running

1.  **Prerequisites:**
    -   Bun installed
    -   Access to running CouchDB instance
    -   Access to running MinIO instance (or S3)
2.  **Clone Repository:** `git clone ...`
3.  **Install Dependencies:** `bun install`
4.  **Environment Variables:**
    -   Copy `.env.example` to `.env`.
    -   Fill in the required variables:
        -   `JWT_SECRET`: A strong, secret string for signing JWTs.
        -   `COUCHDB_URL`: Full URL to your CouchDB instance (e.g., `http://admin:password@localhost:5984`).
        -   `COUCHDB_USER`: CouchDB admin username (if not in URL).
        -   `COUCHDB_PASSWORD`: CouchDB admin password (if not in URL).
        -   `MINIO_ENDPOINT`: Minio server address (e.g., `127.0.0.1`).
        -   `MINIO_PORT`: Minio server port (e.g., `9000`).
        -   `MINIO_ACCESS_KEY`: Minio access key.
        -   `MINIO_SECRET_KEY`: Minio secret key.
        -   `MINIO_USE_SSL`: Set to `true` or `false`.
        -   `MINIO_BUCKET_NAME`: Name of the bucket for shared blobs (e.g., `vibe-storage`).
        -   `ADMIN_CLAIM_CODE`: The initial code used for the `/admin/claim` endpoint.
        -   `PORT`: (Optional) Port for the server to listen on (defaults to 3000).
5.  **Run Development Server:** `bun dev`
6.  **Run Production Build:** `bun build` (if build script exists) then `bun start`

## Running Tests

-   Ensure CouchDB and Minio are running and accessible with credentials configured in `.env`.
-   Run tests: `bun test`
