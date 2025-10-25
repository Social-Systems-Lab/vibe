# Vibe Cloud Platform Rebuild Plan

**Status:** Planning Phase  
**Version:** 1.0  
**Date:** January 2025  
**Scope:** Complete system rebuild with clean architecture and modern technology stack

---

## Executive Summary

This document outlines a comprehensive plan to rebuild the Vibe Cloud platform from the ground up, implementing a clean, simple, and minimal architecture with a union layer approach. The rebuild addresses current pain points while introducing modern technologies and improved user experience patterns.

### Key Changes
- **Backend:** Migration from Node.js/Elysia to ASP.NET Core
- **Database:** Transition from CouchDB to PostgreSQL with JSONB
- **Authentication:** One-tap signup flow with redirect protection
- **Architecture:** App-scoped accounts with independent billing and functionality
- **Infrastructure:** Scaleway managed services for simplified operations

---

## Current State Analysis

### Existing Architecture Pain Points
1. **CouchDB Limitations**
   - Complex replication and conflict resolution
   - Limited query capabilities
   - Difficult global indexing and analytics
   - Per-user database scaling challenges

2. **Node.js/Elysia Stack Issues**
   - Limited enterprise tooling and debugging
   - Complex async error handling
   - Scaling and performance optimization challenges

3. **Authentication Flow Problems**
   - Automatic redirects create phishing vulnerabilities
   - Poor user experience for app-integrated flows
   - Complex consent management

4. **Billing and Account Model**
   - User-centric billing limits app functionality
   - Apps cannot provide services without user accounts
   - Complex multi-tenant data isolation

---

## Target Architecture

### Technology Stack

#### Backend API
- **Framework:** ASP.NET Core 8.0+
- **Language:** C# 12+
- **Hosting:** Scaleway managed containers/functions
- **Authentication:** JWT with custom claims
- **Real-time:** SignalR for live updates

#### Database
- **Primary Store:** PostgreSQL 15+ with JSONB
- **Provider:** Scaleway managed PostgreSQL
- **Features:** Row-Level Security (RLS), JSONB indexing, partitioning
- **Migration:** Gradual transition from CouchDB with data transformation

#### Infrastructure
- **Cloud Provider:** Scaleway
- **Container Orchestration:** Kubernetes (Scaleway Kapsule)
- **Storage:** Scaleway Object Storage (S3-compatible)
- **CDN:** Scaleway CDN for static assets
- **Monitoring:** Scaleway observability stack

### Core Principles

1. **Union Layer Architecture**
   - Simple core with composable layers
   - Clear separation of concerns
   - Minimal dependencies between layers

2. **App-First Design**
   - Apps have their own Vibe Cloud accounts
   - Independent storage, compute, and billing
   - Functionality without user accounts

3. **Security by Design**
   - Row-Level Security at database level
   - Redirect-based auth for credential protection
   - Granular permission system

4. **Developer Experience**
   - Clean APIs with OpenAPI documentation
   - Comprehensive SDK with TypeScript support
   - Local development environment with Docker

---

## New Authentication Flow

### One-Tap Signup with Redirect Protection

#### User Flow
1. **In-App Prompt:** User sees consent dialog within the app
2. **Redirect Decision:** 
   - Existing users: One-tap approval
   - New users: Redirect to secure Vibe Cloud domain
3. **Credential Protection:** All credential entry happens on Vibe Cloud domain
4. **Return Flow:** Secure token exchange back to app

#### Technical Implementation
```
App → Vibe SDK → Auth Request → Vibe Cloud API
                                      ↓
User Decision ← In-App Dialog ← Auth Challenge
      ↓
New User: Redirect to vibe-cloud.com/auth
Existing User: One-tap approval
      ↓
Secure Token ← Token Exchange ← Auth Completion
```

#### Security Features
- **Domain Isolation:** Credentials only entered on Vibe Cloud domain
- **PKCE Flow:** Proof Key for Code Exchange for mobile/SPA security
- **Short-lived Tokens:** JWT with refresh token rotation
- **Consent Granularity:** Specific permissions requested per app

