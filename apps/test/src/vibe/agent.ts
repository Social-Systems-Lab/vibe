// apps/test/src/vibe/agent.ts
import type {
    VibeAgent,
    AppManifest,
    ReadResult,
    WriteResult,
    ReadParams,
    WriteParams,
    SubscriptionCallback,
    Unsubscribe,
    Account,
    PermissionSetting,
} from "./types"; // Added PermissionSetting
import { generateEd25519KeyPair, signEd25519, didFromEd25519, uint8ArrayToHex, type Ed25519KeyPair } from "../lib/identity"; // Use frontend identity utils
import { Buffer } from "buffer"; // Needed for base64 encoding
import * as ed from "@noble/ed25519";

// --- Constants ---
const VIBE_CLOUD_BASE_URL = "http://127.0.0.1:3001"; // 3001 = backen run outside docker, 3000=backend in docker
const ADMIN_CLAIM_CODE = "ABC1-XYZ9"; // From vibe-cloud/.env
const LOCAL_STORAGE_KEY_PREFIX = "vibe_agent_";

/**
 * Implementation of the VibeAgent interface that connects to the Vibe Cloud API.
 */
export class MockVibeAgent implements VibeAgent {
    private webSocket: WebSocket | null = null;
    private isWebSocketConnecting: boolean = false;
    private webSocketUrl: string | null = null;
    private subscriptions: Map<string, SubscriptionCallback<any>> = new Map();
    private pendingSubscriptions: Map<string, SubscriptionCallback<any>> = new Map();

    private manifest: AppManifest | null = null;
    private keyPair: Ed25519KeyPair | null = null;
    private userDid: string | null = null;
    private account: Account | null = null;
    private jwt: string | null = null;
    private grantedPermissions: Record<string, PermissionSetting> | null = null; // Store granted permissions
    private isInitialized = false;
    private isInitializing = false; // Prevent concurrent init calls

    constructor() {
        console.log("MockVibeAgent (Cloud Connected) initialized");
        this.loadIdentityFromStorage(); // Try loading identity on construction
    }

    // --- WebSocket Methods ---

    private async ensureWebSocketConnection(): Promise<void> {
        this.ensureInitialized(); // Need JWT and manifest

        // Already connected and open? Nothing to do.
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            return;
        }

        // Currently connecting? Wait for it to finish (or fail).
        if (this.isWebSocketConnecting) {
            // Simple approach: wait a bit and check again, or use a Promise-based lock
            console.debug("WebSocket is already connecting, waiting...");
            // A more robust solution would use a Promise that resolves/rejects when connection attempt finishes
            await new Promise((resolve) => setTimeout(resolve, 100)); // Simple polling/delay
            return this.ensureWebSocketConnection(); // Re-check status
        }

