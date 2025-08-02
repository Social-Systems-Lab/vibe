# **Vibe SDK: Understanding the New Shared Cache & Security Model**

To significantly improve performance and enable offline-first capabilities for all applications in the Vibe ecosystem, we are introducing a **shared local data cache**. This document explains how it works and the security model that keeps user data safe.

**1. The Architecture: A Central Hub**

Instead of each third-party application managing its own data synchronization, this is now handled by a single, secure "hub" iframe loaded from `https://vibe.cloud`. This hub manages one local database (using PouchDB) and is responsible for all data access and synchronization with the Vibe Cloud.

-   **Benefit for Users:** Data is fetched only once, saving bandwidth and making apps feel faster. Data is also available offline automatically.
-   **Benefit for Developers:** You get offline capabilities and improved performance for your app with no extra implementation effort.

**2. The Security Model: Permissions Enforced by the Hub**

The security of this new model is paramount. The hub acts as a **trusted gatekeeper** for the user's data. Your application will never have direct access to the user's database.

Here is the flow:

1.  **Handshake:** When your app's SDK starts, it securely connects to the hub, identifying itself by its `origin`.
2.  **Permission Check:** The hub contacts the `vibe-cloud-api` to fetch the specific permissions the user has granted _to your app_.
3.  **Enforcement:** Every time your app calls a data function like `sdk.read()` or `sdk.write()`, the SDK sends a request to the hub. The hub checks your app's permissions **before** performing the operation. If your app does not have the required permission, the request is denied.

This "confused deputy" prevention is the core of our security model, ensuring that one app cannot trick the hub into giving it data it shouldn't have access to.

**3. The Permission Model**

To support this architecture, we are introducing a more robust permission system. For this initial release, permissions are defined by simple scopes granted to your application:

-   `read`: Allows your app to read data.
-   `write`: Allows your app to write data.

This model is designed to be extensible. In the future, we will introduce more granular controls, such as per-collection permissions (e.g., `read:posts`, `write:contacts`) and user-level controls like "Ask on every write".

**4. What This Means for Your Code**

From a developer's perspective, the Vibe SDK interface remains **unchanged**. You continue to use the same `sdk.read()`, `sdk.write()`, and `sdk.readOnce()` methods as before. The SDK handles all the complex communication with the hub automatically.
