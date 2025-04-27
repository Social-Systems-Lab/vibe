// apps/test/src/vibe/agent.tsx - Renamed from ui-context.tsx
// This provider now simulates the Vibe Agent itself, managing identities,
// permissions (internally), UI prompts, and providing the `window.vibe` SDK interface.

import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react"; // Import ReactNode as a type
// Removed import { MockVibeAgent } from "./agent";
// Consolidated imports for both class and provider:
import type {
    VibeAgent, // Added
    Account, // Added
    SubscriptionCallback, // Added
    ReadParams, // Added
    WriteParams, // Added
    ConsentRequest,
    ActionRequest,
    ActionResponse,
    PermissionSetting,
    Identity,
    AppManifest,
    VibeState,
    ReadResult,
    WriteResult,
    Unsubscribe,
} from "./types";
import { generateEd25519KeyPair, signEd25519, didFromEd25519, uint8ArrayToHex, type Ed25519KeyPair, hexToUint8Array } from "../lib/identity"; // Added
import { Buffer } from "buffer"; // Added
import * as ed from "@noble/ed25519"; // Added

import { ConsentModal } from "../components/agent/ConsentModal";
import { ActionPromptModal } from "../components/agent/ActionPromptModal";
import { InitPrompt } from "../components/agent/InitPrompt"; // Added import

// --- Constants for MockVibeAgent ---
const VIBE_CLOUD_BASE_URL = "http://127.0.0.1:3001"; // 3001 = backen run outside docker, 3000=backend in docker
const ADMIN_CLAIM_CODE = "ABC1-XYZ9"; // From vibe-cloud/.env
const LOCAL_STORAGE_KEY_PREFIX = "vibe_agent_";
const LOCAL_STORAGE_IDENTITIES_KEY = `${LOCAL_STORAGE_KEY_PREFIX}identities`;
const LOCAL_STORAGE_ACTIVE_DID_KEY = `${LOCAL_STORAGE_KEY_PREFIX}active_did`;
const LOCAL_STORAGE_PERMISSIONS_KEY = `${LOCAL_STORAGE_KEY_PREFIX}permissions`;
const LOCAL_STORAGE_JWT_KEY = `${LOCAL_STORAGE_KEY_PREFIX}jwts`; // Store JWTs per identity DID

// --- MockVibeAgent Class Definition (Moved from agent.ts) ---
/**
 * Mock implementation of the VibeAgent interface.
 * Manages identities, permissions locally, and simulates UI interactions.
 */
class MockVibeAgent implements VibeAgent {
    // --- State ---
    private identities: Identity[] = [];
    private activeIdentity: Identity | null = null;
    // Permissions structure: identityDID -> origin -> scope -> setting
    private permissions: Record<string, Record<string, Record<string, PermissionSetting>>> = {};
    // JWTs structure: identityDID -> jwt
    private jwts: Record<string, string> = {};

    private manifest: AppManifest | null = null; // Current app manifest
    private currentOrigin: string = window.location.origin; // Origin of the app using the agent

