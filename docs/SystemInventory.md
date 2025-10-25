# Vibe System Inventory

This document provides an inventory of the current Vibe system, including its components, architecture, and relationships.

## System Overview

Vibe Cloud is a self-sovereign app platform and personal cloud that returns ownership of identity, data, and social connections to individuals. The system enables apps to connect via consented access to a user's data, making profiles, files, posts, and audiences portable across applications rather than trapped in silos.

## Core Components

### Applications

1. **vibe-cloud-api**
   - ElysiaJS-based backend API
   - Provides OAuth 2.0 + OIDC identity provider
   - Manages per-user data stores (CouchDB) and file storage (S3-compatible)
   - Handles consent management and policies
   - Provides certificate service for verifiable claims
   - Maintains global index of DocRefs for public discovery/feeds
   - Supports real-time endpoints

2. **vibe-cloud-ui**
   - Next.js-based main user interface
   - Provides authentication flows (login, signup, consent)
   - Includes app grid for accessing applications
   - Offers profile management

3. **vibe-notes**
   - Example application demonstrating the Vibe platform
   - Next.js-based note-taking application
   - Showcases interoperability and consent mechanisms

### Packages

1. **vibe-core**
   - Core functionality and types
   - Handles cryptography and DID (Decentralized Identifier) operations

2. **vibe-react**
   - React components and hooks for Vibe applications
   - Includes UI components for auth widgets, layout, pickers, permission dialogs, etc.
   - Provides styling and assets

3. **vibe-sdk**
   - JavaScript/TypeScript SDK for interacting with Vibe Cloud API
   - Handles authentication, data operations, file management, consent, and certificates
   - Supports different strategies (agent/standalone/auth-proxy)

### Infrastructure

1. **Deployment**
   - Kubernetes-based deployment (Scaleway Kapsule)
   - Helm charts for service deployment
   - GitHub Actions for CI/CD

2. **Self-hosting**
   - Docker Compose stack for local deployment
   - Documentation for DNS and CORS configuration

## Architecture

### Identity & Authentication

- Users are identified with DIDs (Decentralized Identifiers)
- Authentication uses OAuth 2.0 PKCE flow
- V1 uses server custody for keys with planned migration path to self-hosted and device keys
- Iframe-based Hub enables silent login and cross-app sessions

### Data Management

- Per-user CouchDB databases for document storage
- Client-side PouchDB for caching and real-time sync via _changes feed
- Documents carry ACLs with allow/deny and certificate predicates
- Global index of public documents (DocRefs) for efficient discovery

### Storage

- S3-compatible object storage (Minio or Scaleway)
- Quota management with reserve → pre-signed POST → commit flow
- Support for both public and private file access

### Consent Management

- App manifests describe requested collection operations
- Scopes define read/write permissions for document types
- Certificate-based model for access rights

## Data Model

### Documents

- JSON documents stored in per-user databases
- Access controlled via ACLs
- Operations: read, readOnce, write, remove

### Access Control Lists (ACLs)

- Structure: `{ read | write | create: { allow: [ … ], deny: [ … ] } }`
- Entries can be DIDs or certificate predicates

### Certificates

- Issued/revoked via API/SDK
- Stored by issuer and subject
- Evaluated during access checks

### DocRef

- Lightweight pointer to documents
- Structure: `{ type, ownerDid, ref, aclSummary, timestamps }`
- Published to global DB for public discovery

## Developer Experience

- Zero-backend path for frontend apps
- React integration with VibeProvider and hooks
- Query capabilities with filter/sort/limit and relation expansion
- File management with quota-aware uploads
- Content Manager registration for custom content handling

## Storage & Quota Model

- Level-based quota system
- New users start with limited storage (10-25 MB)
- Trusted free level around 1 GB
- Quota enforcement via API with reserve → upload → commit flow
- Warnings at 80/90/100% usage

## Security & Privacy

- Least-privilege scopes by default
- Explicit and inspectable consent
- Short-lived signed download URLs
- Private buckets by default
- Strong isolation across collections
- Audit logs for consent changes, certificate issuance, and quota adjustments

## Roadmap Areas

- Example app development
- Payments and brokerage
- Messaging MVP
- Self-hosting developer experience
- Account migration