        // Not connected, not connecting: Initiate connection
        if (!this.webSocket || this.webSocket.readyState === WebSocket.CLOSED) {
            if (!this.jwt || !this.manifest?.appId) {
                throw new Error("Cannot establish WebSocket connection without JWT and App ID.");
            }
            // Construct URL (handle potential http/https mismatch)
            const wsProtocol = VIBE_CLOUD_BASE_URL.startsWith("https:") ? "wss:" : "ws:";
            const wsHost = VIBE_CLOUD_BASE_URL.replace(/^https?:/, "");
            this.webSocketUrl = `${wsProtocol}${wsHost}/ws?token=${encodeURIComponent(this.jwt)}&appId=${encodeURIComponent(this.manifest.appId)}`;

            console.log(`Attempting to connect WebSocket to: ${this.webSocketUrl.split("?")[0]}...`); // Don't log token
            this.isWebSocketConnecting = true;
            this.webSocket = new WebSocket(this.webSocketUrl);

            return new Promise((resolve, reject) => {
                this.webSocket!.onopen = () => {
                    console.log("WebSocket connection established.");
                    this.isWebSocketConnecting = false;
                    // Process any subscriptions that were waiting
                    this.processPendingSubscriptions();
                    resolve();
                };

                this.webSocket!.onmessage = (event) => {
                    this.handleWebSocketMessage(event.data);
                };

                this.webSocket!.onerror = (event) => {
                    console.error("WebSocket error:", event);
                    this.isWebSocketConnecting = false;
                    this.webSocket = null; // Reset on error
                    // Reject pending subscriptions? Or just let subsequent calls fail?
                    this.pendingSubscriptions.clear(); // Clear pending ones on error
                    reject(new Error("WebSocket connection error."));
                };

                this.webSocket!.onclose = (event) => {
                    console.log(`WebSocket closed: Code=${event.code}, Reason=${event.reason}`);
                    this.isWebSocketConnecting = false;
                    this.webSocket = null; // Reset on close
                    // Clear subscriptions as they are no longer active
                    this.subscriptions.clear();
                    this.pendingSubscriptions.clear();
                    // Optionally notify the app about the disconnection
                };
            });
        }
        // Should not reach here if logic is correct, but return resolved promise
        return Promise.resolve();
    }

    private processPendingSubscriptions(): void {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
            console.warn("WebSocket not open, cannot process pending subscriptions.");
            return;
        }
        console.debug(`Processing ${this.pendingSubscriptions.size} pending subscriptions...`);
        this.pendingSubscriptions.forEach((callback, collection) => {
            // Move from pending to active
            this.subscriptions.set(collection, callback);
            // Send subscribe message
            this.sendWebSocketMessage({ action: "subscribe", collection });
        });
        this.pendingSubscriptions.clear();
    }

    private handleWebSocketMessage(rawMessage: any): void {
        try {
            const message = JSON.parse(rawMessage);
            console.debug("WebSocket message received:", message);

            // Handle backend messages (update, error, status confirmations)
            if (message.type === "update" && message.collection && message.data) {
                const callback = this.subscriptions.get(message.collection);
                if (callback) {
                    // Assuming backend sends the single changed doc in `data`
                    // We need to merge this into the existing state, which the agent doesn't know.
                    // The current VibeProvider/SDK design expects the *full* dataset on update.
                    // This is a mismatch!
                    // Option 1: Agent refetches full data (inefficient)
                    // Option 2: Backend RealtimeService sends full data (potentially large)
                    // Option 3: SDK/App handles merging the single update (complex state logic in app)

                    // --- TEMPORARY WORKAROUND (Option 1 - Inefficient): Refetch ---
                    console.warn(`Received single doc update for ${message.collection}. Refetching full data as a workaround.`);
                    this.readOnce({ collection: message.collection })
                        .then((result) => {
                            if (result.ok) {
                                callback(null, result.data);
                            } else {
                                callback(new Error(result.error || `Refetch failed for ${message.collection}`), null);
                            }
                        })
                        .catch((err) => {
                            callback(err, null);
                        });
                    // --- End Workaround ---

                    // Ideal (if backend sent full data or app handled merge):
                    // callback(null, message.data); // Adjust based on actual payload structure
                } else {
                    console.warn(`Received update for unsubscribed collection: ${message.collection}`);
                }
            } else if (
                message.status === "subscribed" ||
                message.status === "unsubscribed" ||
                message.status === "denied" ||
                message.status === "not_subscribed"
            ) {
                // Log confirmation/status messages from backend
                console.log(`WebSocket status for collection '${message.collection}': ${message.status}${message.reason ? ` (${message.reason})` : ""}`);
            } else if (message.error) {
                console.error(`WebSocket error message from server: ${message.error}`);
                // Maybe notify specific subscription? Difficult without context.
            } else {
                console.warn("Received unknown WebSocket message format:", message);
            }
        } catch (error) {
            console.error("Failed to parse WebSocket message:", rawMessage, error);
        }
    }

    private sendWebSocketMessage(message: object): void {
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            try {
                console.debug("Sending WebSocket message:", message);
                this.webSocket.send(JSON.stringify(message));
            } catch (error) {
                console.error("Failed to send WebSocket message:", error);
            }
        } else {
            console.warn("WebSocket not open, cannot send message:", message);
            // TODO: Queue message or handle error? For subscribe/unsubscribe, queuing might be complex.
        }
    }

    // --- Identity Management ---

    private getStorageKey(key: string): string {
        // Use manifest appId for namespacing if available, otherwise a default
        const namespace = this.manifest?.appId || "default_app";
        // Sanitize namespace for local storage key
        const sanitizedNamespace = namespace.replace(/[^a-zA-Z0-9_-]/g, "_");
        return `${LOCAL_STORAGE_KEY_PREFIX}${sanitizedNamespace}_${key}`;
    }

    private loadIdentityFromStorage(): void {
        try {
            const storedDid = localStorage.getItem(this.getStorageKey("userDid"));
            const storedPrivKeyHex = localStorage.getItem(this.getStorageKey("privateKeyHex"));
            const storedJwt = localStorage.getItem(this.getStorageKey("jwt"));

            if (storedDid && storedPrivKeyHex) {
                const privateKey = Uint8Array.from(Buffer.from(storedPrivKeyHex, "hex"));
                // Regenerate public key from private key
                const publicKey = ed.getPublicKey(privateKey);
                this.keyPair = { privateKey, publicKey };
                this.userDid = storedDid;
                console.log("Loaded identity from localStorage:", this.userDid);

                if (storedJwt) {
                    this.jwt = storedJwt;
                    console.log("Loaded JWT from localStorage.");
                    // TODO: Add JWT expiry check?
                }
            } else {
                console.log("No identity found in localStorage.");
            }
        } catch (error) {
            console.error("Error loading identity from localStorage:", error);
        }
    }

    private saveIdentityToStorage(): void {
        if (this.userDid && this.keyPair?.privateKey && this.jwt) {
            try {
                localStorage.setItem(this.getStorageKey("userDid"), this.userDid);
                localStorage.setItem(this.getStorageKey("privateKeyHex"), uint8ArrayToHex(this.keyPair.privateKey));
                localStorage.setItem(this.getStorageKey("jwt"), this.jwt);
                console.log("Saved identity and JWT to localStorage.");
            } catch (error) {
                console.error("Error saving identity to localStorage:", error);
            }
        }
    }

    private clearIdentityFromStorage(): void {
        try {
            localStorage.removeItem(this.getStorageKey("userDid"));
            localStorage.removeItem(this.getStorageKey("privateKeyHex"));
            localStorage.removeItem(this.getStorageKey("jwt"));
            console.log("Cleared identity and JWT from localStorage.");
        } catch (error) {
            console.error("Error clearing identity from localStorage:", error);
        }
    }

    // --- Core Agent Methods ---

    // Updated return type to match interface
    async init(manifest: AppManifest): Promise<{ account: Account | null; permissions: Record<string, PermissionSetting> | null }> {
        if (this.isInitialized || this.isInitializing) {
            console.warn(`MockVibeAgent already ${this.isInitializing ? "initializing" : "initialized"}. Returning current state.`);
            return { account: this.account, permissions: this.grantedPermissions };
        }
        this.isInitializing = true;
        console.log("MockVibeAgent: Initializing with manifest:", manifest);
        this.manifest = manifest;

        try {
            // 1. Ensure Identity (Load or Generate)
            if (!this.userDid || !this.keyPair) {
                console.log("Generating new identity...");
                this.keyPair = generateEd25519KeyPair();
                this.userDid = didFromEd25519(this.keyPair.publicKey);
                this.jwt = null; // Clear any potentially stale JWT
                this.clearIdentityFromStorage(); // Clear storage before attempting claim
                console.log("Generated new DID:", this.userDid);
            } else {
                console.log("Using existing identity:", this.userDid);
            }

            // 2. Ensure JWT (Claim if missing/invalid)
            // TODO: Add check for JWT validity/expiry here
            if (!this.jwt) {
                console.log("JWT missing or invalid, attempting admin claim...");
                await this.performAdminClaim();
            } else {
                console.log("Using existing JWT.");
                // Optional: Verify JWT against a /verify endpoint if one exists
            }

            // 3. Save identity and JWT if successful
            this.saveIdentityToStorage();

            // --- New App Registration/Update Flow ---
            console.log(`Checking registration status for app: ${manifest.appId}`);
            let needsUpsert = false;
            let newGrants: Record<string, PermissionSetting> = {};

            try {
                // 4. Check Status
                const statusBasePath = "/api/v1/apps/status";
                const queryString = `?appId=${encodeURIComponent(this.manifest.appId)}`;
                const statusEndpointWithQuery = statusBasePath + queryString;
                const statusResponse = await this.fetchApi<{
                    isRegistered: boolean;
                    manifest?: AppManifest; // Manifest user last saw
                    grants?: Record<string, PermissionSetting>; // Grants user last gave
                }>(statusEndpointWithQuery, "GET", undefined, true); // Use GET, skip init check

                const storedManifest = statusResponse.manifest;
                const storedGrants = statusResponse.grants;

                console.log("Status response:", statusResponse);

                // 5. Compare Permissions & Determine Grants
                const latestPermissions = new Set(manifest.permissions);
                const storedPermissions = storedManifest ? new Set(storedManifest.permissions) : new Set<string>();

                // Check if permissions lists are different or if no grants exist yet
                let permissionsDiffer = latestPermissions.size !== storedPermissions.size || !manifest.permissions.every((p) => storedPermissions.has(p));
                if (!storedGrants || Object.keys(storedGrants).length === 0) {
                    console.log("No existing grants found, simulating initial consent.");
                    permissionsDiffer = true; // Treat as different if no grants yet
                }

                if (permissionsDiffer) {
                    console.log("Permissions differ or first time registration. Simulating consent based on latest manifest.");
                    // Simulate consent based on the *latest* manifest
                    manifest.permissions.forEach((perm) => {
                        // Simple simulation: grant 'always' for read, 'ask' for others
                        if (perm.startsWith("read:")) {
                            newGrants[perm] = "always";
                        } else {
                            newGrants[perm] = "always"; // TODO "ask" should be the default for non-read permissions
                        }
                    });
                    console.log("Simulated new grants:", newGrants);
                    needsUpsert = true;
                } else {
                    console.log("Permissions match existing registration. Using stored grants.");
                    newGrants = storedGrants!; // Use the existing grants
                    this.grantedPermissions = newGrants; // Store locally
                }

                // 6. Call Upsert if needed
                if (needsUpsert) {
                    console.log(`Calling /upsert for app ${manifest.appId}`);
                    const upsertPayload = {
                        // Send the *latest* manifest details + new grants
                        appId: manifest.appId,
                        name: manifest.name,
                        description: manifest.description,
                        pictureUrl: manifest.pictureUrl,
                        permissions: manifest.permissions, // Latest permissions
                        grants: newGrants, // Newly simulated grants
                    };
                    await this.fetchApi<any>("/api/v1/apps/upsert", "POST", upsertPayload, true); // skip init check
                    console.log("Upsert successful.");
                    this.grantedPermissions = newGrants; // Store the newly set grants
                }
            } catch (error) {
                console.error("Error during status check or upsert:", error);
                // If status check fails (e.g., 404), we might still want to proceed with upsert as a first-time registration.
                // Let's assume a failure here means we should try an initial upsert.
                if (error instanceof Error && error.message.includes("404")) {
                    // Check for 404 specifically if possible
                    console.log("Status check failed (likely 404), proceeding with initial upsert.");
                    // Simulate consent based on the *latest* manifest
                    manifest.permissions.forEach((perm) => {
                        if (perm.startsWith("read:")) {
                            newGrants[perm] = "always";
                        } else {
                            newGrants[perm] = "always"; // TODO "ask" should be the default for non-read permissions
                        }
                    });
                    console.log("Simulated initial grants:", newGrants);
                    const upsertPayload = { ...manifest, grants: newGrants };
                    try {
                        await this.fetchApi<any>("/api/v1/apps/upsert", "POST", upsertPayload, true);
                        console.log("Initial Upsert successful.");
                        this.grantedPermissions = newGrants;
                    } catch (upsertError) {
                        console.error("Initial Upsert failed:", upsertError);
                        throw new Error(`Failed initial app registration/upsert: ${upsertError instanceof Error ? upsertError.message : String(upsertError)}`);
                    }
                } else {
                    // Rethrow other errors during status/upsert
                    throw new Error(`Failed app status check or upsert: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            // --- End New Flow ---

            // 7. Construct the account object
            if (this.userDid) {
                this.account = { userDid: this.userDid };
                console.log("MockVibeAgent: Account object constructed:", this.account);
            } else {
                console.error("MockVibeAgent: userDid is null after identity check. Cannot construct account.");
                this.account = null;
                this.grantedPermissions = null; // Clear permissions if account fails
            }

            this.isInitialized = true;
            console.log("MockVibeAgent: Initialization complete.");
            return { account: this.account, permissions: this.grantedPermissions }; // Return combined object
        } catch (error) {
            console.error("MockVibeAgent: Initialization failed:", error);
            this.isInitialized = false; // Ensure state reflects failure
            this.account = null; // Clear account on failure
            this.grantedPermissions = null; // Clear permissions on failure
            this.clearIdentityFromStorage(); // Clear potentially partial/invalid state
            return { account: null, permissions: null }; // Indicate failure
        } finally {
            this.isInitializing = false;
        }
    }

    private async performAdminClaim(): Promise<void> {
        if (!this.userDid || !this.keyPair) {
            throw new Error("Cannot perform claim without a valid DID and key pair.");
        }

        const messageBytes = new TextEncoder().encode(ADMIN_CLAIM_CODE);
        const signatureBytes = signEd25519(messageBytes, this.keyPair.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const url = `${VIBE_CLOUD_BASE_URL}/api/v1/admin/claim`;
        console.log(`Attempting claim to ${url} with DID ${this.userDid}`);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    did: this.userDid,
                    claimCode: ADMIN_CLAIM_CODE,
                    signature: signatureBase64,
                }),
            });

            const responseBody = await response.json();

            if (!response.ok) {
                console.error("Admin claim failed:", response.status, responseBody);
                throw new Error(`Admin claim failed: ${responseBody?.error || response.statusText}`);
            }

            if (!responseBody.token) {
                console.error("Admin claim response missing token:", responseBody);
                throw new Error("Admin claim successful, but token was not returned.");
            }

            this.jwt = responseBody.token;
            console.log("Admin claim successful, JWT obtained.");
        } catch (error) {
            console.error("Error during admin claim fetch:", error);
            throw error; // Re-throw network or parsing errors
        }
    }

    // --- Obsolete Helper Methods ---
    // private async registerApp(...) { ... } // Replaced by /upsert logic in init
    // private async setAppGrants(...) { ... } // Replaced by /upsert logic in init

    private ensureInitialized(): void {
        // Updated check: Ensure JWT is present, account and permissions might still be null during init
        if (!this.isInitialized || !this.manifest || !this.userDid || !this.jwt) {
            // Consider if check should be less strict during the init phase itself
            throw new Error("MockVibeAgent not initialized or missing credentials. Call init() first.");
        }
    }

    // --- API Interaction Helper ---
    private async fetchApi<T>(endpoint: string, method: "GET" | "POST" | "PUT" | "DELETE" = "POST", body?: any, skipEnsureInitialized?: boolean): Promise<T> {
        if (!skipEnsureInitialized) {
            this.ensureInitialized();
        }
        const url = `${VIBE_CLOUD_BASE_URL}${endpoint}`;
        console.log(`Fetching API: ${method} ${url}`, body ? { body } : {});

        const headers: HeadersInit = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.jwt}`,
            "X-Vibe-App-ID": this.manifest!.appId, // ensureInitialized guarantees manifest is not null
        };

        try {
            const response = await fetch(url, {
                method: method,
                headers: headers,
                body: body ? JSON.stringify(body) : undefined,
            });

            // Handle potential empty responses (e.g., 204 No Content)
            if (response.status === 204) {
                console.log(`API Response ${response.status} (No Content) for ${method} ${url}`);
                // Return an appropriate value for "No Content" - maybe null or an empty object/array?
                // Adjust based on expected return type T. For now, returning null.
                return null as T;
            }

            const responseBody = await response.json();

            if (!response.ok) {
                console.error(`API Error ${response.status}: ${method} ${url}`, responseBody);
                // Attempt to extract a meaningful error message
                const errorMessage = responseBody?.error?.details || responseBody?.error || responseBody?.message || `HTTP error ${response.status}`;
                throw new Error(`API request failed: ${errorMessage}`);
            }

            console.log(`API Response ${response.status}: ${method} ${url}`, responseBody);
            return responseBody as T;
        } catch (error) {
            console.error(`Network or parsing error during API fetch: ${method} ${url}`, error);
            // Re-throw network/parsing errors or wrap them
            if (error instanceof Error) {
                throw new Error(`Network request failed: ${error.message}`);
            } else {
                throw new Error("An unknown network error occurred.");
            }
        }
    }

    // --- Data Methods ---

    async readOnce<T>(params: ReadParams): Promise<ReadResult<T>> {
        console.log("MockVibeAgent: readOnce calling API with params:", params);
        // Map ReadParams to the /api/v1/data/read POST body structure
        const apiPayload = {
            collection: params.collection,
            filter: params.filter || {}, // Ensure filter is at least an empty object
        };
        // The API returns the ReadResult structure directly { ok: boolean, data: T[] }
        // However, our current API returns { docs: T[] }. Adapt accordingly.
        try {
            const result = await this.fetchApi<{ docs: T[] }>("/api/v1/data/read", "POST", apiPayload);
            // Adapt the response shape if necessary
            return { ok: true, data: result.docs };
        } catch (error) {
            console.error("readOnce failed:", error);
            return { ok: false, error: error instanceof Error ? error.message : String(error), data: [] };
        }
    }

    async read<T>(params: ReadParams, callback: SubscriptionCallback<T>): Promise<Unsubscribe> {
        this.ensureInitialized(); // Basic checks first
        const { collection } = params; // Filter not used for WS subscription message

        console.log(`MockVibeAgent: read (subscription) requested for collection: ${collection}`);

        // 1. Ensure WebSocket connection is ready (or being established)
        try {
            await this.ensureWebSocketConnection();
        } catch (error) {
            console.error(`Failed to establish WebSocket connection for ${collection}:`, error);
            callback(error instanceof Error ? error : new Error("WebSocket connection failed"), null);
            // Return a no-op unsubscribe function
            return async () => {};
        }

        // 2. Perform initial readOnce via HTTP
        console.log(`Performing initial readOnce for subscription '${collection}'...`);
        try {
            const initialResult = await this.readOnce<T>(params);
            if (initialResult.ok) {
                callback(null, initialResult.data); // Send initial data
            } else {
                // Still proceed with subscription even if initial read fails? Or fail here?
                // Let's proceed but log the error.
                console.error(`Initial readOnce failed for ${collection}: ${initialResult.error}`);
                // Optionally call callback with error: callback(new Error(initialResult.error || "Initial read failed"), null);
                // Send empty initial data if read fails?
                callback(null, []);
            }
        } catch (error) {
            console.error(`Error during initial readOnce for ${collection}:`, error);
            // Proceed with subscription?
            // Optionally call callback with error: callback(error instanceof Error ? error : new Error("Unknown error during initial fetch"), null);
            callback(null, []);
        }

        // 3. Register subscription and send WS message (if WS is open, otherwise handled by pending)
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            console.log(`WebSocket open, sending subscribe message for ${collection}`);
            this.subscriptions.set(collection, callback);
            this.sendWebSocketMessage({ action: "subscribe", collection });
        } else {
            console.log(`WebSocket not open yet, adding ${collection} to pending subscriptions`);
            // Add to pending, ensureWebSocketConnection's onopen will handle it
            this.pendingSubscriptions.set(collection, callback);
        }

        console.log(`MockVibeAgent: Subscription request processed for '${collection}'.`);

        // 4. Return unsubscribe function
        const unsubscribe = async () => {
            console.log(`Unsubscribing from collection '${collection}'...`);
            this.subscriptions.delete(collection);
            this.pendingSubscriptions.delete(collection); // Remove if it was pending
            // Send unsubscribe message over WebSocket
            this.sendWebSocketMessage({ action: "unsubscribe", collection });
            // Should we close the WS if no subscriptions remain? Maybe not for a mock agent.
        };
        return unsubscribe;
    }

    async unsubscribe(unsubscribeFn: Unsubscribe): Promise<void> {
        // The function returned by `read` *is* the unsubscribe function.
        console.log("MockVibeAgent: Calling unsubscribe function.");
        // It now handles sending the WS message internally.
        await unsubscribeFn();
    }

    async write<T extends { _id?: string }>(params: WriteParams<T>): Promise<WriteResult> {
        console.log("MockVibeAgent: write calling API with params:", params);
        // Map WriteParams to the /api/v1/data/write POST body structure
        const apiPayload = {
            collection: params.collection,
            data: params.data,
        };
        try {
            // The API returns CouchDB-like response: { ok: boolean, id: string, rev: string }[] or single object
            const result = await this.fetchApi<any>("/api/v1/data/write", "POST", apiPayload);
            // Adapt the response to WriteResult: { ok: boolean, ids: string[], errors?: any[] }
            // This needs careful adaptation based on single vs bulk and potential 207 status
            if (Array.isArray(result)) {
                // Bulk response
                const ids = result.filter((r) => r.ok).map((r) => r.id);
                const errors = result.filter((r) => !r.ok);
                return { ok: errors.length === 0, ids, errors: errors.length > 0 ? errors : undefined };
            } else if (result && result.ok && result.id) {
                // Single successful response
                return { ok: true, ids: [result.id] };
            } else if (result && !result.ok) {
                // Single error response
                return { ok: false, ids: [], errors: [result] };
            } else {
                // Unexpected response format
                console.error("Unexpected write API response format:", result);
                return { ok: false, ids: [], errors: [{ error: "unknown", reason: "Unexpected API response format" }] };
            }
        } catch (error) {
            console.error("write failed:", error);
            return { ok: false, ids: [], errors: [{ error: "network_or_parse", reason: error instanceof Error ? error.message : String(error) }] };
        }
    }

    // --- Mock Specific Methods (if needed for testing) ---
    // getCurrentState(): VibeState { ... } // No longer applicable as state is in the cloud
    // simulateUpdate<T>(...) // No longer applicable
}