    // --- UI Interaction Callbacks (Injected by UI Layer) ---
    private uiRequestConsent: ((request: ConsentRequest) => Promise<Record<string, PermissionSetting>>) | null = null;
    private uiRequestActionConfirmation: ((request: ActionRequest) => Promise<ActionResponse>) | null = null;
    private uiRequestInitPrompt: ((manifest: AppManifest) => Promise<void>) | null = null; // Added for Scenario 1

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
        // this.clearStateFromStorage(); // Uncomment to clear state on each instantiation (for testing)
        this.loadStateFromStorage(); // Load identities, active DID, permissions, JWTs
    }

    // Method for UI Layer to inject its prompt functions
    public setUIHandlers(handlers: {
        requestConsent: (request: ConsentRequest) => Promise<Record<string, PermissionSetting>>;
        requestActionConfirmation: (request: ActionRequest) => Promise<ActionResponse>;
        requestInitPrompt: (manifest: AppManifest) => Promise<void>; // Added
    }): void {
        console.log("[MockVibeAgent] Setting UI handlers.");
        this.uiRequestConsent = handlers.requestConsent;
        this.uiRequestActionConfirmation = handlers.requestActionConfirmation;
        this.uiRequestInitPrompt = handlers.requestInitPrompt; // Added
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
            // --- Step 1: Check for Active Identity ---
            if (!this.activeIdentity) {
                // If no identity is active (might happen on first load or after clearing storage),
                // we cannot proceed with app-specific init. The user needs to select/create one first.
                // The AgentProvider should handle showing the IdentityPanel.
                // We return a state indicating no active identity, but don't throw an error here,
                // as the VibeProvider might still want to show the app shell.
                console.warn("[MockVibeAgent.init] No active identity. Waiting for user selection.");
                // Return current state without account/permissions
                const state = await this.getCurrentStateForSdk(false); // Pass false to skip active identity check
                this.isInitialized = false; // Not fully initialized for the app yet
                this.isInitializing = false;
                return state;
                // OLD: throw new Error("No active identity selected. Cannot initialize application.");
            }
            const identity = this.activeIdentity; // Use the active identity

            // --- Step 2: Ensure Active Identity has JWT (Claim if needed) ---
            // This remains important for backend interactions
            if (!this.jwts[identity.did]) {
                console.log(`JWT missing for active identity ${identity.did}, attempting claim...`);
                try {
                    await this.performAdminClaim(identity);
                    this.saveStateToStorage(); // Save JWT
                } catch (claimError) {
                    console.error("Claim failed during init:", claimError);
                    // Proceeding without JWT might break data operations, but let init continue for now
                }
            }

            // --- Step 3: Determine Initialization Scenario based on Permissions ---
            const existingPermissions = this.permissions[identity.did]?.[this.currentOrigin] || {};
            const hasExistingPermissions = Object.keys(existingPermissions).length > 0;
            const requestedPermissions = new Set(manifest.permissions);
            const grantedPermissions = new Set(Object.keys(existingPermissions));
            const newPermissions = manifest.permissions.filter((p) => !grantedPermissions.has(p));
            // Removed permissions are those in grantedPermissions but not in requestedPermissions
            // const removedPermissions = Object.keys(existingPermissions).filter(p => !requestedPermissions.has(p));

            let scenario: "new" | "update" | "no_change" = "no_change";
            if (!hasExistingPermissions) {
                scenario = "new";
            } else if (newPermissions.length > 0) {
                scenario = "update";
            }

            console.log(`[MockVibeAgent.init] Scenario determined: ${scenario}`, { hasExistingPermissions, newPermissions });

            // --- Step 4: Execute Scenario Logic ---
            let finalPermissions = { ...existingPermissions }; // Start with existing

            if (scenario === "new") {
                // Scenario 1: New App - Show Init Prompt, then Consent Modal
                console.log("[MockVibeAgent.init] New application registration required.");
                if (!this.uiRequestInitPrompt || !this.uiRequestConsent) {
                    throw new Error("UI handlers for InitPrompt or Consent are not set.");
                }
                // 1. Show the initial prompt (Google One-Tap style)
                await this.uiRequestInitPrompt(manifest); // This promise resolves when the user clicks the prompt

                // 2. User clicked prompt, now show the full consent modal
                const consentRequest: ConsentRequest = {
                    manifest,
                    origin: this.currentOrigin,
                    requestedPermissions: manifest.permissions,
                    existingPermissions: {}, // None exist yet
                    newPermissions: manifest.permissions, // All are new
                };
                const granted = await this.triggerConsentUI(consentRequest); // Use the existing trigger method
                finalPermissions = granted; // Update permissions based on consent result
                await this.updatePermissionsForOrigin(finalPermissions); // Save granted permissions
                console.log("[MockVibeAgent.init] New app consent granted.");
            } else if (scenario === "update") {
                // Scenario 3: Existing App, New Permissions Requested - Show Consent Modal directly
                console.log("[MockVibeAgent.init] Application requires updated permissions:", newPermissions);
                if (!this.uiRequestConsent) {
                    throw new Error("UI handler for Consent is not set.");
                }
                const consentRequest: ConsentRequest = {
                    manifest,
                    origin: this.currentOrigin,
                    requestedPermissions: manifest.permissions, // Ask for the full current set
                    existingPermissions: existingPermissions,
                    newPermissions: newPermissions, // Highlight these
                };
                const granted = await this.triggerConsentUI(consentRequest);
                finalPermissions = granted; // Update permissions based on consent result
                await this.updatePermissionsForOrigin(finalPermissions); // Save updated permissions
                console.log("[MockVibeAgent.init] Updated app consent granted.");
            } else {
                // Scenario 2: Existing App, No Changes or Only Removals
                // Optional: Handle removed permissions (e.g., revoke them) - For now, we just accept the current manifest
                console.log("[MockVibeAgent.init] Application already registered with sufficient permissions.");
                // We might want to update the stored permissions to remove ones no longer in the manifest,
                // but for now, we'll just use the existing ones that cover the manifest's needs.
                // finalPermissions remains existingPermissions
            }

            // --- Step 5: Finalize Initialization ---
            this.isInitialized = true; // Mark as initialized *for this app*
            console.log("MockVibeAgent: Initialization complete for this app.");
            // Return the final state based on the outcome
            return this.getCurrentStateForSdk(); // Get state based on active identity and final permissions
        } catch (error) {
            console.error("MockVibeAgent: Initialization failed:", error);
            this.isInitialized = false;
            // Return state indicating failure (no account/permissions) but keep identities
            const state = await this.getCurrentStateForSdk(false); // Get state without requiring active identity
            return { ...state, account: null, permissions: null };
        } finally {
            this.isInitializing = false;
        }
    }

    // Helper to get state formatted for SDK init/update
    // Added optional flag to skip active identity check during early init stages or failures
    private async getCurrentStateForSdk(requireActiveIdentity = true): Promise<{
        account: Account | null;
        permissions: Record<string, PermissionSetting> | null;
        activeIdentity: Identity | null;
        identities: Identity[];
    }> {
        const identity = this.activeIdentity;
        if (requireActiveIdentity && !identity) {
            // This case should ideally be handled before calling this helper in final stages
            console.warn("getCurrentStateForSdk called requires active identity, but none found.");
            return { account: null, permissions: null, activeIdentity: null, identities: this.identities };
        }

        const account = identity ? { userDid: identity.did } : null;
        // Only return permissions if an identity is active
        const permissions = identity ? this.permissions[identity.did]?.[this.currentOrigin] || {} : null;

        return {
            account,
            permissions,
            activeIdentity: identity, // Return the active identity (or null if none)
            identities: this.identities,
        };
    }

    async getVibeState(): Promise<VibeState> {
        const state = await this.getCurrentStateForSdk(); // Uses the updated implementation above
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

    // --- UI Interaction Hooks (Called by SDK/Internal Logic) ---
    // These now use the injected UI handlers

    // Public methods required by the VibeAgent interface
    async requestConsent(request: ConsentRequest): Promise<Record<string, PermissionSetting>> {
        // This is now primarily called directly by AgentProvider for Scenario 3,
        // or indirectly via triggerConsentUI for Scenario 1.
        return this.triggerConsentUI(request);
    }

    async requestActionConfirmation(request: ActionRequest): Promise<ActionResponse> {
        return this.triggerActionConfirmationUI(request);
    }

    // Internal trigger methods that use the injected handlers
    private async triggerConsentUI(request: ConsentRequest): Promise<Record<string, PermissionSetting>> {
        console.log("[MockVibeAgent] Triggering Consent UI via callback", request);
        if (!this.uiRequestConsent) {
            console.error("[MockVibeAgent] uiRequestConsent handler not set!");
            // Fallback: Simulate denial or throw error? Throwing is safer.
            throw new Error("Consent UI handler not available.");
        }
        try {
            const result = await this.uiRequestConsent(request);
            console.log("[MockVibeAgent] Consent UI result:", result);
            return result;
        } catch (error) {
            console.error("[MockVibeAgent] Consent UI request failed:", error);
            throw error; // Re-throw denial or other errors
        }
    }

    // Added trigger for the new Init Prompt (Scenario 1)
    private async triggerInitPromptUI(manifest: AppManifest): Promise<void> {
        console.log("[MockVibeAgent] Triggering Init Prompt UI via callback", manifest);
        if (!this.uiRequestInitPrompt) {
            console.error("[MockVibeAgent] uiRequestInitPrompt handler not set!");
            throw new Error("Init Prompt UI handler not available.");
        }
        try {
            // This promise resolves when the user clicks the prompt, allowing init to proceed to consent.
            await this.uiRequestInitPrompt(manifest);
            console.log("[MockVibeAgent] Init Prompt UI interaction complete (user clicked).");
        } catch (error) {
            console.error("[MockVibeAgent] Init Prompt UI request failed:", error);
            throw error; // Re-throw error if the prompt itself fails/is dismissed incorrectly
        }
    }

    private async triggerActionConfirmationUI(request: ActionRequest): Promise<ActionResponse> {
        console.log("[MockVibeAgent] Triggering Action Confirmation UI via callback", request);
        if (!this.uiRequestActionConfirmation) {
            console.error("[MockVibeAgent] uiRequestActionConfirmation handler not set!");
            throw new Error("Action Confirmation UI handler not available.");
        }
        // No try/catch needed here as the promise resolves with ActionResponse (allowed: false) on denial
        const result = await this.uiRequestActionConfirmation(request);
        console.log("[MockVibeAgent] Action Confirmation UI result:", result);
        return result;
    }

    // --- Simulation Helpers REMOVED ---
    // We no longer simulate consent; we trigger the actual UI flow.
    // private simulateConsent(...) { ... }

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

    // --- Data Methods (Integrating Permission Checks) ---

    async readOnce<T>(params: ReadParams): Promise<ReadResult<T>> {
        this.ensureInitialized(); // Basic check: has active identity & manifest
        const { collection, filter } = params;
        const scope = `read:${collection}`;
        const identity = this.activeIdentity!; // Safe due to ensureInitialized
        const origin = this.currentOrigin;

        console.log(`[MockVibeAgent] readOnce requested for ${scope}`);

        let permission = await this.getPermission(identity.did, origin, scope);

        if (permission === "never") {
            console.log(`[MockVibeAgent] Permission denied for ${scope}`);
            throw new Error(`Permission denied to ${scope}`);
        }

        if (permission === "ask") {
            console.log(`[MockVibeAgent] Permission 'ask' for ${scope}. Requesting confirmation...`);
            const actionRequest: ActionRequest = {
                actionType: "read",
                origin: origin,
                collection: collection,
                filter: filter,
                identity: identity,
                appInfo: { name: this.manifest?.name ?? "App", pictureUrl: this.manifest?.pictureUrl },
            };
            const confirmation = await this.triggerActionConfirmationUI(actionRequest);

            if (!confirmation.allowed) {
                console.log(`[MockVibeAgent] User denied action confirmation for ${scope}`);
                if (confirmation.rememberChoice) {
                    await this.setPermission(identity.did, origin, scope, "never");
                }
                throw new Error(`User denied permission for ${scope}`);
            }

            if (confirmation.rememberChoice) {
                await this.setPermission(identity.did, origin, scope, "always");
                permission = "always"; // Update effective permission for this call
            }
            // If allowed (and maybe remembered), proceed...
        }

        // If permission is 'always' or was granted via 'ask'
        console.log(`[MockVibeAgent] Permission granted for ${scope}. Calling fetchApi...`);
        const apiPayload = { collection, filter: filter || {} };
        try {
            const result = await this.fetchApi<{ docs: T[] }>("/api/v1/data/read", "POST", apiPayload);
            return { ok: true, data: result.docs };
        } catch (error) {
            console.error(`readOnce fetchApi failed for ${scope}:`, error);
            // Don't return error in data field, use error property
            return { ok: false, error: error instanceof Error ? error.message : String(error), data: [] };
        }
    }

    async read<T>(params: ReadParams, callback: SubscriptionCallback<T>): Promise<Unsubscribe> {
        this.ensureInitialized();
        const { collection, filter } = params;
        const scope = `read:${collection}`;
        const identity = this.activeIdentity!;
        const origin = this.currentOrigin;

        console.log(`[MockVibeAgent] read (subscription) requested for ${scope}`);

        // --- Permission Check (Similar to readOnce) ---
        let permission = await this.getPermission(identity.did, origin, scope);
        if (permission === "never") {
            console.log(`[MockVibeAgent] Permission denied for subscription ${scope}`);
            throw new Error(`Permission denied for subscription ${scope}`);
        }
        if (permission === "ask") {
            console.log(`[MockVibeAgent] Permission 'ask' for subscription ${scope}. Requesting confirmation...`);
            const actionRequest: ActionRequest = {
                actionType: "read", // Treat subscription start as a 'read' action for prompt
                origin: origin,
                collection: collection,
                filter: filter,
                identity: identity,
                appInfo: { name: this.manifest?.name ?? "App", pictureUrl: this.manifest?.pictureUrl },
            };
            const confirmation = await this.triggerActionConfirmationUI(actionRequest);
            if (!confirmation.allowed) {
                console.log(`[MockVibeAgent] User denied subscription confirmation for ${scope}`);
                if (confirmation.rememberChoice) {
                    await this.setPermission(identity.did, origin, scope, "never");
                }
                throw new Error(`User denied permission for subscription ${scope}`);
            }
            if (confirmation.rememberChoice) {
                await this.setPermission(identity.did, origin, scope, "always");
                permission = "always";
            }
        }
        // --- End Permission Check ---

        console.log(`[MockVibeAgent] Permission granted for subscription ${scope}. Setting up...`);
        // TODO: WebSocket logic needs updating for multi-identity JWTs if used
        // For now, bypass WebSocket and return a mock subscription

        // --- Mock Subscription (No WebSocket) ---
        console.warn("[MockVibeAgent] read subscription using mock implementation (no WebSocket).");
        // Simulate initial fetch
        this.readOnce<T>(params)
            .then((result) => {
                if (result.ok) callback(null, result.data);
                else callback(new Error(result.error || "Initial fetch failed"), null);
            })
            .catch((err) => callback(err, null));
        // Mock unsubscribe
        const unsubscribe = async () => {
            console.log(`[MockVibeAgent] Mock Unsubscribe called for ${collection}`);
        };
        return unsubscribe;
        // --- End Mock Subscription ---

        // --- Original WebSocket logic (needs review/update if re-enabled) ---
        /*
        try {
            await this.ensureWebSocketConnection(); // Needs JWT update potentially
        } catch (error) {
            console.error(`Failed to establish WebSocket connection for ${collection}:`, error);
            callback(error instanceof Error ? error : new Error("WebSocket connection failed"), null);
            return async () => {};
        }
        */
        /*
        try {
            await this.ensureWebSocketConnection(); // Needs JWT update potentially
        } catch (error) {
            console.error(`Failed to establish WebSocket connection for ${collection}:`, error);
            callback(error instanceof Error ? error : new Error("WebSocket connection failed"), null);
            return async () => {};
        }

        // Perform initial readOnce via HTTP (already done above for permission check, could optimize)
        console.log(`Performing initial readOnce for subscription '${collection}'...`);
        try {
            const initialResult = await this.readOnce<T>(params); // Call the permission-checked version
            if (initialResult.ok) {
                callback(null, initialResult.data); // Send initial data
            } else {
                console.error(`Initial readOnce failed for ${collection}: ${initialResult.error}`);
                callback(new Error(initialResult.error || "Initial read failed"), null);
                // Don't proceed with WS subscription if initial read fails? Or allow?
                // For now, let's stop here if initial read fails after permission grant.
                 return async () => {}; // Return no-op unsubscribe
            }
        } catch (error) {
             console.error(`Error during initial readOnce for ${collection}:`, error);
             callback(error instanceof Error ? error : new Error("Unknown error during initial fetch"), null);
             return async () => {}; // Return no-op unsubscribe
        }


        // Register subscription and send WS message
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            console.log(`WebSocket open, sending subscribe message for ${collection}`);
            this.subscriptions.set(collection, callback);
            this.sendWebSocketMessage({ action: "subscribe", collection });
        } else {
            console.log(`WebSocket not open yet, adding ${collection} to pending subscriptions`);
            this.pendingSubscriptions.set(collection, callback);
        }

        console.log(`MockVibeAgent: Subscription request processed for '${collection}'.`);

        // Return unsubscribe function
        const unsubscribe = async () => {
            console.log(`Unsubscribing from collection '${collection}'...`);
            this.subscriptions.delete(collection);
            this.pendingSubscriptions.delete(collection); // Remove if it was pending
            this.sendWebSocketMessage({ action: "unsubscribe", collection });
        };
        return unsubscribe;
        */
        // --- End Original WebSocket logic ---
    }

    async unsubscribe(unsubscribeFn: Unsubscribe): Promise<void> {
        console.log("MockVibeAgent: Calling unsubscribe function.");
        await unsubscribeFn();
    }

    async write<T extends { _id?: string }>(params: WriteParams<T>): Promise<WriteResult> {
        this.ensureInitialized();
        const { collection, data } = params;
        const scope = `write:${collection}`;
        const identity = this.activeIdentity!;
        const origin = this.currentOrigin;

        console.log(`[MockVibeAgent] write requested for ${scope}`);

        // --- Permission Check ---
        let permission = await this.getPermission(identity.did, origin, scope);
        if (permission === "never") {
            console.log(`[MockVibeAgent] Permission denied for ${scope}`);
            throw new Error(`Permission denied to ${scope}`);
        }
        if (permission === "ask") {
            console.log(`[MockVibeAgent] Permission 'ask' for ${scope}. Requesting confirmation...`);
            const actionRequest: ActionRequest = {
                actionType: "write",
                origin: origin,
                collection: collection,
                data: data, // Include data for preview
                identity: identity,
                appInfo: { name: this.manifest?.name ?? "App", pictureUrl: this.manifest?.pictureUrl },
            };
            const confirmation = await this.triggerActionConfirmationUI(actionRequest);
            if (!confirmation.allowed) {
                console.log(`[MockVibeAgent] User denied action confirmation for ${scope}`);
                if (confirmation.rememberChoice) {
                    await this.setPermission(identity.did, origin, scope, "never");
                }
                throw new Error(`User denied permission for ${scope}`);
            }
            if (confirmation.rememberChoice) {
                await this.setPermission(identity.did, origin, scope, "always");
                permission = "always";
            }
        }
        // --- End Permission Check ---

        console.log(`[MockVibeAgent] Permission granted for ${scope}. Calling fetchApi...`);
        const apiPayload = { collection, data };
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
            console.error(`write fetchApi failed for ${scope}:`, error);
            return { ok: false, ids: [], errors: [{ error: "network_or_parse", reason: error instanceof Error ? error.message : String(error) }] };
        }
    }
}

