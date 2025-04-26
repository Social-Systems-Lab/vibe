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
    Identity, // Added
    ConsentRequest, // Added
    ActionRequest, // Added
    ActionResponse, // Added
    VibeState, // Added
} from "./types";
import { generateEd25519KeyPair, signEd25519, didFromEd25519, uint8ArrayToHex, type Ed25519KeyPair, hexToUint8Array } from "../lib/identity"; // Use frontend identity utils
import { Buffer } from "buffer"; // Needed for base64 encoding
import * as ed from "@noble/ed25519";

// --- Constants ---
const VIBE_CLOUD_BASE_URL = "http://127.0.0.1:3001"; // 3001 = backen run outside docker, 3000=backend in docker
const ADMIN_CLAIM_CODE = "ABC1-XYZ9"; // From vibe-cloud/.env
const LOCAL_STORAGE_KEY_PREFIX = "vibe_agent_";
const LOCAL_STORAGE_IDENTITIES_KEY = `${LOCAL_STORAGE_KEY_PREFIX}identities`;
const LOCAL_STORAGE_ACTIVE_DID_KEY = `${LOCAL_STORAGE_KEY_PREFIX}active_did`;
const LOCAL_STORAGE_PERMISSIONS_KEY = `${LOCAL_STORAGE_KEY_PREFIX}permissions`;
const LOCAL_STORAGE_JWT_KEY = `${LOCAL_STORAGE_KEY_PREFIX}jwts`; // Store JWTs per identity DID

/**
 * Mock implementation of the VibeAgent interface.
 * Manages identities, permissions locally, and simulates UI interactions.
 */
export class MockVibeAgent implements VibeAgent {
    // --- State ---
    private identities: Identity[] = [];
    private activeIdentity: Identity | null = null;
    // Permissions structure: identityDID -> origin -> scope -> setting
    private permissions: Record<string, Record<string, Record<string, PermissionSetting>>> = {};
    // JWTs structure: identityDID -> jwt
    private jwts: Record<string, string> = {};

    private manifest: AppManifest | null = null; // Current app manifest
    private currentOrigin: string = window.location.origin; // Origin of the app using the agent

    // UI Interaction State (Promises for pending requests)
    private consentRequestResolver: ((result: Record<string, PermissionSetting>) => void) | null = null;
    private actionConfirmationResolver: ((result: ActionResponse) => void) | null = null;

    // Backend/WebSocket related (kept for potential future direct connection)
    private webSocket: WebSocket | null = null;
    private isWebSocketConnecting: boolean = false;
    private webSocketUrl: string | null = null;
    private subscriptions: Map<string, SubscriptionCallback<any>> = new Map();
    private pendingSubscriptions: Map<string, SubscriptionCallback<any>> = new Map();

    private isInitialized = false;
    private isInitializing = false;

    constructor() {
        console.log("MockVibeAgent initialized");
        this.loadStateFromStorage(); // Load identities, active DID, permissions, JWTs
    }

    // --- WebSocket Methods (Placeholder/Future Use) ---

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
            // Use JWT for the active identity
            const activeJwt = this.activeIdentity ? this.jwts[this.activeIdentity.did] : null;
            if (!activeJwt || !this.manifest?.appId) {
                throw new Error("Cannot establish WebSocket connection without an active identity JWT and App ID.");
            }
            // Construct URL (handle potential http/https mismatch)
            const wsProtocol = VIBE_CLOUD_BASE_URL.startsWith("https:") ? "wss:" : "ws:";
            const wsHost = VIBE_CLOUD_BASE_URL.replace(/^https?:/, "");
            this.webSocketUrl = `${wsProtocol}${wsHost}/ws?token=${encodeURIComponent(activeJwt)}&appId=${encodeURIComponent(this.manifest.appId)}`;

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

    // --- Storage Management ---