---

## App Account System

### App-Scoped Accounts

#### Concept
Each app gets its own Vibe Cloud account with:
- **Dedicated Storage:** App-specific data buckets
- **Compute Resources:** Allocated processing capacity
- **Backend Services:** Global queries, analytics, notifications
- **Billing Responsibility:** App pays for infrastructure usage

#### Benefits
1. **User Experience:** Apps work without user accounts
2. **Developer Freedom:** Apps control their data and features
3. **Scalability:** Independent scaling per app
4. **Business Model:** Clear cost attribution and billing

#### Implementation
```sql
-- App accounts table
CREATE TABLE app_accounts (
    id uuid PRIMARY KEY,
    app_id text UNIQUE NOT NULL,
    name text NOT NULL,
    owner_did text NOT NULL,
    billing_plan text NOT NULL,
    storage_quota bigint NOT NULL,
    compute_quota bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- App-user relationships
CREATE TABLE app_user_grants (
    app_id text NOT NULL,
    user_did text NOT NULL,
    permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
    granted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    PRIMARY KEY (app_id, user_did)
);
```

---

## Database Design

### PostgreSQL Schema

#### Core Tables
Based on the PostgresDbDraft.md specification:

1. **documents** - Universal document store with JSONB
2. **doc_edges** - Generic relationship modeling
3. **certificates** - Cryptographic entitlements
4. **doc_acl_index** - Precomputed access control
5. **doc_outbox** - Real-time event streaming

#### Key Features
- **Row-Level Security:** Database-enforced multi-tenancy
- **JSONB Indexing:** Fast queries on dynamic schemas
- **Emergent Schema:** Apps define types without migrations
- **Real-time Events:** Change streams for live updates

#### Migration Strategy
1. **Phase 1:** Parallel write to both CouchDB and PostgreSQL
2. **Phase 2:** Gradual read migration with fallback
3. **Phase 3:** Full cutover and CouchDB decommission
4. **Phase 4:** Optimization and projection tables

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-4)
**Goal:** Basic ASP.NET Core API with PostgreSQL

#### Deliverables
- [ ] ASP.NET Core project structure
- [ ] PostgreSQL database setup on Scaleway
- [ ] Basic document CRUD operations
- [ ] JWT authentication framework
- [ ] Docker development environment

#### Technical Tasks
1. Create ASP.NET Core Web API project
2. Configure Entity Framework Core with Npgsql
3. Implement basic document model and repository
4. Set up JWT authentication middleware
5. Create Docker Compose for local development

### Phase 2: Authentication & Security (Weeks 5-8)
**Goal:** Complete authentication flow with security features

#### Deliverables
- [ ] One-tap signup flow implementation
- [ ] Redirect-based credential protection
- [ ] Row-Level Security policies
- [ ] App account management
- [ ] Permission system

#### Technical Tasks
1. Implement PKCE OAuth2 flow
2. Create secure authentication endpoints
3. Set up Row-Level Security in PostgreSQL
4. Build app account management APIs
5. Implement granular permission system

### Phase 3: Core Features (Weeks 9-12)
**Goal:** Feature parity with existing system

#### Deliverables
- [ ] Document management with ACLs
- [ ] Real-time updates with SignalR
- [ ] File storage integration
- [ ] Global search and indexing
- [ ] SDK updates for new API

#### Technical Tasks
1. Implement document ACL system
2. Set up SignalR hubs for real-time features
3. Integrate Scaleway Object Storage
4. Build search indexing with PostgreSQL
5. Update TypeScript SDK for new endpoints

### Phase 4: Migration & Optimization (Weeks 13-16)
**Goal:** Data migration and performance optimization

#### Deliverables
- [ ] CouchDB to PostgreSQL migration tools
- [ ] Performance optimization
- [ ] Monitoring and observability
- [ ] Load testing and scaling
- [ ] Production deployment