// --- Agent React Context & Provider ---

// Define the shape of the Agent's context value (for Agent UI components like IdentityPanel)
interface AgentContextValue {
    // Agent State (exposed to Agent UI)
    identities: Identity[];
    activeIdentity: Identity | null;

    // Agent Actions (called by Agent UI)
    createIdentity: (label: string, pictureUrl?: string) => Promise<Identity | null>;
    setActiveIdentity: (did: string) => Promise<void>;
    // TODO: Add methods for managing permissions if needed in UI (e.g., openPermissionManager)

    // UI Prompt State (Internal to AgentProvider, but needed for modals)
    isConsentOpen: boolean;
    consentRequest: ConsentRequest | null;
    isActionPromptOpen: boolean;
    actionRequest: ActionRequest | null;
    isInitPromptOpen: boolean; // Added
    initPromptManifest: AppManifest | null; // Added
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

interface AgentProviderProps {
    children: ReactNode;
}

export function AgentProvider({ children }: AgentProviderProps) {
    // --- Agent Instance ---
    // Instantiate the MockVibeAgent. Use useMemo to ensure it's created only once.
    const agent = useMemo(() => new MockVibeAgent(), []);

    // --- Agent State (Managed by this Provider) ---
    const [identities, setIdentities] = useState<Identity[]>([]);
    const [activeIdentity, _setActiveIdentityState] = useState<Identity | null>(null); // Renamed state setter

    // --- UI Prompt State ---
    const [isConsentOpen, setIsConsentOpen] = useState(false);
    const [consentRequest, setConsentRequest] = useState<ConsentRequest | null>(null);
    const [consentResolver, setConsentResolver] = useState<((result: Record<string, PermissionSetting> | null) => void) | null>(null);

    const [isActionPromptOpen, setIsActionPromptOpen] = useState(false);
    const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null);
    const [actionResolver, setActionResolver] = useState<((result: ActionResponse) => void) | null>(null);

