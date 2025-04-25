// apps/test/src/vibe/sdk.ts

import { MockVibeAgent } from "./agent";
import type { Account, AppManifest, PermissionSetting, ReadResult, Unsubscribe, VibeAgent, VibeState, WriteResult } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// Interface for the SDK's public API
interface IVibeSDK {
    init(manifest: AppManifest, onStateChange: (state: VibeState) => void): Unsubscribe;
    readOnce(collection: string, filter?: any): Promise<ReadResult>;
    read(collection: string, filter?: any, callback?: (result: ReadResult) => void): Promise<Unsubscribe>;
    write(collection: string, data: any | any[]): Promise<WriteResult>;
    // Potentially add an explicit unsubscribe method if needed later
}

class MockVibeSDK implements IVibeSDK {
    private agent: VibeAgent;
    private state: VibeState = {};
    private onStateChange: ((state: VibeState) => void) | null = null;
    private isInitialized = false;
    private activeSubscriptions: Record<string, Unsubscribe> = {}; // Store agent unsubscribe functions

    constructor() {
        // Instantiate the mock agent
        this.agent = new MockVibeAgent();
        console.log("[MockVibeSDK] Initialized with MockVibeAgent");
    }

    // --- Public API Methods ---

    init(manifest: AppManifest, onStateChange: (state: VibeState) => void): Unsubscribe {
        if (this.isInitialized) {
            console.warn("[MockVibeSDK] Already initialized. Returning existing unsubscribe.");
            // Optionally re-apply manifest/callback or just return
            return this.unsubscribeAll.bind(this);
        }

        console.log("[MockVibeSDK] init called with manifest:", manifest);
        this.onStateChange = onStateChange;

        // Determine initial permissions based on manifest (simple logic for now)
        const permissions = this.determineInitialPermissions(manifest.permissions);

        // Initialize the agent
        this.agent
            .init(manifest)
            .then((account) => {
                console.log("[MockVibeSDK] Mock agent initialized successfully.");
                // Update state and notify listener
                this.updateState({ account, permissions });
                this.isInitialized = true;
            })
            .catch((error) => {
                console.error("[MockVibeSDK] Error initializing mock agent:", error);
                // Handle error state if necessary
            });

        // Return a function to clean up this SDK instance
        return this.unsubscribeAll.bind(this);
    }

    async readOnce(collection: string, filter?: any): Promise<ReadResult> {
        console.log(`[MockVibeSDK] readOnce called for collection: ${collection}`, { filter });
        this.ensureInitialized();

        const permission = this.checkPermission("read", collection);
        if (permission === "never") {
            console.log(`[MockVibeSDK] Permission denied for read:${collection}`);
            throw new Error(`Permission denied to read collection: ${collection}`);
        }
        if (permission === "ask") {
            console.log(`[MockVibeSDK] Permission 'ask' for read:${collection}. Simulating grant.`);
            // In a real SDK, this would trigger a UI prompt via the agent
        }

        // Forward to agent
        return this.agent.readOnce({ collection, filter });
    }

    async read(collection: string, filter?: any, callback?: (result: ReadResult) => void): Promise<Unsubscribe> {
        console.log(`[MockVibeSDK] read (subscription) called for collection: ${collection}`, { filter });
        this.ensureInitialized();

        const permission = this.checkPermission("read", collection);
        if (permission === "never") {
            console.log(`[MockVibeSDK] Permission denied for read:${collection}`);
            throw new Error(`Permission denied to read collection: ${collection}`);
        }
        if (permission === "ask") {
            console.log(`[MockVibeSDK] Permission 'ask' for read:${collection}. Simulating grant.`);
            // Trigger UI prompt simulation if needed
        }

        // Generate a unique ID for this subscription request
        const requestId = `sub_${collection}_${Date.now()}`;

        // Forward to agent, storing the agent's unsubscribe function
        const agentUnsubscribe = await this.agent.read(collection, filter, (result) => {
            console.log(`[MockVibeSDK] Received subscription update for ${requestId}:`, result);
            if (callback) {
                callback(result);
            }
        });

        this.activeSubscriptions[requestId] = agentUnsubscribe;

        // Return an unsubscribe function specific to this request
        const sdkUnsubscribe = () => {
            console.log(`[MockVibeSDK] Unsubscribing from ${requestId}`);
            if (this.activeSubscriptions[requestId]) {
                this.activeSubscriptions[requestId](); // Call agent's unsubscribe
                delete this.activeSubscriptions[requestId];
            }
        };

        return Promise.resolve(sdkUnsubscribe);
    }

    async write(collection: string, data: any | any[]): Promise<WriteResult> {
        console.log(`[MockVibeSDK] write called for collection: ${collection}`, { data });
        this.ensureInitialized();

        const permission = this.checkPermission("write", collection);
        if (permission === "never") {
            console.log(`[MockVibeSDK] Permission denied for write:${collection}`);
            throw new Error(`Permission denied to write collection: ${collection}`);
        }
        if (permission === "ask") {
            console.log(`[MockVibeSDK] Permission 'ask' for write:${collection}. Simulating grant.`);
            // Trigger UI prompt simulation if needed
        }

        // Forward to agent
        return this.agent.write({ collection, data });
    }

    // --- Internal Methods ---

    private updateState(newState: Partial<VibeState>) {
        this.state = { ...this.state, ...newState };
        console.log("[MockVibeSDK] State updated:", this.state);
        if (this.onStateChange) {
            // Provide a copy to prevent mutation
            this.onStateChange({ ...this.state });
        }
    }

    private determineInitialPermissions(requestedPermissions: string[]): Record<string, PermissionSetting> {
        const permissions: Record<string, PermissionSetting> = {};
        requestedPermissions.forEach((permString) => {
            // Simple default: allow reads, ask for writes
            if (permString.startsWith("read:")) {
                permissions[permString] = "always";
            } else if (permString.startsWith("write:")) {
                permissions[permString] = "ask";
            } else {
                permissions[permString] = "ask"; // Default to ask for unknown types
            }
        });
        console.log("[MockVibeSDK] Determined initial permissions:", permissions);
        return permissions;
    }

    private checkPermission(action: "read" | "write", collection: string): PermissionSetting {
        this.ensureInitialized();
        const permString = `${action}:${collection}`;
        const setting = this.state.permissions?.[permString];

        if (!setting) {
            console.warn(`[MockVibeSDK] No permission found for '${permString}'. Defaulting to 'never'.`);
            return "never"; // Or 'ask' depending on desired default behavior
        }
        console.log(`[MockVibeSDK] Permission check for '${permString}': ${setting}`);
        return setting;
    }

    private ensureInitialized() {
        if (!this.isInitialized || !this.state.account) {
            throw new Error("Vibe SDK not initialized. Call init() first.");
        }
    }

    private unsubscribeAll(): void {
        console.log("[MockVibeSDK] Unsubscribing from all active subscriptions.");
        Object.values(this.activeSubscriptions).forEach((unsub) => unsub());
        this.activeSubscriptions = {};
        this.isInitialized = false;
        this.onStateChange = null;
        this.manifest = null;
        this.updateState({ account: undefined, permissions: undefined }); // Clear state
        console.log("[MockVibeSDK] Cleanup complete.");
    }
}

// Export a singleton instance
export const vibe = new MockVibeSDK();

/* eslint-enable @typescript-eslint/no-explicit-any */
/* eslint-enable @typescript-eslint/no-unused-vars */