#### Technical Tasks
1. Build data migration pipeline
2. Implement database partitioning strategies
3. Set up monitoring with Scaleway observability
4. Conduct load testing and optimization
5. Deploy to production with gradual rollout

---

## API Design

### RESTful Endpoints

#### Authentication
```
POST /auth/challenge          # Initiate auth flow
POST /auth/token             # Exchange code for token
POST /auth/refresh           # Refresh access token
DELETE /auth/revoke          # Revoke tokens
```

#### Documents
```
GET    /documents            # List documents with filtering
POST   /documents            # Create document
GET    /documents/{id}       # Get document by ID
PUT    /documents/{id}       # Update document
DELETE /documents/{id}       # Delete document
```

#### App Management
```
GET    /apps                 # List user's apps
POST   /apps                 # Create new app
GET    /apps/{id}            # Get app details
PUT    /apps/{id}            # Update app
DELETE /apps/{id}            # Delete app
```

#### Real-time
```
WebSocket /hub/documents     # Document change notifications
WebSocket /hub/presence      # User presence updates
```

### SDK Architecture

#### TypeScript SDK Structure
```typescript
// Core SDK class
export class VibeSDK {
    auth: AuthManager;
    documents: DocumentManager;
    apps: AppManager;
    realtime: RealtimeManager;
}

// Authentication management
export class AuthManager {
    async challenge(appId: string): Promise<AuthChallenge>;
    async exchangeToken(code: string): Promise<TokenResponse>;
    async refreshToken(): Promise<TokenResponse>;
}

// Document operations
export class DocumentManager {
    async create<T>(document: CreateDocumentRequest<T>): Promise<Document<T>>;
    async get<T>(id: string): Promise<Document<T>>;
    async update<T>(id: string, updates: Partial<T>): Promise<Document<T>>;
    async delete(id: string): Promise<void>;
    async query<T>(query: DocumentQuery): Promise<Document<T>[]>;
}
```

---

## Development Environment

### Local Setup

#### Docker Compose Configuration
```yaml
version: '3.8'
services:
  api:
    build: ./src/Vibe.Api
    ports:
      - "5000:80"
    environment:
      - ConnectionStrings__DefaultConnection=Host=postgres;Database=vibe;Username=vibe;Password=dev
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: vibe
      POSTGRES_USER: vibe
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

#### Development Scripts
```bash
# Setup local environment
./scripts/dev-setup.sh

# Run database migrations
./scripts/migrate.sh

# Start development servers
./scripts/dev-start.sh

# Run tests
./scripts/test.sh
```

---

## Testing Strategy

### Test Pyramid

#### Unit Tests (70%)
- Business logic validation
- Data model tests
- Authentication logic
- Permission calculations

#### Integration Tests (20%)
- API endpoint testing
- Database integration
- External service mocking
- Authentication flows

#### End-to-End Tests (10%)
- Complete user journeys
- Cross-browser testing
- Mobile app integration
- Performance validation

### Test Tools
- **Unit Testing:** xUnit with FluentAssertions
- **Integration Testing:** ASP.NET Core Test Host
- **API Testing:** Postman/Newman collections
- **Load Testing:** NBomber or k6
- **E2E Testing:** Playwright

---

## Deployment Strategy

### Infrastructure as Code

#### Scaleway Resources
```yaml
# Terraform configuration for Scaleway
resource "scaleway_rdb_instance" "main" {
  name           = "vibe-postgres"
  node_type      = "db-dev-s"
  engine         = "PostgreSQL-15"
  is_ha_cluster  = true
  disable_backup = false
}

resource "scaleway_k8s_cluster" "main" {
  name    = "vibe-cluster"
  version = "1.28"
  cni     = "cilium"
}

resource "scaleway_object_bucket" "storage" {
  name = "vibe-storage"
  acl  = "private"
}
```

#### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vibe-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: vibe-api
  template:
    metadata:
      labels:
        app: vibe-api
    spec:
      containers:
      - name: api
        image: vibe/api:latest
        ports:
        - containerPort: 80
        env:
        - name: ConnectionStrings__DefaultConnection
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: connection-string
```