    const [isInitPromptOpen, setIsInitPromptOpen] = useState(false); // Added
    const [initPromptManifest, setInitPromptManifest] = useState<AppManifest | null>(null); // Added
    const [initPromptResolver, setInitPromptResolver] = useState<(() => void) | null>(null); // Added (resolves when prompt is clicked)

    // --- Effect to Load Initial Agent State ---
    useEffect(() => {
        const loadInitialState = async () => {
            try {
                // Agent loads from localStorage internally, just get the initial values
                const initialIdentities = await agent.getIdentities();
                const initialActiveIdentity = await agent.getActiveIdentity();
                setIdentities(initialIdentities);
                _setActiveIdentityState(initialActiveIdentity); // Use state setter
                console.log("[AgentProvider] Initial agent state loaded:", { initialIdentities, initialActiveIdentity });
            } catch (error) {
                console.error("[AgentProvider] Error loading initial agent state:", error);
            }
        };
        loadInitialState();
    }, [agent]); // Run only once when agent instance is created

    // --- UI Interaction Logic (requestConsent, requestActionConfirmation) ---
    // These are passed to the agent instance via setUIHandlers
    const requestConsent = useCallback((request: ConsentRequest): Promise<Record<string, PermissionSetting>> => {
        return new Promise((resolve, reject) => {
            console.log("[AgentProvider] requestConsent called by agent instance", request);
            setConsentRequest(request);
            setIsConsentOpen(true);
            setConsentResolver(() => (result: Record<string, PermissionSetting> | null) => {
                setIsConsentOpen(false);
                setConsentRequest(null);
                setConsentResolver(null);
                if (result) {
                    console.log("[AgentProvider] Consent granted by user", result);
                    resolve(result);
                } else {
                    console.log("[AgentProvider] Consent denied by user");
                    reject(new Error("User denied consent request."));
                }
            });
        });
    }, []); // Empty dependency array: these functions don't depend on component state directly

