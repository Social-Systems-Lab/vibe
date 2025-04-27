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
    }): void {
        console.log("[MockVibeAgent] Setting UI handlers.");
        this.uiRequestConsent = handlers.requestConsent;
        this.uiRequestActionConfirmation = handlers.requestActionConfirmation;
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
                console.log("No identities found. User must create one via UI.");
                // await this.createIdentity("Default Identity"); // <-- REMOVED: Don't auto-create
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

    // --- UI Interaction Hooks (Called by SDK/Internal Logic) ---
    // These now use the injected UI handlers

    // Public methods required by the VibeAgent interface
    async requestConsent(request: ConsentRequest): Promise<Record<string, PermissionSetting>> {
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

    // --- Simulation Helpers (Keep simulateConsent for init default logic) ---

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
                newGrants[perm] = "always"; // TODO: should be ask Default others to ask
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

    // --- Effect to Connect UI Handlers and Define window.vibe ---
    useEffect(() => {
        console.log("[AgentProvider] Setting UI handlers and defining window.vibe");

        // 1. Connect UI Handlers
        agent.setUIHandlers({ requestConsent, requestActionConfirmation });

        // 2. Define window.vibe SDK Interface
        // This simulates the agent injecting the SDK into the page
        const sdkInterface = {
            init: async (manifest: AppManifest, onStateChange: (state: VibeState) => void): Promise<Unsubscribe> => {
                console.log("[window.vibe] init called", manifest);
                try {
                    // Agent's init now returns the initial state directly
                    const initialState = await agent.init(manifest);
                    console.log("[window.vibe] Agent init successful, initial state:", initialState);
                    // Adapt nulls to undefined for VibeState compatibility
                    onStateChange({
                        account: initialState.account ?? undefined,
                        permissions: initialState.permissions ?? undefined,
                        activeIdentity: initialState.activeIdentity ?? undefined,
                        identities: initialState.identities,
                    }); // Send initial state to VibeProvider

                    // TODO: Implement proper state change subscription in MockVibeAgent
                    // For now, the agent doesn't push updates. VibeProvider will need to re-fetch state
                    // after identity changes etc. This is a limitation of the current mock.
                    console.warn("[window.vibe] Mock SDK does not currently push state updates after init.");

                    // Return a mock unsubscribe function
                    const unsubscribe = () => {
                        console.log("[window.vibe] unsubscribe called (mock)");
                        // In a real scenario, this would tell the agent to clean up resources for this app.
                        // The agent might close WebSockets, clear listeners, etc.
                        // For the mock, we might clear the manifest association in the agent?
                    };
                    return unsubscribe;
                } catch (error) {
                    console.error("[window.vibe] Agent init failed:", error);
                    // Notify VibeProvider of the error state (ensure null -> undefined)
                    const currentIdentities = await agent.getIdentities();
                    const currentActiveIdentity = await agent.getActiveIdentity();
                    onStateChange({
                        identities: currentIdentities,
                        activeIdentity: currentActiveIdentity ?? undefined, // Correctly handle null
                        // account and permissions will be implicitly undefined
                    });
                    throw error; // Re-throw error so VibeProvider knows init failed
                }
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
    }, [agent, requestConsent, requestActionConfirmation]);

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
    };

    return (
        <AgentContext.Provider value={contextValue}>
            {children}
            {/* Render Modals controlled by this context */}
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