### CI/CD Pipeline

#### GitHub Actions Workflow
```yaml
name: Build and Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup .NET
      uses: actions/setup-dotnet@v3
      with:
        dotnet-version: '8.0.x'
    - name: Run tests
      run: dotnet test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Build Docker image
      run: docker build -t vibe/api:${{ github.sha }} .
    - name: Push to registry
      run: docker push vibe/api:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - name: Deploy to Kubernetes
      run: kubectl set image deployment/vibe-api api=vibe/api:${{ github.sha }}
```

---

## Risk Assessment & Mitigation

### Technical Risks

#### Database Migration Risk
- **Risk:** Data loss or corruption during CouchDB to PostgreSQL migration
- **Mitigation:** 
  - Parallel write strategy with validation
  - Comprehensive backup and rollback procedures
  - Gradual migration with canary deployments

#### Performance Risk
- **Risk:** PostgreSQL performance doesn't match CouchDB for specific workloads
- **Mitigation:**
  - Extensive load testing during development
  - Query optimization and indexing strategies
  - Fallback to read replicas for heavy queries

#### Authentication Security Risk
- **Risk:** New auth flow introduces security vulnerabilities
- **Mitigation:**
  - Security audit of authentication implementation
  - Penetration testing of auth endpoints
  - OAuth2/PKCE standard compliance

### Business Risks

#### Development Timeline Risk
- **Risk:** Rebuild takes longer than estimated, affecting business operations
- **Mitigation:**
  - Phased delivery with incremental value
  - Parallel development and migration approach
  - Regular milestone reviews and adjustments

#### User Experience Risk
- **Risk:** New authentication flow confuses existing users
- **Mitigation:**
  - User testing and feedback collection
  - Gradual rollout with opt-in beta
  - Comprehensive user education and support

---

## Success Metrics

### Technical Metrics
- **API Response Time:** < 200ms for 95th percentile
- **Database Query Performance:** < 100ms for complex queries
- **System Uptime:** 99.9% availability
- **Authentication Success Rate:** > 99.5%

### Business Metrics
- **User Adoption:** Successful migration of 95% of active users
- **Developer Satisfaction:** SDK usability score > 4.5/5
- **App Functionality:** 100% feature parity with current system
- **Cost Efficiency:** 20% reduction in infrastructure costs

### User Experience Metrics
- **Authentication Time:** < 30 seconds for new user signup
- **App Integration:** < 5 minutes for developer integration
- **Error Rate:** < 1% for critical user flows
- **Support Tickets:** 50% reduction in auth-related issues

---

## Next Steps

### Immediate Actions (Week 1)
1. **Team Assembly:** Assign development team and roles
2. **Environment Setup:** Provision Scaleway resources
3. **Project Initialization:** Create ASP.NET Core project structure
4. **Database Design:** Finalize PostgreSQL schema
5. **Development Planning:** Detailed sprint planning for Phase 1

### Week 2-4 Priorities
1. **Core API Development:** Basic CRUD operations
2. **Authentication Framework:** JWT and OAuth2 setup
3. **Database Integration:** Entity Framework configuration
4. **Testing Setup:** Unit and integration test frameworks
5. **CI/CD Pipeline:** Basic build and deployment automation

### Long-term Milestones
- **Month 1:** Foundation and authentication complete
- **Month 2:** Core features and real-time functionality
- **Month 3:** Migration tools and performance optimization
- **Month 4:** Production deployment and user migration

---

## Conclusion

This rebuild plan provides a comprehensive roadmap for transforming the Vibe Cloud platform into a modern, scalable, and secure system. The phased approach ensures minimal disruption to existing users while delivering significant improvements in performance, security, and developer experience.

The union layer architecture and app-first design principles position Vibe Cloud for future growth and innovation, while the migration to proven enterprise technologies (ASP.NET Core, PostgreSQL) ensures long-term maintainability and scalability.

Success depends on careful execution of the migration strategy, thorough testing at each phase, and continuous monitoring of both technical and business metrics throughout the transition.