    const handleConsentDecision = (grantedPermissions: Record<string, PermissionSetting> | null) => {
        if (consentResolver) {
            consentResolver(grantedPermissions);
        }
    };

    const requestActionConfirmation = useCallback((request: ActionRequest): Promise<ActionResponse> => {
        return new Promise((resolve) => {
            console.log("[AgentProvider] requestActionConfirmation called by agent instance", request);
            setActionRequest(request);
            setIsActionPromptOpen(true);
            setActionResolver(() => (result: ActionResponse) => {
                setIsActionPromptOpen(false);
                setActionRequest(null);
                setActionResolver(null);
                console.log("[AgentProvider] Action confirmation decision by user", result);
                resolve(result);
            });
        });
    }, []); // Empty dependency array

    const handleActionDecision = (response: ActionResponse) => {
        if (actionResolver) {
            actionResolver(response);
        }
    };

    // Added: Handler for the Init Prompt (Scenario 1)
    const requestInitPrompt = useCallback((manifest: AppManifest): Promise<void> => {
        return new Promise((resolve) => {
            console.log("[AgentProvider] requestInitPrompt called by agent instance", manifest);
            setInitPromptManifest(manifest);
            setIsInitPromptOpen(true);
            // This resolver is called when the user *clicks* the prompt, allowing init to proceed to consent
            setInitPromptResolver(() => () => {
                setIsInitPromptOpen(false); // Hide prompt after click
                setInitPromptManifest(null);
                setInitPromptResolver(null);
                console.log("[AgentProvider] Init prompt clicked by user");
                resolve(); // Resolve the promise to signal the agent to continue
            });
            // Note: No reject case needed here unless the prompt itself can fail/be dismissed
        });
    }, []); // Empty dependency array