    private loadStateFromStorage(): void {
        try {
            // Load Identities
            const storedIdentities = localStorage.getItem(LOCAL_STORAGE_IDENTITIES_KEY);
            if (storedIdentities) {
                const parsed = JSON.parse(storedIdentities);
                // Need to re-hydrate Uint8Arrays
                this.identities = parsed.map((idData: any) => ({
                    ...idData,
                    publicKey: hexToUint8Array(idData.publicKeyHex),
                    privateKey: hexToUint8Array(idData.privateKeyHex),
                }));
                console.log(`Loaded ${this.identities.length} identities from localStorage.`);
            } else {
                console.log("No identities found in localStorage.");
            }

            // Load Active DID
            const storedActiveDid = localStorage.getItem(LOCAL_STORAGE_ACTIVE_DID_KEY);
            if (storedActiveDid) {
                this.activeIdentity = this.identities.find((id) => id.did === storedActiveDid) || null;
                if (this.activeIdentity) {
                    console.log("Loaded active identity:", this.activeIdentity.did);
                } else {
                    console.warn("Stored active DID not found in loaded identities.");
                }
            } else if (this.identities.length > 0) {
                // Default to first identity if none is set as active
                this.activeIdentity = this.identities[0];
                localStorage.setItem(LOCAL_STORAGE_ACTIVE_DID_KEY, this.activeIdentity.did);
                console.log("No active DID found, defaulting to first identity:", this.activeIdentity.did);
            }

            // Load Permissions
            const storedPermissions = localStorage.getItem(LOCAL_STORAGE_PERMISSIONS_KEY);
            if (storedPermissions) {
                this.permissions = JSON.parse(storedPermissions);
                console.log("Loaded permissions from localStorage.");
            } else {
                console.log("No permissions found in localStorage.");
            }

            // Load JWTs
            const storedJwts = localStorage.getItem(LOCAL_STORAGE_JWT_KEY);
            if (storedJwts) {
                this.jwts = JSON.parse(storedJwts);
                console.log("Loaded JWTs from localStorage.");
            } else {
                console.log("No JWTs found in localStorage.");
            }
        } catch (error) {
            console.error("Error loading state from localStorage:", error);
            // Clear potentially corrupted state
            this.clearStateFromStorage();
        }
    }

    private saveStateToStorage(): void {
        try {
            // Serialize identities with hex keys
            const serializableIdentities = this.identities.map((id) => ({
                ...id,
                publicKeyHex: uint8ArrayToHex(id.publicKey),
                privateKeyHex: uint8ArrayToHex(id.privateKey),
                publicKey: undefined, // Remove raw bytes
                privateKey: undefined, // Remove raw bytes
            }));
            localStorage.setItem(LOCAL_STORAGE_IDENTITIES_KEY, JSON.stringify(serializableIdentities));

            if (this.activeIdentity) {
                localStorage.setItem(LOCAL_STORAGE_ACTIVE_DID_KEY, this.activeIdentity.did);
            } else {
                localStorage.removeItem(LOCAL_STORAGE_ACTIVE_DID_KEY);
            }
            localStorage.setItem(LOCAL_STORAGE_PERMISSIONS_KEY, JSON.stringify(this.permissions));
            localStorage.setItem(LOCAL_STORAGE_JWT_KEY, JSON.stringify(this.jwts));
            console.log("Saved agent state (identities, active DID, permissions, JWTs) to localStorage.");
        } catch (error) {
            console.error("Error saving state to localStorage:", error);
        }
    }

    private clearStateFromStorage(): void {
        try {
            localStorage.removeItem(LOCAL_STORAGE_IDENTITIES_KEY);
            localStorage.removeItem(LOCAL_STORAGE_ACTIVE_DID_KEY);
            localStorage.removeItem(LOCAL_STORAGE_PERMISSIONS_KEY);
            localStorage.removeItem(LOCAL_STORAGE_JWT_KEY);
            console.log("Cleared agent state from localStorage.");
        } catch (error) {
            console.error("Error clearing state from localStorage:", error);
        }
    }

    // --- Initialization & State ---

