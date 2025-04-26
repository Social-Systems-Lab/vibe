// apps/test/src/vibe/sdk.ts

import { MockVibeAgent } from "./agent";
// Import necessary types, including new ones
import type {
    Account,
    AppManifest,
    PermissionSetting,
    ReadParams,
    ReadResult,
    Unsubscribe,
    VibeAgent,
    VibeState,
    WriteResult,
    Identity, // Added
    ActionRequest, // Added (Potentially needed if SDK orchestrates prompts)
    ActionResponse, // Added (Potentially needed if SDK orchestrates prompts)
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */ // Keep this if some imports aren't used yet

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
    private state: VibeState = { identities: [], activeIdentity: null }; // Initialize with defaults
    private onStateChange: ((state: VibeState) => void) | null = null;
    private isInitialized = false;
    private currentManifest: AppManifest | null = null; // Store manifest for context
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
        this.currentManifest = manifest; // Store manifest

        // Initialize the agent - it now handles identity creation, claims, and initial consent simulation/check
        this.agent
            .init(manifest)
            .then(({ account, permissions, activeIdentity, identities }) => {
                // Agent init now returns the full initial state
                console.log("[MockVibeSDK] Mock agent initialized successfully. State:", { account, permissions, activeIdentity, identities });
                // Update SDK state with everything received from the agent
                this.updateState({
                    account: account ?? undefined, // Use ?? to handle null explicitly
                    permissions: permissions ?? undefined,
                    activeIdentity: activeIdentity ?? undefined,
                    identities: identities ?? [],
                });
                this.isInitialized = true;
            })
            .catch((error) => {
                console.error("[MockVibeSDK] Error during agent initialization:", error);
                // Update state to reflect failure
                this.updateState({ account: undefined, permissions: undefined, activeIdentity: undefined, identities: [] });
                this.isInitialized = false;
            });

        // Return a function to clean up this SDK instance (unsubscribeAll)
        return this.unsubscribeAll.bind(this);
    }

    async readOnce(collection: string, filter?: any): Promise<ReadResult> {
        console.log(`[MockVibeSDK] readOnce called for collection: ${collection}`, { filter });
        this.ensureInitialized(); // Checks if SDK is initialized and has active identity

        // Agent's readOnce will handle permission checks (local) and trigger UI prompts if needed
        try {
            const result = await this.agent.readOnce({ collection, filter });
            console.log(`[MockVibeSDK] readOnce result for ${collection}:`, result);
            return result;
        } catch (error) {
            console.error(`[MockVibeSDK] Error during agent.readOnce for ${collection}:`, error);
            // Re-throw permission errors or other agent errors
            throw error;
        }
    }

    async read(collection: string, filter?: any, callback?: (result: ReadResult) => void): Promise<Unsubscribe> {
        console.log(`[MockVibeSDK] read (subscription) called for collection: ${collection}`, { filter });
        this.ensureInitialized();

        // Agent's read will handle permission checks and UI prompts
        try {
            const readParams: ReadParams = { collection, filter };
            // The agent's read method now directly handles the callback adaptation if needed,
            // or the SDK adapts it here. Let's assume agent handles it for simplicity now.
            // We need to store the unsubscribe function returned by the agent.
            const agentUnsubscribe = await this.agent.read(readParams, (error, data) => {
                // This callback receives raw data/error from the agent (e.g., WebSocket)
                console.log(`[MockVibeSDK] Agent subscription update for ${collection}:`, { error, data });
                if (callback) {
                    // Adapt to the ReadResult format expected by the app's callback
                    const result: ReadResult = {
                        ok: !error,
                        data: data || [],
                        error: error ? error.message : undefined,
                    };
                    callback(result);
                }
            });

            // Store the unsubscribe function returned by the agent, maybe keyed differently if needed
            const subId = `sub_${collection}_${Date.now()}`; // Simple unique ID
            this.activeSubscriptions[subId] = agentUnsubscribe;

            // Return an SDK-specific unsubscribe function
            const sdkUnsubscribe = async () => {
                console.log(`[MockVibeSDK] SDK Unsubscribing from ${subId} (${collection})`);
                if (this.activeSubscriptions[subId]) {
                    await this.agent.unsubscribe(this.activeSubscriptions[subId]); // Call agent's specific unsubscribe method
                    delete this.activeSubscriptions[subId];
                }
            };
            return sdkUnsubscribe;
        } catch (error) {
            console.error(`[MockVibeSDK] Error during agent.read for ${collection}:`, error);
            throw error;
        }
    }

    async write(collection: string, data: any | any[]): Promise<WriteResult> {
        console.log(`[MockVibeSDK] write called for collection: ${collection}`, { data });
        this.ensureInitialized();

        // Agent's write will handle permission checks and UI prompts
        try {
            const result = await this.agent.write({ collection, data });
            console.log(`[MockVibeSDK] write result for ${collection}:`, result);
            return result;
        } catch (error) {
            console.error(`[MockVibeSDK] Error during agent.write for ${collection}:`, error);
            throw error;
        }
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

    // Removed determineInitialPermissions - Agent handles this now
    // Removed checkPermission - Agent handles this now

    private ensureInitialized() {
        // Updated check: Ensure SDK is initialized and has an active identity
        if (!this.isInitialized || !this.state.activeIdentity) {
            throw new Error("Vibe SDK not initialized or no active identity. Call init() first.");
        }
    }

    private unsubscribeAll(): void {
        console.log("[MockVibeSDK] Unsubscribing from all active SDK subscriptions.");
        // Call the specific unsubscribe method on the agent for each stored function
        Object.values(this.activeSubscriptions).forEach((agentUnsubscribe) => {
            this.agent.unsubscribe(agentUnsubscribe).catch((err) => console.error("Error during agent unsubscribe:", err));
        });
        this.activeSubscriptions = {};
        this.isInitialized = false;
        this.onStateChange = null;
        this.currentManifest = null;
        // Clear the state more thoroughly
        this.updateState({ account: undefined, permissions: undefined, activeIdentity: undefined, identities: [] });
        console.log("[MockVibeSDK] Cleanup complete.");
    }

    // --- TODO: Add methods to interact with agent's identity/permission management if needed ---
    // e.g., switchIdentity(did), createIdentity(label), etc.
    // These would call corresponding agent methods and likely trigger state updates.
}

// Export a singleton instance of the SDK
const vibeSDKInstance = new MockVibeSDK();
export const vibe = vibeSDKInstance;

// Expose the agent instance for connection purposes (e.g., in VibeProvider)
// This is a specific pattern for this mock setup.
export const mockAgentInstance = vibeSDKInstance["agent"];

/* eslint-enable @typescript-eslint/no-explicit-any */
/* eslint-enable @typescript-eslint/no-unused-vars */
