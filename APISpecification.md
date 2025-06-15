# Vibe Cloud v2: API Specification

This document provides the detailed API specification for the Vibe Cloud v2 multi-tenant architecture. It defines the endpoints, data models, and authentication flows for the new microservices.

## 1. Authentication

Authentication is managed by the `Identity Service`. All protected endpoints across all services require a valid JSON Web Token (JWT) to be passed in the `Authorization` header.

`Authorization: Bearer <jwt>`

### 1.1. JWT Structure

The JWT payload will contain the following claims:

```json
{
    "iss": "vibe-identity-service",
    "sub": "user-id-123", // The user's unique ID
    "iat": 1672531200, // Issued at timestamp
    "exp": 1672534800, // Expiration timestamp (e.g., 1 hour)
    "mnemonic": "word1 word2 ... word24" // The user's decrypted master key
}
```

**Security Note**: The inclusion of the mnemonic in the JWT is a critical design choice. It allows other services to be stateless, as they don't need to re-derive keys. The JWT must be short-lived (e.g., 15-60 minutes) and always transmitted over HTTPS to mitigate risks.

## 2. Identity Service

The Identity Service handles user registration, login, and JWT issuance.

### `POST /register`

Creates a new user account and their dedicated database.

**Request Body:**

```json
{
    "email": "user@example.com",
    "password": "a-very-strong-password"
}
```

**Responses:**

-   **`201 Created`**: Successful registration.
    ```json
    {
        "userId": "user-id-123",
        "email": "user@example.com",
        "did": "did:vibe:z..."
    }
    ```
-   **`400 Bad Request`**: Invalid email or weak password.
-   **`409 Conflict`**: An account with this email already exists.
-   **`500 Internal Server Error`**: Failed to create user database or another server-side error.

### `POST /login`

Authenticates a user and returns a session JWT.

**Request Body:**

```json
{
    "email": "user@example.com",
    "password": "a-very-strong-password"
}
```

**Responses:**

-   **`200 OK`**: Successful login.
    ```json
    {
        "token": "ey...",
        "user": {
            "userId": "user-id-123",
            "email": "user@example.com",
            "did": "did:vibe:z..."
        }
    }
    ```
-   **`401 Unauthorized`**: Invalid email or password.
-   **`500 Internal Server Error`**: Server-side error during login process.

## 3. Groups Service

The Groups Service manages user-defined groups, which are a core component of the v2 permission model. All endpoints are protected and require a valid JWT. The service will operate on the user's dedicated database, as identified by the `sub` claim in the JWT.

### 3.1. Data Model: Group

A group document stored in the user's database.

```json
{
    "_id": "group-friends",
    "name": "Friends",
    "description": "My close friends",
    "members": [
        { "did": "did:vibe:z...", "username": "friend1" },
        { "did": "did:vibe:z...", "username": "friend2" }
    ]
}
```

### `POST /groups`

Creates a new group.

**Request Body:**

```json
{
    "name": "Family",
    "description": "Just the family"
}
```

**Responses:**

-   **`201 Created`**: Returns the newly created group document.
-   **`400 Bad Request`**: Invalid input (e.g., missing name).

### `GET /groups`

Lists all groups for the authenticated user.

**Responses:**

-   **`200 OK`**: Returns an array of group documents.

### `GET /groups/{groupId}`

Retrieves a single group by its ID.

**Responses:**

-   **`200 OK`**: Returns the group document.
-   **`404 Not Found`**: Group does not exist.

### `PUT /groups/{groupId}`

Updates a group's name or description.

**Request Body:**

```json
{
    "name": "Best Friends",
    "description": "My absolute best friends"
}
```

**Responses:**

-   **`200 OK`**: Returns the updated group document.
-   **`404 Not Found`**: Group does not exist.

### `DELETE /groups/{groupId}`

Deletes a group.

**Responses:**

-   **`204 No Content`**: Successful deletion.
-   **`404 Not Found`**: Group does not exist.

