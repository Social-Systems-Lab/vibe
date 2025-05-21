// Vibe Browser Extension - Inpage Script (window.vibe API)

// --- Type definitions aligned with IVibeSDK and apps/test/src/vibe/types.ts ---
export interface AppManifest {
    appId: string;
    name: string;
    description?: string;
    pictureUrl?: string;
    permissions: string[];
}

export interface VibeIdentity {
    did: string;
    label: string;
    pictureUrl?: string;
}

export type PermissionSetting = "always" | "ask" | "never";

export interface VibeState {
    isUnlocked: boolean;
    did?: string | null;
    activeIdentity?: VibeIdentity | null;
    identities?: VibeIdentity[];
    permissions?: Record<string, PermissionSetting>;
}

export type Unsubscribe = () => void;

// Expected response structure from INITIALIZE_APP_SESSION
interface InitializeAppSessionResponse {
    initialState: VibeState;
    subscriptionId: string;
}

// Interface for the exposed window.vibe SDK
interface IVibeSDK {
    init: (manifest: AppManifest, onStateChange: (state: VibeState) => void) => Promise<Unsubscribe>;
    readOnce: (collection: string, filter?: any, options?: any) => Promise<any>; // Updated query to filter
    write: (collection: string, data: any, options?: any) => Promise<any>; // Placeholder
    // TODO: Add read with subscription
}

declare global {
    interface Window {
        vibe: IVibeSDK;
    }
}

(() => {
    if (window.vibe) {
        console.warn("Vibe API already injected. Skipping re-injection.");
        return;
    }

    const pendingRequests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }> = new Map();
    // Store for onStateChange callbacks, keyed by subscriptionId
    const stateChangeCallbacks: Map<string, (state: VibeState) => void> = new Map();
    let currentSubscriptionId: string | null = null; // Assuming one init/subscription per page context for now

    function generateRequestId(): string {
        return `vibe-req-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data || !event.data.type) {
            return;
        }

        const { type, requestId, subscriptionId: msgSubscriptionId, payload, error } = event.data;

        if (type === "VIBE_AGENT_RESPONSE" || type === "VIBE_AGENT_RESPONSE_ERROR") {
            if (requestId && pendingRequests.has(requestId)) {
                const promiseCallbacks = pendingRequests.get(requestId);
                if (promiseCallbacks) {
                    if (error) {
                        console.error(`Vibe Inpage: Error for request ${requestId}:`, error);
                        promiseCallbacks.reject(new Error(error.message || JSON.stringify(error)));
                    } else {
                        console.log(`Vibe Inpage: Response for request ${requestId}:`, payload);
                        promiseCallbacks.resolve(payload);
                    }
                    pendingRequests.delete(requestId);
                }
            }
        } else if (type === "VIBE_PAGE_EVENT_STATE_CHANGED") {
            if (msgSubscriptionId && stateChangeCallbacks.has(msgSubscriptionId)) {
                const callback = stateChangeCallbacks.get(msgSubscriptionId);
                if (callback && payload) {
                    console.log(`Vibe Inpage: Received VIBE_PAGE_EVENT_STATE_CHANGED for subId ${msgSubscriptionId}:`, payload);
                    callback(payload as VibeState);
                }
            }
        }
    });

    const vibeSDKHandler: IVibeSDK = {
        init: (manifest: AppManifest, onStateChange: (state: VibeState) => void): Promise<Unsubscribe> => {
            const requestId = generateRequestId();
            // If there's an existing subscription, unsubscribe it first.
            // This simplistic model assumes one active session per page.
            if (currentSubscriptionId && stateChangeCallbacks.has(currentSubscriptionId)) {
                console.warn("Vibe Inpage: Existing subscription found. Unsubscribing before new init.");
                // Call unsubscribe without waiting for it to complete to avoid deadlock if init is called rapidly.
                // The old subscription's callback will just stop being called.
                const oldSubId = currentSubscriptionId;
                window.postMessage(
                    {
                        type: "VIBE_AGENT_REQUEST",
                        requestId: generateRequestId(), // new request for this unsubscribe
                        action: "UNSUBSCRIBE_APP_SESSION",
                        payload: { subscriptionId: oldSubId },
                    },
                    "*"
                );
                stateChangeCallbacks.delete(oldSubId);
            }

            currentSubscriptionId = null; // Clear current subscription ID until new one is established

            return new Promise<Unsubscribe>((resolve, reject) => {
                pendingRequests.set(requestId, {
                    resolve: (responsePayload: InitializeAppSessionResponse) => {
                        if (responsePayload && responsePayload.initialState && responsePayload.subscriptionId) {
                            currentSubscriptionId = responsePayload.subscriptionId;
                            stateChangeCallbacks.set(currentSubscriptionId, onStateChange);
                            onStateChange(responsePayload.initialState); // Initial state delivery

                            const unsubscribe: Unsubscribe = () => {
                                if (!currentSubscriptionId) return Promise.resolve(); // Already unsubscribed or never subscribed
                                const subIdToUnsubscribe = currentSubscriptionId;
                                currentSubscriptionId = null; // Mark as unsubscribed locally
                                stateChangeCallbacks.delete(subIdToUnsubscribe);

                                const unsubRequestId = generateRequestId();
                                return new Promise<void>((resolveUnsub, rejectUnsub) => {
                                    pendingRequests.set(unsubRequestId, { resolve: resolveUnsub, reject: rejectUnsub });
                                    window.postMessage(
                                        {
                                            type: "VIBE_AGENT_REQUEST",
                                            requestId: unsubRequestId,
                                            action: "UNSUBSCRIBE_APP_SESSION",
                                            payload: { subscriptionId: subIdToUnsubscribe },
                                        },
                                        "*"
                                    );
                                });
                            };
                            resolve(unsubscribe);
                        } else {
                            reject(new Error("Invalid payload structure for INITIALIZE_APP_SESSION response."));
                        }
                    },
                    reject,
                });
                window.postMessage(
                    {
                        type: "VIBE_AGENT_REQUEST",
                        requestId,
                        action: "INITIALIZE_APP_SESSION",
                        payload: { manifest }, // Send manifest inside a payload object
                    },
                    "*"
                );
            });
        },

        readOnce: async (collection: string, filter?: any, options?: any): Promise<any> => {
            // Renamed query to filter
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                pendingRequests.set(requestId, { resolve, reject });
                // Ensure payload matches what data.handler.ts expects for filter
                window.postMessage({ type: "VIBE_AGENT_REQUEST", requestId, action: "READ_DATA_ONCE", payload: { collection, filter, options } }, "*");
            });
        },

        async write(collection: string, data: any, options?: any): Promise<any> {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                pendingRequests.set(requestId, { resolve, reject });
                window.postMessage({ type: "VIBE_AGENT_REQUEST", requestId, action: "WRITE_DATA", payload: { collection, data, options } }, "*");
            });
        },
        // TODO: Implement event listener methods (on, off, once)
        // on: (eventName, callback) => { ... }
    };

    window.vibe = vibeSDKHandler;
    console.log("Vibe API injected into page.");

    // Announce that the Vibe API is ready (optional)
    const readyEvent = new CustomEvent("vibeReady");
    window.dispatchEvent(readyEvent);
})();

export {}; // Treat this file as a module