    // Added: Handler for when the InitPrompt component is clicked by the user
    const handleInitPromptClick = () => {
        if (initPromptResolver) {
            initPromptResolver(); // This resolves the promise in requestInitPrompt
        }
    };

    // --- Effect to Connect UI Handlers and Define window.vibe ---
    useEffect(() => {
        console.log("[AgentProvider] Setting UI handlers and defining window.vibe");

        // 1. Connect UI Handlers
        agent.setUIHandlers({ requestConsent, requestActionConfirmation, requestInitPrompt }); // Added requestInitPrompt

        // 2. Define window.vibe SDK Interface
        // This simulates the agent injecting the SDK into the page
        const sdkInterface = {
            init: (manifest: AppManifest, onStateChange: (state: VibeState) => void): Promise<Unsubscribe> => {
                console.log("[window.vibe] init called", manifest);
                // Wrap the agent.init call in a new promise to control when onStateChange is called
                return new Promise(async (resolve, reject) => {
                    try {
                        // Agent's init now handles the scenarios and UI prompts internally.
                        // It returns the *final* state after any necessary consent.
                        const finalState = await agent.init(manifest);
                        console.log("[window.vibe] Agent init successful, final state:", finalState);

                        // Check if initialization was actually successful (e.g., user didn't deny consent)
                        // We determine success by checking if an activeIdentity and account exist in the final state.
                        // If the user denied consent or there's no active identity, init technically "failed" from the app's perspective.
                        if (finalState.activeIdentity && finalState.account) {
                            // Adapt nulls to undefined for VibeState compatibility before calling onStateChange
                            onStateChange({
                                account: finalState.account ?? undefined,
                                permissions: finalState.permissions ?? undefined,
                                activeIdentity: finalState.activeIdentity ?? undefined,
                                identities: finalState.identities,
                            }); // Send final state ONLY on success

                            // TODO: Implement proper state change subscription in MockVibeAgent
                            console.warn("[window.vibe] Mock SDK does not currently push state updates after init.");

                            // Return a mock unsubscribe function
                            const unsubscribe = () => {
                                console.log("[window.vibe] unsubscribe called (mock)");
                                // In a real scenario, this would tell the agent to clean up resources for this app.
                            };
                            resolve(unsubscribe); // Resolve the main promise with the unsubscribe function
                        } else {
                            // Initialization didn't fully complete (e.g., no active identity, consent denied)
                            // Send a state update indicating no active session, but don't throw an error here,
                            // let the VibeProvider handle the lack of activeIdentity/account.
                            console.warn("[window.vibe] Agent init completed but no active session established (no active identity or consent denied).");
                            onStateChange({
                                identities: finalState.identities,
                                activeIdentity: undefined,
                                account: undefined,
                                permissions: undefined,
                            });
                            // Still resolve the promise, but maybe with a different signal or just no-op unsubscribe?
                            // Resolving allows the VibeProvider to know the init attempt finished.
                            const unsubscribe = () => {
                                console.log("[window.vibe] unsubscribe called (mock, init incomplete)");
                            };
                            resolve(unsubscribe);
                            // Or reject? Rejecting might be better to signal failure clearly to VibeProvider.
                            // Let's try rejecting.
                            // reject(new Error("Initialization failed: No active identity or consent denied."));
                        }
                    } catch (error) {
                        console.error("[window.vibe] Agent init threw an error:", error);
                        // Notify VibeProvider of the error state
                        const currentIdentities = await agent.getIdentities(); // Get current identities even on error
                        onStateChange({
                            identities: currentIdentities,
                            activeIdentity: undefined,
                            account: undefined,
                            permissions: undefined,
                        });
                        reject(error); // Reject the main promise
                    }
                });
            },
            readOnce: async (collection: string, filter?: any): Promise<ReadResult> => {
                console.log(`[window.vibe] readOnce called: ${collection}`, filter);
                return agent.readOnce({ collection, filter });
            },
            read: async (collection: string, filter?: any, callback?: (result: ReadResult) => void): Promise<Unsubscribe> => {
                console.log(`[window.vibe] read called: ${collection}`, filter);
                // Agent's read now expects the callback format (error | null, data | null)
                const agentCallback = (error: Error | null, data: any | null) => {
                    if (callback) {
                        const result: ReadResult = { ok: !error, data: data || [], error: error?.message };
                        callback(result);
                    }
                };
                return agent.read({ collection, filter }, agentCallback);
            },
            write: async (collection: string, data: any | any[]): Promise<WriteResult> => {
                console.log(`[window.vibe] write called: ${collection}`, data);
                return agent.write({ collection, data });
            },
            // --- Expose Agent methods needed by VibeProvider (SHOULD NOT BE NEEDED after refactor) ---
            // getVibeState: async (): Promise<VibeState> => {
            //     console.log("[window.vibe] getVibeState called (should be internal to agent)");
            //     return agent.getVibeState();
            // }
        };

        // Assign to window
        (window as any).vibe = sdkInterface;

        // Cleanup function: Remove window.vibe when provider unmounts
        return () => {
            console.log("[AgentProvider] Cleaning up: Removing window.vibe");
            delete (window as any).vibe;
            // Optional: Tell agent to clean up? Depends on agent's design.
        };
        // Dependencies: agent instance and the stable callback functions
    }, [agent, requestConsent, requestActionConfirmation, requestInitPrompt]); // Added requestInitPrompt dependency