    async init(
        manifest: AppManifest
    ): Promise<{ account: Account | null; permissions: Record<string, PermissionSetting> | null; activeIdentity: Identity | null; identities: Identity[] }> {
        if (this.isInitialized || this.isInitializing) {
            console.warn(`MockVibeAgent already ${this.isInitializing ? "initializing" : "initialized"}. Returning current state.`);
            return this.getCurrentStateForSdk();
        }
        this.isInitializing = true;
        console.log("MockVibeAgent: Initializing with manifest:", manifest);
        this.manifest = manifest;
        this.currentOrigin = window.location.origin; // Ensure origin is set

        try {
            // 1. Ensure at least one identity exists (create if none)
            if (this.identities.length === 0) {
                console.log("No identities found, creating initial identity...");
                await this.createIdentity("Default Identity"); // Creates and sets as active
            } else if (!this.activeIdentity && this.identities.length > 0) {
                // If identities exist but none are active (e.g., after clearing storage), set first as active
                this.activeIdentity = this.identities[0];
                this.saveStateToStorage();
            }

            // 2. Ensure active identity has JWT (claim if needed)
            if (this.activeIdentity && !this.jwts[this.activeIdentity.did]) {
                console.log(`JWT missing for active identity ${this.activeIdentity.did}, attempting claim...`);
                // TODO: Implement claim flow - requires claim code input? For now, use admin claim.
                try {
                    await this.performAdminClaim(this.activeIdentity); // Pass identity for claim
                    this.saveStateToStorage(); // Save JWT
                } catch (claimError) {
                    console.error("Claim failed during init:", claimError);
                    // Proceed without JWT? Or throw? For now, log and continue.
                }
            }

            // 3. Handle Permissions (Check against manifest, potentially trigger consent)
            const currentPermissions = await this.getCurrentPermissionsForOrigin();
            const requiredPermissions = new Set(manifest.permissions);
            const existingPermissions = new Set(Object.keys(currentPermissions));
            const missingPermissions = manifest.permissions.filter((p) => !existingPermissions.has(p));
            const extraPermissions = Object.keys(currentPermissions).filter((p) => !requiredPermissions.has(p)); // Permissions granted but no longer in manifest

            // TODO: Handle 'extraPermissions' - maybe revoke them? Or leave them? For now, ignore.

            if (missingPermissions.length > 0) {
                console.log("New permissions requested by manifest:", missingPermissions);
                // Trigger Consent UI
                const consentRequest: ConsentRequest = {
                    manifest,
                    origin: this.currentOrigin,
                    requestedPermissions: manifest.permissions, // Ask for all current ones
                    existingPermissions: currentPermissions,
                };
                // In a real agent, this would trigger UI. Here we simulate or wait.
                // For now, simulate auto-granting based on defaults.
                const granted = await this.simulateConsent(consentRequest);
                // Update local permissions based on consent result
                await this.updatePermissionsForOrigin(granted);
            } else {
                console.log("Manifest permissions match existing grants for this origin.");
            }

            this.isInitialized = true;
            console.log("MockVibeAgent: Initialization complete.");
            return this.getCurrentStateForSdk();
        } catch (error) {
            console.error("MockVibeAgent: Initialization failed:", error);
            this.isInitialized = false;
            this.activeIdentity = null; // Clear active identity on failure
            // Don't clear all state, just indicate failure
            return { account: null, permissions: null, activeIdentity: null, identities: this.identities };
        } finally {
            this.isInitializing = false;
        }
    }

    // Helper to get state formatted for SDK init/update
    private async getCurrentStateForSdk(): Promise<{
        account: Account | null;
        permissions: Record<string, PermissionSetting> | null;
        activeIdentity: Identity | null;
        identities: Identity[];
    }> {
        const account = this.activeIdentity ? { userDid: this.activeIdentity.did } : null;
        const permissions = this.activeIdentity ? this.permissions[this.activeIdentity.did]?.[this.currentOrigin] || {} : null;
        return {
            account,
            permissions,
            activeIdentity: this.activeIdentity,
            identities: this.identities,
        };
    }

    async getVibeState(): Promise<VibeState> {
        const state = await this.getCurrentStateForSdk();
        return {
            account: state.account ?? undefined,
            permissions: state.permissions ?? undefined,
            activeIdentity: state.activeIdentity,
            identities: state.identities,
        };
    }

    // --- Identity Management ---

