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
const VIBE_CLOUD_BASE_URL = "http://127.0.0.1:3000"; // From docker-compose/env
const ADMIN_CLAIM_CODE = "ABC1-XYZ9"; // From vibe-cloud/.env
const LOCAL_STORAGE_KEY_PREFIX = "vibe_agent_";

/**
 * Implementation of the VibeAgent interface that connects to the Vibe Cloud API.
 */
export class MockVibeAgent implements VibeAgent {
    private manifest: AppManifest | null = null;
    private keyPair: Ed25519KeyPair | null = null;
    private userDid: string | null = null;
    private account: Account | null = null;
    private jwt: string | null = null;
    private grantedPermissions: Record<string, PermissionSetting> | null = null; // Store granted permissions
    private subscriptions: Map<string, SubscriptionCallback<any>> = new Map();
    private isInitialized = false;
    private isInitializing = false; // Prevent concurrent init calls

    constructor() {
        console.log("MockVibeAgent (Cloud Connected) initialized");
        this.loadIdentityFromStorage(); // Try loading identity on construction
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
                const statusResponse = await this.fetchApi<{
                    isRegistered: boolean;
                    manifest?: AppManifest; // Manifest user last saw
                    grants?: Record<string, PermissionSetting>; // Grants user last gave
                }>(`/api/v1/apps/${manifest.appId}/status`, "GET", undefined, true); // Use GET, skip init check

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
                            newGrants[perm] = "ask";
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
                            newGrants[perm] = "ask";
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
        console.log("MockVibeAgent: read (subscription) called with params:", params);
        // For Iteration 2, simulate subscription with an initial readOnce
        // Real-time updates via WebSocket will be handled later.

        const subscriptionId = `sub_${params.collection}_${Date.now()}`;
        this.subscriptions.set(subscriptionId, callback);

        console.log(`MockVibeAgent: Performing initial readOnce for subscription '${subscriptionId}'...`);
        try {
            const initialResult = await this.readOnce<T>(params);
            if (initialResult.ok) {
                callback(null, initialResult.data); // Send initial data
            } else {
                callback(new Error(initialResult.error || "Failed to fetch initial data"), null);
            }
        } catch (error) {
            callback(error instanceof Error ? error : new Error("Unknown error during initial fetch"), null);
        }

        console.log(`MockVibeAgent: Subscription '${subscriptionId}' established (readOnce complete).`);

        // Return an unsubscribe function
        const unsubscribe = async () => {
            this.subscriptions.delete(subscriptionId);
            console.log(`MockVibeAgent: Unsubscribed from '${subscriptionId}'.`);
            // In a real agent, this might involve sending a message to the server
            await Promise.resolve();
        };
        return unsubscribe;
    }

    async unsubscribe(unsubscribeFn: Unsubscribe): Promise<void> {
        // The function returned by `read` *is* the unsubscribe function.
        console.log("MockVibeAgent: Calling unsubscribe function.");
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
