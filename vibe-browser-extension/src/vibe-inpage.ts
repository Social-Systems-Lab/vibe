// Vibe Browser Extension - Inpage Script (window.vibe API)

interface VibeAppManifest {
    appId: string;
    name: string;
    description?: string;
    pictureUrl?: string; // Optional, HTTPS
    permissions: string[]; // Requested scopes
}

interface InitResponse {
    did: string;
    permissions: Record<string, "always" | "ask" | "never">; // Granted permissions
}

interface VibeAPI {
    init: (manifest: VibeAppManifest) => Promise<InitResponse>;
    readOnce: (collection: string, query?: any, options?: any) => Promise<any>;
    write: (collection: string, data: any, options?: any) => Promise<any>;
    // TODO: Add event listener capabilities (on, off, once)
}

declare global {
    interface Window {
        vibe: VibeAPI;
    }
}

(() => {
    if (window.vibe) {
        console.warn("Vibe API already injected. Skipping re-injection.");
        return;
    }

    const pendingRequests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }> = new Map();

    function generateRequestId(): string {
        return `vibe-req-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    // Listen for responses from the content script
    window.addEventListener("message", (event) => {
        // We only accept messages from ourselves (content script acting as proxy)
        if (event.source !== window || !event.data || !event.data.type) {
            return;
        }

        const { type, requestId, payload, error } = event.data;

        if (type === "VIBE_AGENT_RESPONSE" || type === "VIBE_AGENT_RESPONSE_ERROR") {
            if (requestId && pendingRequests.has(requestId)) {
                const promiseCallbacks = pendingRequests.get(requestId);
                if (promiseCallbacks) {
                    if (error) {
                        console.error(`Vibe Inpage: Error for request ${requestId}:`, error);
                        promiseCallbacks.reject(new Error(error.message || error));
                    } else {
                        console.log(`Vibe Inpage: Response for request ${requestId}:`, payload);
                        promiseCallbacks.resolve(payload);
                    }
                    pendingRequests.delete(requestId);
                }
            }
        } else if (type.startsWith("VIBE_PAGE_EVENT_")) {
            // Example: VIBE_PAGE_EVENT_IDENTITY_CHANGED
            // TODO: Implement proper event emitter for window.vibe
            console.log("Vibe Inpage: Received page event:", event.data);
            const customEvent = new CustomEvent(type, { detail: payload });
            window.dispatchEvent(customEvent); // Or a custom event bus on window.vibe
        }
    });

    const vibeApiHandler = {
        async init(manifest: VibeAppManifest): Promise<InitResponse> {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                pendingRequests.set(requestId, { resolve, reject });
                window.postMessage({ type: "VIBE_AGENT_REQUEST", requestId, action: "init", payload: manifest }, "*");
            });
        },

        async readOnce(collection: string, query?: any, options?: any): Promise<any> {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                pendingRequests.set(requestId, { resolve, reject });
                window.postMessage({ type: "VIBE_AGENT_REQUEST", requestId, action: "readOnce", payload: { collection, query, options } }, "*");
            });
        },

        async write(collection: string, data: any, options?: any): Promise<any> {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                pendingRequests.set(requestId, { resolve, reject });
                window.postMessage({ type: "VIBE_AGENT_REQUEST", requestId, action: "write", payload: { collection, data, options } }, "*");
            });
        },
        // TODO: Implement event listener methods (on, off, once)
        // on: (eventName, callback) => { ... }
    };

    window.vibe = vibeApiHandler;
    console.log("Vibe API injected into page.");

    // Announce that the Vibe API is ready (optional)
    const readyEvent = new CustomEvent("vibeReady");
    window.dispatchEvent(readyEvent);
})();

export {}; // Treat this file as a module