    async createIdentity(label: string, pictureUrl?: string): Promise<Identity> {
        console.log(`Creating new identity with label: ${label}`);
        const keyPair = generateEd25519KeyPair();
        const did = didFromEd25519(keyPair.publicKey);
        const newIdentity: Identity = {
            ...keyPair,
            did,
            label,
            pictureUrl,
        };
        this.identities.push(newIdentity);
        // If this is the first identity, make it active
        if (!this.activeIdentity) {
            this.activeIdentity = newIdentity;
        }
        this.saveStateToStorage();
        console.log("New identity created:", newIdentity.did);
        // TODO: Trigger state update to SDK/UI?
        return newIdentity;
    }

    async setActiveIdentity(did: string): Promise<void> {
        const identityToActivate = this.identities.find((id) => id.did === did);
        if (!identityToActivate) {
            throw new Error(`Identity with DID ${did} not found.`);
        }
        if (this.activeIdentity?.did === did) {
            console.log(`Identity ${did} is already active.`);
            return;
        }
        console.log(`Setting active identity to: ${did}`);
        this.activeIdentity = identityToActivate;
        this.saveStateToStorage();
        // TODO: Trigger state update to SDK/UI?
        // TODO: Ensure new active identity has JWT if needed?
    }

    async getIdentities(): Promise<Identity[]> {
        return [...this.identities]; // Return a copy
    }

    async getActiveIdentity(): Promise<Identity | null> {
        return this.activeIdentity ? { ...this.activeIdentity } : null; // Return a copy
    }

    // --- Permission Management ---

    async getPermission(identityDid: string, origin: string, scope: string): Promise<PermissionSetting | null> {
        return this.permissions[identityDid]?.[origin]?.[scope] || null;
    }

    async setPermission(identityDid: string, origin: string, scope: string, setting: PermissionSetting): Promise<void> {
        if (!this.permissions[identityDid]) {
            this.permissions[identityDid] = {};
        }
        if (!this.permissions[identityDid][origin]) {
            this.permissions[identityDid][origin] = {};
        }
        console.log(`Setting permission for ${identityDid} / ${origin} / ${scope} -> ${setting}`);
        this.permissions[identityDid][origin][scope] = setting;
        this.saveStateToStorage();
        // TODO: Trigger state update?
    }

    // Helper to get all permissions for the current active identity and origin
    private async getCurrentPermissionsForOrigin(): Promise<Record<string, PermissionSetting>> {
        if (!this.activeIdentity) return {};
        return this.permissions[this.activeIdentity.did]?.[this.currentOrigin] || {};
    }

    // Helper to update permissions for the current active identity and origin
    private async updatePermissionsForOrigin(newPermissions: Record<string, PermissionSetting>): Promise<void> {
        if (!this.activeIdentity) return;
        const did = this.activeIdentity.did;
        if (!this.permissions[did]) {
            this.permissions[did] = {};
        }
        this.permissions[did][this.currentOrigin] = {
            ...(this.permissions[did][this.currentOrigin] || {}),
            ...newPermissions,
        };
        this.saveStateToStorage();
        // TODO: Trigger state update?
    }

    async getAllPermissionsForIdentity(identityDid: string): Promise<Record<string, Record<string, PermissionSetting>>> {
        return this.permissions[identityDid] || {};
    }

    async revokeOriginPermissions(identityDid: string, origin: string): Promise<void> {
        if (this.permissions[identityDid]?.[origin]) {
            console.log(`Revoking all permissions for ${identityDid} at origin ${origin}`);
            delete this.permissions[identityDid][origin];
            this.saveStateToStorage();
            // TODO: Trigger state update?
        }
    }

    // --- UI Interaction Hooks (Called by SDK) ---

    // Placeholder - needs integration with actual UI
    async requestConsent(request: ConsentRequest): Promise<Record<string, PermissionSetting>> {
        console.log("Agent: requestConsent called", request);
        // In real agent, trigger UI modal here and wait for user response
        // For mock, simulate auto-response or wait for a manual trigger
        return new Promise((resolve) => {
            // Simulate user interaction delay/modal display
            setTimeout(() => {
                console.log("Agent: Simulating consent grant based on defaults.");
                const granted = this.simulateConsent(request);
                resolve(granted);
            }, 500); // Simulate delay
        });
    }