### `POST /groups/{groupId}/members`

Adds a member to a group.

**Request Body:**

```json
{
    "did": "did:vibe:z...",
    "username": "new-friend"
}
```

**Responses:**

-   **`200 OK`**: Returns the updated group document.
-   **`404 Not Found`**: Group does not exist.
-   **`409 Conflict`**: Member already exists in the group.

### `DELETE /groups/{groupId}/members/{did}`

Removes a member from a group. The DID must be URL-encoded.

**Responses:**

-   **`204 No Content`**: Successful removal.
-   **`404 Not Found`**: Group or member does not exist.

## 4. Data & Permissions API

This service is responsible for all data and blob storage operations. It enforces access control based on the v2 permission model, using the `Groups Service` to resolve permissions.

### 4.1. Data Model: Access Control List (ACL)

Every document and blob metadata object will have an `acl` field.

```json
{
    "acl": {
        "read": ["group-id-1", "group-id-2"], // IDs of groups that can read
        "write": ["group-id-1"] // IDs of groups that can write
    }
}
```

If a group ID is `owner`, it refers to the user who owns the data.

### 4.2. Endpoints for Data Documents

These endpoints operate on arbitrary JSON documents within a user's database.

#### `POST /data/{collection}`

Creates a new document in a specified collection.

**Request Body:**

```json
{
    "data": { "message": "Hello, world!" },
    "acl": { "read": ["public"], "write": ["owner"] }
}
```

**Responses:**

-   **`201 Created`**: Returns the full document, including its new ID.

#### `GET /data/{collection}`

Retrieves all documents in a collection that the requester has `read` access to.

**Responses:**

-   **`200 OK`**: Returns an array of documents.

#### `GET /data/{collection}/{documentId}`

Retrieves a single document.

**Responses:**

-   **`200 OK`**: Returns the document.
-   **`403 Forbidden`**: The user does not have `read` access.
-   **`404 Not Found`**: Document does not exist.

#### `PUT /data/{collection}/{documentId}`

Updates a document. Requires `write` access.

**Request Body:**

```json
{
    "data": { "message": "Hello, updated world!" },
    "acl": { "read": ["public"], "write": ["owner"] }
}
```

**Responses:**

-   **`200 OK`**: Returns the updated document.
-   **`403 Forbidden`**: The user does not have `write` access.

#### `DELETE /data/{collection}/{documentId}`

Deletes a document. Requires `write` access.

**Responses:**

-   **`204 No Content`**: Successful deletion.
-   **`403 Forbidden`**: The user does not have `write` access.

### 4.3. Endpoints for Blob Storage

These endpoints manage large file uploads, which are stored in a shared S3-compatible bucket but isolated by user-specific paths.

#### `POST /blob/upload-url`

Requests a presigned URL to upload a file directly to blob storage.

**Request Body:**

```json
{
    "fileName": "profile.jpg",
    "contentType": "image/jpeg",
    "collection": "profile-pictures",
    "acl": { "read": ["public"], "write": ["owner"] }
}
```

**Responses:**

-   **`200 OK`**:
    ```json
    {
        "uploadUrl": "https://s3-presigned-url...",
        "blobId": "blob-id-123"
    }
    ```

#### `POST /blob/finalize-upload`

Confirms that a file has been successfully uploaded. This creates the blob's metadata document in the user's database.

**Request Body:**

```json
{
    "blobId": "blob-id-123",
    "collection": "profile-pictures"
}
```

**Responses:**

-   **`200 OK`**: Returns the created metadata document.

#### `GET /blob/download-url/{blobId}`

Requests a presigned URL to download a file. Requires `read` access to the blob.

**Responses:**

-   **`200 OK`**:
    ```json
    {
        "downloadUrl": "https://s3-presigned-url..."
    }
    ```
-   **`403 Forbidden`**: The user does not have `read` access.
-   **`404 Not Found`**: Blob does not exist.
