# Certificates and Access Control Lists (ACLs)

This document outlines the architecture and usage of Vibe's certificate-based permission system. This system provides fine-grained control over who can access and modify documents and collections.

## 1. Core Concepts

### Certificates

Certificates are verifiable credentials (JWTs) that one user (the **issuer**) grants to another (the **subject**). They are used to represent relationships and grant permissions.

-   **Type**: A string that defines the nature of the certificate (e.g., `friend-of`, `member-of`).
-   **Issuer**: The DID of the user who issued the certificate.
-   **Subject**: The DID of the user who received the certificate.
-   **Expires**: An optional ISO timestamp indicating when the certificate is no longer valid.
-   **Signature**: A JWS signature created with the issuer's private key.

### Access Control Lists (ACLs)

ACLs are embedded in documents and specify the rules for accessing and modifying them.

-   **`read`**, **`write`**, **`create`**: These properties define the permissions for the respective operations.
-   **`allow`**: An array of rules that grant access. If a user matches any of these rules, they are granted access (OR logic).
-   **`deny`**: An array of rules that deny access. These rules override any `allow` rules.

## 2. Data Models

### Certificate Document

Stored in the `issued-certs` collection of the issuer and the `certs` collection of the subject.

```json
{
    "_id": "issued-certs/<id>",
    "type": "friend-of",
    "issuer": "did:vibe:alice",
    "subject": "did:vibe:bob",
    "expires": "2026-01-01T00:00:00Z",
    "signature": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### ACL Field

Embedded within a document.

```json
"acl": {
  "read": {
    "allow": [
      [
        { "issuer": "did:vibe:org", "type": "member-of" },
        { "issuer": "did:vibe:verifier", "type": "proof:age" }
      ],
      "did:vibe:alice"
    ],
    "deny": [
      "did:vibe:dave",
      { "issuer": "did:vibe:org", "type": "banned" }
    ]
  },
  "write": { ... },
  "create": { ... }
}
```

## 3. API Endpoints

-   `POST /certs/issue`: Issues a new certificate.
    -   **Body**: `{ type: string, subjectDid: string, expires?: string }`
-   `POST /certs/revoke/{certId}`: Revokes an existing certificate.

## 4. SDK Methods

-   `sdk.issueCert(targetDid: string, type: string, expires?: string)`: Issues a new certificate.
-   `sdk.revokeCert(certId: string)`: Revokes a certificate.

The `read`, `readOnce`, and `write` methods now automatically present a user's certificates when making requests, so no changes are needed to use the new ACL features with these methods.