    // Placeholder - needs integration with actual UI
    async requestActionConfirmation(request: ActionRequest): Promise<ActionResponse> {
        console.log("Agent: requestActionConfirmation called", request);
        // In real agent, trigger UI modal here and wait for user response
        return new Promise((resolve) => {
            // Simulate user interaction delay/modal display
            setTimeout(() => {
                console.log("Agent: Simulating action confirmation (Allow, don't remember).");
                resolve({ allowed: true, rememberChoice: false }); // Simulate allow, don't remember
            }, 500); // Simulate delay
        });
    }

    // --- Simulation Helpers ---

    // Simulates the consent logic based on defaults (read=always, other=ask)
    private simulateConsent(request: ConsentRequest): Record<string, PermissionSetting> {
        const newGrants: Record<string, PermissionSetting> = {};
        request.requestedPermissions.forEach((perm) => {
            // Use existing grant if available, otherwise default
            const existing = request.existingPermissions[perm];
            if (existing) {
                newGrants[perm] = existing;
            } else if (perm.startsWith("read:")) {
                newGrants[perm] = "always";
            } else {
                newGrants[perm] = "ask"; // Default others to ask
            }
        });
        return newGrants;
    }

    // --- Authentication/Claim ---

    // Updated to accept identity
    private async performAdminClaim(identity: Identity): Promise<void> {
        if (!identity) {
            throw new Error("Cannot perform claim without a valid identity.");
        }

        const messageBytes = new TextEncoder().encode(ADMIN_CLAIM_CODE);
        const signatureBytes = signEd25519(messageBytes, identity.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const url = `${VIBE_CLOUD_BASE_URL}/api/v1/admin/claim`;
        console.log(`Attempting claim to ${url} with DID ${identity.did}`);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    did: identity.did,
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

            this.jwts[identity.did] = responseBody.token; // Store JWT against DID
            console.log(`Admin claim successful for ${identity.did}, JWT obtained.`);
        } catch (error) {
            console.error("Error during admin claim fetch:", error);
            throw error; // Re-throw network or parsing errors
        }
    }

    // Placeholder for claim flow using code
    async claimIdentityWithCode(identityDid: string, claimCode: string): Promise<{ jwt: string }> {
        console.warn("claimIdentityWithCode not fully implemented in mock agent.");
        const identity = this.identities.find((id) => id.did === identityDid);
        if (!identity) throw new Error("Identity not found for claim.");

        // Simulate admin claim logic for now
        await this.performAdminClaim(identity); // Reuses admin claim logic
        this.saveStateToStorage();

        const jwt = this.jwts[identityDid];
        if (!jwt) throw new Error("Claim simulation failed to produce JWT.");
        return { jwt };
    }

    // --- Core Data Methods (Need Permission Checks) ---

    private ensureInitialized(): void {
        // Updated check: Ensure active identity and manifest are present
        if (!this.isInitialized || !this.manifest || !this.activeIdentity) {
            throw new Error("MockVibeAgent not initialized or missing active identity/manifest. Call init() first.");
        }
    }

    // --- API Interaction Helper (Updated for Active Identity JWT) ---
    private async fetchApi<T>(endpoint: string, method: "GET" | "POST" | "PUT" | "DELETE" = "POST", body?: any, skipEnsureInitialized?: boolean): Promise<T> {
        if (!skipEnsureInitialized) {
            this.ensureInitialized(); // Ensures activeIdentity and manifest exist
        }

        const activeJwt = this.activeIdentity ? this.jwts[this.activeIdentity.did] : null;
        if (!activeJwt && !skipEnsureInitialized) {
            // Allow skipping JWT check during init/claim itself
            throw new Error(`No JWT found for active identity: ${this.activeIdentity?.did}`);
        }

        const url = `${VIBE_CLOUD_BASE_URL}${endpoint}`;
        console.log(`Fetching API: ${method} ${url}`, body ? { body } : {});

        const headers: HeadersInit = {
            "Content-Type": "application/json",
            "X-Vibe-App-ID": this.manifest!.appId, // Safe due to ensureInitialized
        };
        if (activeJwt) {
            headers["Authorization"] = `Bearer ${activeJwt}`;
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: headers,
                body: body ? JSON.stringify(body) : undefined,
            });

