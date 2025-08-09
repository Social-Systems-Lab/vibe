The goal is to **get something online that people can use and see the Vibe magic**, abd prioritize things that:

1. Make onboarding possible without dev help
2. Show unique Vibe features (self-sovereignty, ACL, semantic feeds/collections)
3. Allow social interaction / discovery
4. Have enough polish that users _don’t bounce immediately_

---

## **1. Immediate Blockers to “usable online MVP”**

These are _must-do_ before launch because without them people can’t use the system.

### **Platform deployment**

-   Deploy core infra (SDK backend + hub) to Scaleway
-   Configure DNS, HTTPS, app registration
-   Decide on prod DB setup (pgvector vs. plain Postgres now, swap later)

### **Account recovery / key management**

-   Password recovery flow (email or alternative)
-   Change: encrypt private keys server-side with a platform key so recovery is possible
-   UI for forgot password & reset

### **Basic consent & profile**

-   Functional, user-friendly consent management UI
-   Standardized profile card component (avatar, DID, displayName, badges) for all apps
-   View other users’ profiles from Feeds, Collections, Chat

### **Notifications**

-   Server push system (WebSocket or push API) + SDK integration
-   Simple notification center UI in each app

---

## **2. “Vibe Magic” Features to Differentiate**

These show off why Vibe is special compared to just “feeds + storage.”

### **Semantic feeds (Feeds app)**

-   Create a feed with a semantic query (text or “more like this post”)
-   Filter by media type (text, image, video)
-   Auto-update as matching posts arrive

### **Semantic collections (Collections app)**

-   Create a dynamic collection from a semantic query or “similar to this file/image”
-   Lazy embedding means we can launch this now and improve recall over time

### **Cross-app ACL awareness**

-   Uniform handling of “preview” when user lacks full ACL rights
-   Inline instructions: “You need to request access / pay / join X group”
-   Works in Feeds & Collections

---

## **3. Social glue**

These make the platform feel alive and interactive.

-   **Basic chat app** (direct messaging)

    -   Leverage existing SDK write/read, plus optional ephemeral messages
    -   Could be minimal to start (text only)

-   **Add contacts / friends**

    -   Accept/reject requests
    -   Feed & collection filters for “from my contacts”

-   **Save to collections** from anywhere

    -   Right-click → “Save to my Collection” (pick collection or create new)
    -   Works on posts, images, files

---

## **4. Nice-to-have but not MVP-critical**

-   Calendar integration (events as posts/collections)
-   More granular app consent UI (beyond basic)
-   Monetization UX for ACL-protected content
-   Advanced notification preferences (per app / per type)
-   Theming / white-label support

---

## **5. My Suggested Priority Order**

**Phase 1 — MVP readiness (Blockers)**

1. Deploy core + SDK backend on Scaleway
2. Password recovery flow (with private key encryption change)
3. Basic consent & profile components
4. Notifications API + minimal UI

**Phase 2 — Differentiators**
5\. Semantic feeds creation (text query + “similar to this post”)
6\. Semantic collections (query + “similar to this file”)
7\. Cross-app ACL preview & request-access flow

**Phase 3 — Social glue**
8\. Basic chat app (text only)
9\. Add contacts/friends + profile linking
10\. “Save to my collection” action from posts/files

**Phase 4 — Enrichment**
11\. Calendar events integration
12\. Advanced app consent UI
13\. Monetization preview content
14\. Notification preferences

.
