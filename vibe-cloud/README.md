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
-   **DID-Based Identity (Ed25519):**
    -   User identity is fundamentally based on **Ed25519 key pairs**. Users (or their Agents) manage these keys securely.
    -   A user's primary identifier is a `did:vibe:` Decentralized Identifier (DID), cryptographically derived from their Ed25519 public key.
    -   The derivation follows the pattern: `did:vibe:<multibase(base58btc, 0xed01 + raw_public_key)>`, resulting in DIDs like `did:vibe:z...`. (Uses `0xed01` multicodec for Ed25519 public keys and `base58btc` multibase encoding).
    -   Possession of the corresponding Ed25519 private key allows the user (or their Agent) to prove control over the DID, typically by signing messages or challenges.
    -   Includes an admin claim flow for initial setup, requiring a signature generated with the admin's Ed25519 private key.
-   **Permission Management:**
    -   Stores user consent for applications (`appGrants`).
    -   Stores user's direct permissions for accessing shared resources (`directPermissions`).

# Architecture: Vibe Cloud & Vibe Agent

Vibe Cloud is designed to work in tandem with a **Vibe Agent**:

1.  **User Authentication:** The User authenticates directly with the Vibe Agent. This initial authentication typically involves proving control over their DID, for example, by **signing a challenge with the Ed25519 private key** associated with their DID. Upon successful authentication, the Agent obtains a short-lived JWT representing the user's session (`userDid`) from Vibe Cloud or an associated auth service.
2.  **Application Authorization:** Third-party applications request permissions (scopes) from the user via the Vibe Agent. The Agent handles the user consent flow.
3.  **Permission Storage:** The user's decisions (which apps get which permissions) are stored securely within Vibe Cloud associated with the user's DID. This ensures consistency across multiple Agent instances (devices).
4.  **Request Proxying:** The Vibe Agent acts as a trusted proxy. When an application makes a request:
    -   The Agent verifies the application's identity (e.g., via registered URL origin or potentially a DID signature challenge).
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

    User->>+Agent: Authenticate (e.g., Sign challenge with Ed25519 key)
    Agent->>+Cloud: (If needed) Request User JWT based on verified DID
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

Vibe Cloud uses a layered approach built upon cryptographic identity:

1.  **Cryptographic Foundation (Ed25519 & DIDs):**

    -   **Keys:** Users possess Ed25519 key pairs. The private key MUST be kept secret and is used for signing. The public key is used for verification and deriving the DID.
    -   **DID:** The `did:vibe:z...` identifier is derived from the public key (see Core Functionality). It acts as the user's persistent, self-sovereign identifier.
    -   **Proof of Control:** Actions requiring proof of identity (like initial Agent login or the admin claim) involve the user signing specific data with their private key. Vibe Cloud (or the Agent) can then verify this signature against the public key associated with the user's DID.

2.  **User Authentication (JWT):**

    -   **Method:** Bearer Token authentication via the `Authorization` header for most API calls.
    -   **Token Source:** Typically obtained by the Vibe Agent _after_ successful user authentication (which involves the user proving control over their DID, often via a signature with their Ed25519 private key).
    -   **Payload:** Contains the user's `userDid` (validated against `JWTPayloadSchema`).
    -   **Purpose:** Establishes the authenticated user context for subsequent requests during a session.

3.  **Application Identification:**

    -   **Method:** Custom `X-Vibe-App-ID` HTTP header sent by the Vibe Agent.
    -   **Value:** The verified identifier of the application making the request (can be a canonical URL or potentially a DID). The _Agent_ is responsible for verifying the app's identity before sending this header.
    -   **Purpose:** Identifies which application is acting on the user's behalf.

4.  **Authorization Logic:**

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
    -   **Admin Claim (`/api/v1/admin/claim`):**
        -   This endpoint is unauthenticated (no JWT required).
        -   Authorization relies on verifying an **Ed25519 signature**. The request must include the user's DID, a valid claim code, and a signature.
        -   Vibe Cloud extracts the public key from the provided DID, encodes the claim code, and verifies the provided signature against the public key using `Ed25519.verify`.

5.  **Permission Storage (`permissions` collection in `SYSTEM_DB`):**
    -   `appGrants`: An object mapping `appId` (URL or DID) to an array of granted permission strings (scopes) for that app by that user.
    -   `directPermissions`: An array of permission strings granted directly to the user for accessing shared resources (e.g., `read:blobs`, `write:blobs`).

## API Endpoints Summary

-   **`/health` (GET):** Public endpoint to check service status.
-   **`/api/v1/admin/claim` (POST):** Unauthenticated endpoint for initial admin user creation. Requires the admin's DID (`did:vibe:...`), a valid `claimCode`, and a base64-encoded Ed25519 `signature` of the `claimCode` generated using the private key corresponding to the provided DID.
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
-   Authentication: JWT (via `@elysiajs/jwt` and `jose`), Ed25519 Signatures
-   Identity: Decentralized Identifiers (DIDs), Ed25519 Keys (via `@noble/ed25519`), Multibase/Multicodec (via `multibase`, `varint`)

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
-   Run tests: `bun run test`
-   Run specific tests: `bun run test <test_file_pattern>` (e.g., `bun run test auth`)