            if (response.status === 204) {
                console.log(`API Response ${response.status} (No Content) for ${method} ${url}`);
                return null as T;
            }

            const responseBody = await response.json();

            if (!response.ok) {
                console.error(`API Error ${response.status}: ${method} ${url}`, responseBody);
                const errorMessage = responseBody?.error?.details || responseBody?.error || responseBody?.message || `HTTP error ${response.status}`;
                throw new Error(`API request failed: ${errorMessage}`);
            }

            console.log(`API Response ${response.status}: ${method} ${url}`, responseBody);
            return responseBody as T;
        } catch (error) {
            console.error(`Network or parsing error during API fetch: ${method} ${url}`, error);
            if (error instanceof Error) {
                throw new Error(`Network request failed: ${error.message}`);
            } else {
                throw new Error("An unknown network error occurred.");
            }
        }
    }

    // --- Data Methods (Placeholders - Need Permission Logic Integration) ---

    async readOnce<T>(params: ReadParams): Promise<ReadResult<T>> {
        this.ensureInitialized(); // Basic check
        console.log("MockVibeAgent: readOnce calling API with params:", params);
        // TODO: Integrate permission check + action confirmation hook call

        const apiPayload = { collection: params.collection, filter: params.filter || {} };
        try {
            const result = await this.fetchApi<{ docs: T[] }>("/api/v1/data/read", "POST", apiPayload);
            return { ok: true, data: result.docs };
        } catch (error) {
            console.error("readOnce failed:", error);
            return { ok: false, error: error instanceof Error ? error.message : String(error), data: [] };
        }
    }

    async read<T>(params: ReadParams, callback: SubscriptionCallback<T>): Promise<Unsubscribe> {
        this.ensureInitialized();
        const { collection } = params;
        console.log(`MockVibeAgent: read (subscription) requested for collection: ${collection}`);
        // TODO: Integrate permission check + action confirmation hook call
        // TODO: WebSocket logic needs updating for multi-identity JWTs if used

        // --- Existing WebSocket logic (needs review/update) ---
        try {
            await this.ensureWebSocketConnection(); // Needs JWT update potentially
        } catch (error) {
            console.error(`Failed to establish WebSocket connection for ${collection}:`, error);
            callback(error instanceof Error ? error : new Error("WebSocket connection failed"), null);
            return async () => {};
        }
        // ... (rest of WebSocket subscription logic - needs review) ...
        // --- End Existing WebSocket logic ---

        // Placeholder unsubscribe
        return async () => {
            console.log(`Mock Unsubscribe called for ${collection}`);
        };
    }

    async unsubscribe(unsubscribeFn: Unsubscribe): Promise<void> {
        console.log("MockVibeAgent: Calling unsubscribe function.");
        await unsubscribeFn();
    }

    async write<T extends { _id?: string }>(params: WriteParams<T>): Promise<WriteResult> {
        this.ensureInitialized();
        console.log("MockVibeAgent: write calling API with params:", params);
        // TODO: Integrate permission check + action confirmation hook call

        const apiPayload = { collection: params.collection, data: params.data };
        try {
            const result = await this.fetchApi<any>("/api/v1/data/write", "POST", apiPayload);
            // Adapt response (same as before)
            if (Array.isArray(result)) {
                const ids = result.filter((r) => r.ok).map((r) => r.id);
                const errors = result.filter((r) => !r.ok);
                return { ok: errors.length === 0, ids, errors: errors.length > 0 ? errors : undefined };
            } else if (result && result.ok && result.id) {
                return { ok: true, ids: [result.id] };
            } else if (result && !result.ok) {
                return { ok: false, ids: [], errors: [result] };
            } else {
                console.error("Unexpected write API response format:", result);
                return { ok: false, ids: [], errors: [{ error: "unknown", reason: "Unexpected API response format" }] };
            }
        } catch (error) {
            console.error("write failed:", error);
            return { ok: false, ids: [], errors: [{ error: "network_or_parse", reason: error instanceof Error ? error.message : String(error) }] };
        }
    }
}
