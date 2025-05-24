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

// Added ReadResult to be used by IVibeSDK.read
export interface ReadResult<T = any> {
    ok: boolean;
    data?: T;
    error?: string;
    // Additional fields like pagination info can be added here if needed
}

// Interface for the exposed window.vibe SDK
interface IVibeSDK {
    init: (manifest: AppManifest, onStateChange: (state: VibeState) => void) => Promise<Unsubscribe>;
    readOnce: (collection: string, filter?: any, options?: any) => Promise<ReadResult<any>>;
    read: (collection: string, filter?: any, callback?: (result: ReadResult<any>) => void) => Promise<Unsubscribe>;
    write: (collection: string, data: any, options?: any) => Promise<any>;
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
    // Store for onStateChange callbacks from init, keyed by appSessionSubscriptionId
    const appStateCallbacks: Map<string, (state: VibeState) => void> = new Map();
    let currentAppSessionSubscriptionId: string | null = null; // For the main app state subscription from init

    // Store for data subscription callbacks from sdk.read, keyed by dataSubscriptionId
    const dataSubscriptionCallbacks: Map<string, (result: ReadResult<any>) => void> = new Map();

    function generateRequestId(): string {
        return `vibe-req-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data || !event.data.type) {
            return;
        }

        const { type, requestId, subscriptionId: msgSubscriptionId, payload, error, action } = event.data;

        if (type === "VIBE_AGENT_RESPONSE" || type === "VIBE_AGENT_RESPONSE_ERROR") {
            if (requestId && pendingRequests.has(requestId)) {
                const promiseCallbacks = pendingRequests.get(requestId);
                if (promiseCallbacks) {
                    if (error) {
                        console.error(`Vibe Inpage: Error for request ${requestId} (action: ${action}):`, error);
                        promiseCallbacks.reject(new Error(error.message || JSON.stringify(error)));
                    } else {
                        console.log(`Vibe Inpage: Response for request ${requestId} (action: ${action}):`, payload);
                        promiseCallbacks.resolve(payload);
                    }
                    pendingRequests.delete(requestId);
                }
            }
        } else if (type === "VIBE_PAGE_EVENT_STATE_CHANGED") {
            if (msgSubscriptionId && appStateCallbacks.has(msgSubscriptionId)) {
                // Uses appStateCallbacks
                const callback = appStateCallbacks.get(msgSubscriptionId);
                if (callback && payload) {
                    console.log(`Vibe Inpage: Received VIBE_PAGE_EVENT_STATE_CHANGED for appStateSubId ${msgSubscriptionId}:`, payload);
                    callback(payload as VibeState);
                }
            }
        } else if (type === "VIBE_SUBSCRIPTION_UPDATE" || type === "VIBE_SUBSCRIPTION_ERROR") {
            // New handler for data subscription updates
            if (msgSubscriptionId && dataSubscriptionCallbacks.has(msgSubscriptionId)) {
                const callback = dataSubscriptionCallbacks.get(msgSubscriptionId);
                if (callback) {
                    // The actual data array is in event.data.data for VIBE_SUBSCRIPTION_UPDATE
                    // The 'payload' destructured above would be undefined if event.data.payload doesn't exist.
                    // 'error' is correctly destructured if present at the top level of event.data.
                    const actualData = event.data.data; // Use event.data.data for the notes array
                    const anError = event.data.error; // Use event.data.error for the error object

                    console.log(`Vibe Inpage: Received ${type} for dataSubId ${msgSubscriptionId}:`, actualData, anError);

                    const result: ReadResult<any> = {
                        ok: !anError, // ok is true if there's no error
                        data: actualData,
                        error: anError ? anError.message || JSON.stringify(anError) : undefined,
                    };
                    callback(result);
                }
                // For VIBE_SUBSCRIPTION_ERROR, the app might choose to unsubscribe based on this.
                // The callback itself is not removed here, allowing retries or specific error handling in the app.
            }
        }
    });

    const vibeSDKHandler: IVibeSDK = {
        init: (manifest: AppManifest, onStateChange: (state: VibeState) => void): Promise<Unsubscribe> => {
            const requestId = generateRequestId();
            if (currentAppSessionSubscriptionId && appStateCallbacks.has(currentAppSessionSubscriptionId)) {
                console.warn("Vibe Inpage: Existing app state subscription found. Unsubscribing before new init.");
                const oldSubId = currentAppSessionSubscriptionId;
                window.postMessage(
                    {
                        type: "VIBE_AGENT_REQUEST",
                        requestId: generateRequestId(),
                        action: "UNSUBSCRIBE_APP_SESSION", // This is for the main app state, not data subscriptions
                        payload: { subscriptionId: oldSubId },
                    },
                    "*"
                );
                appStateCallbacks.delete(oldSubId);
            }
            currentAppSessionSubscriptionId = null;

            return new Promise<Unsubscribe>((resolve, reject) => {
                pendingRequests.set(requestId, {
                    resolve: (responsePayload: InitializeAppSessionResponse) => {
                        if (responsePayload && responsePayload.initialState && responsePayload.subscriptionId) {
                            currentAppSessionSubscriptionId = responsePayload.subscriptionId;
                            appStateCallbacks.set(currentAppSessionSubscriptionId, onStateChange);
                            onStateChange(responsePayload.initialState);

                            const unsubscribe: Unsubscribe = () => {
                                if (!currentAppSessionSubscriptionId) return Promise.resolve();
                                const subIdToUnsubscribe = currentAppSessionSubscriptionId;
                                currentAppSessionSubscriptionId = null;
                                appStateCallbacks.delete(subIdToUnsubscribe);

                                const unsubRequestId = generateRequestId();
                                return new Promise<void>((resolveUnsub, rejectUnsub) => {
                                    pendingRequests.set(unsubRequestId, { resolve: resolveUnsub, reject: rejectUnsub });
                                    window.postMessage(
                                        {
                                            type: "VIBE_AGENT_REQUEST",
                                            requestId: unsubRequestId,
                                            action: "UNSUBSCRIBE_APP_SESSION", // This is for the main app state
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
                        payload: { manifest },
                    },
                    "*"
                );
            });
        },

        readOnce: async (collection: string, filter?: any, options?: any): Promise<ReadResult<any>> => {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                pendingRequests.set(requestId, { resolve, reject });
                window.postMessage({ type: "VIBE_AGENT_REQUEST", requestId, action: "READ_DATA_ONCE", payload: { collection, filter, options } }, "*");
            });
        },

        read: async (collection: string, filter?: any, callback?: (result: ReadResult<any>) => void): Promise<Unsubscribe> => {
            if (!callback) {
                return Promise.reject(new Error("A callback is required for sdk.read() subscriptions."));
            }

            const requestId = generateRequestId(); // For the initial request to get subscriptionId

            return new Promise<Unsubscribe>((resolve, reject) => {
                pendingRequests.set(requestId, {
                    resolve: (responsePayload: { ok: boolean; subscriptionId?: string; initialData?: any[]; error?: string }) => {
                        if (responsePayload.ok && responsePayload.subscriptionId) {
                            const dataSubId = responsePayload.subscriptionId;
                            dataSubscriptionCallbacks.set(dataSubId, callback);

                            // Deliver initial data if provided by the background handler
                            if (responsePayload.initialData) {
                                // Ensure the callback receives a ReadResult
                                callback({ ok: true, data: responsePayload.initialData });
                            }

                            const unsubscribe: Unsubscribe = () => {
                                dataSubscriptionCallbacks.delete(dataSubId);
                                const unsubRequestId = generateRequestId();
                                return new Promise<void>((resolveUnsub, rejectUnsub) => {
                                    pendingRequests.set(unsubRequestId, { resolve: resolveUnsub, reject: rejectUnsub });
                                    window.postMessage(
                                        {
                                            type: "VIBE_AGENT_REQUEST",
                                            requestId: unsubRequestId,
                                            action: "VIBE_UNSUBSCRIBE_DATA_SUBSCRIPTION",
                                            payload: { subscriptionId: dataSubId },
                                        },
                                        "*"
                                    );
                                });
                            };
                            resolve(unsubscribe);
                        } else {
                            reject(new Error(responsePayload.error || "Failed to establish data subscription."));
                        }
                    },
                    reject,
                });

                window.postMessage(
                    {
                        type: "VIBE_AGENT_REQUEST",
                        requestId,
                        action: "VIBE_READ_DATA_SUBSCRIPTION",
                        payload: { collection, filter },
                    },
                    "*"
                );
            });
        },

        write: async (collection: string, data: any, options?: any): Promise<any> => {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                pendingRequests.set(requestId, { resolve, reject });
                window.postMessage({ type: "VIBE_AGENT_REQUEST", requestId, action: "WRITE_DATA", payload: { collection, data, options } }, "*");
            });
        },
    };

    window.vibe = vibeSDKHandler;
    console.log("Vibe API injected into page.");

    // Announce that the Vibe API is ready (optional)
    const readyEvent = new CustomEvent("vibeReady");
    window.dispatchEvent(readyEvent);
})();

export {}; // Treat this file as a module