    // --- Agent Actions (Called by UI Components like IdentityPanel) ---
    const createIdentity = useCallback(
        async (label: string, pictureUrl?: string): Promise<Identity | null> => {
            console.log("[AgentProvider] createIdentity called", { label, pictureUrl });
            try {
                const newIdentity = await agent.createIdentity(label, pictureUrl);
                // Refresh local state after creation
                const updatedIdentities = await agent.getIdentities();
                const updatedActiveIdentity = await agent.getActiveIdentity(); // Active might change if it was the first
                setIdentities(updatedIdentities);
                _setActiveIdentityState(updatedActiveIdentity); // Use state setter
                console.log("[AgentProvider] Identity created, state updated", { newIdentity, updatedIdentities, updatedActiveIdentity });
                return newIdentity;
            } catch (error) {
                console.error("[AgentProvider] Error creating identity:", error);
                return null;
            }
        },
        [agent] // Depends only on the agent instance
    );

    const setActiveIdentity = useCallback(
        async (did: string): Promise<void> => {
            console.log("[AgentProvider] setActiveIdentity called", { did });
            try {
                await agent.setActiveIdentity(did);
                // Refresh local state after switching
                const updatedActiveIdentity = await agent.getActiveIdentity();
                _setActiveIdentityState(updatedActiveIdentity); // Use renamed state setter
                console.log("[AgentProvider] Active identity switched, state updated", { updatedActiveIdentity });
                // TODO: Should ideally trigger a state update via window.vibe.onStateChange
                // For now, VibeProvider might need to manually re-init or re-fetch on identity change.
            } catch (error) {
                console.error("[AgentProvider] Error setting active identity:", error);
            }
        },
        [agent] // Depends only on the agent instance
    );

    // --- Context Value for Agent UI ---
    const contextValue: AgentContextValue = {
        identities,
        activeIdentity,
        createIdentity,
        setActiveIdentity,
        // Pass through modal state needed for rendering
        isConsentOpen,
        consentRequest,
        isActionPromptOpen,
        actionRequest,
        isInitPromptOpen, // Added
        initPromptManifest, // Added
    };

    return (
        <AgentContext.Provider value={contextValue}>
            {children}
            {/* Render Modals controlled by this context */}
            <InitPrompt isOpen={isInitPromptOpen} manifest={initPromptManifest} onClick={handleInitPromptClick} />
            <ConsentModal isOpen={isConsentOpen} request={consentRequest} onDecision={handleConsentDecision} />
            <ActionPromptModal isOpen={isActionPromptOpen} request={actionRequest} onDecision={handleActionDecision} />
        </AgentContext.Provider>
    );
}

// Renamed hook for Agent UI components
export function useAgent() {
    const context = useContext(AgentContext);
    if (context === undefined) {
        throw new Error("useAgent must be used within an AgentProvider");
    }
    return context;
}
