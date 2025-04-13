/**
 * Vibe SDK - Core functionality for interacting with the Vibe Agent.
 *
 * NOTE: This is currently a placeholder implementation for Iteration 1.
 *       It does not yet communicate with the Vibe Agent.
 *       In Iteration 2/3, REST/WebSocket calls will be added directly to Vibe Cloud.
 *       In later iterations, this will be replaced with Agent communication logic.
 */
import type { WsAgentToServerMessage, WsServerToAgentMessage } from "@vibe/shared-types";

// --- Placeholder Types ---
// Replace with actual types from shared-types when available/needed
type VibeWriteResponse = any;
type VibeReadResponse = any;
type VibeSubscriptionCallback = (data: any) => void;
interface VibeSubscriptionHandle {
    unsubscribe: () => void;
}
interface RequestPermissionsOptions {
    permissions: string[];
}

// --- Placeholder State ---
let isAgentAvailableChecked = false;
let isAgentAvailableResult = false; // Assume unavailable initially
let temporaryAuthToken: string | null = null; // For Iteration 2/3 direct calls

// --- Placeholder API ---

/**
 * Checks if the Vibe Agent extension is installed and available.
 * (Placeholder: Returns false)
 */
export async function isAgentAvailable(): Promise<boolean> {
    console.log("[Vibe SDK Placeholder] isAgentAvailable called");
    if (!isAgentAvailableChecked) {
        // In a real implementation, this would message the extension
        isAgentAvailableResult = false; // Simulate check result
        isAgentAvailableChecked = true;
    }
    return isAgentAvailableResult;
}

/**
 * Requests permissions from the user via the Vibe Agent.
 * (Placeholder: Returns false)
 */
export async function requestPermissions(options: RequestPermissionsOptions): Promise<boolean> {
    console.log("[Vibe SDK Placeholder] requestPermissions called with:", options);
    // In a real implementation, this would message the agent
    return false; // Simulate denial
}

/**
 * Writes data to a specified collection in the Vibe Cloud via the Agent.
 * (Placeholder: Logs and returns dummy data)
 * (Iteration 2: Will call Vibe Cloud REST API directly)
 */
export async function write(collection: string, data: object | object[]): Promise<VibeWriteResponse> {
    console.log(`[Vibe SDK Placeholder] write called for collection '${collection}':`, data);
    // In Iteration 2: Add fetch call to POST /data/{collection} with temporaryAuthToken
    if (!temporaryAuthToken && collection !== "temp") {
        // Allow temp writes without token for testing
        console.warn("[Vibe SDK Placeholder] No auth token set for write operation.");
        // In Iteration 2, throw or return error if no token
    }
    return { success: true, ids: ["placeholder-id-1"] }; // Dummy response
}

/**
 * Reads data once from a specified collection via the Agent.
 * (Placeholder: Logs and returns empty array)
 * (Iteration 2: Will call Vibe Cloud REST API directly)
 */
export async function readOnce(collection: string, filter?: object): Promise<VibeReadResponse> {
    console.log(`[Vibe SDK Placeholder] readOnce called for collection '${collection}' with filter:`, filter);
    // In Iteration 2: Add fetch call to GET /data/{collection}/_once with temporaryAuthToken
    if (!temporaryAuthToken && collection !== "temp") {
        console.warn("[Vibe SDK Placeholder] No auth token set for readOnce operation.");
        // In Iteration 2, throw or return error if no token
    }
    return []; // Dummy response
}

/**
 * Subscribes to real-time data updates for a collection via the Agent.
 * (Placeholder: Logs and returns dummy unsubscribe)
 * (Iteration 3: Will establish direct WebSocket connection)
 */
export async function read(collection: string, filter: object | undefined, callback: VibeSubscriptionCallback): Promise<VibeSubscriptionHandle> {
    console.log(`[Vibe SDK Placeholder] read (subscribe) called for collection '${collection}' with filter:`, filter);
    const sdkCallbackId = `callback_${Date.now()}_${Math.random()}`;
    console.log(` -> Generated sdkCallbackId: ${sdkCallbackId}`);
    // In Iteration 3: Establish WebSocket, send subscribe message
    if (!temporaryAuthToken && collection !== "temp") {
        console.warn("[Vibe SDK Placeholder] No auth token set for read (subscribe) operation.");
        // In Iteration 3, handle error if no token
    }

    // Simulate receiving confirmation and storing callback
    const subscriptionId = `sub_${Date.now()}`;
    console.log(` -> Simulated confirmation received with subscriptionId: ${subscriptionId}`);

    // Dummy unsubscribe function
    const unsubscribe = () => {
        console.log(`[Vibe SDK Placeholder] unsubscribe called for subscriptionId: ${subscriptionId}`);
        // In Iteration 3: Send unsubscribe message over WebSocket
    };

    return { unsubscribe };
}

/**
 * [Temporary for Iteration 2/3] Sets the auth token for direct API calls.
 */
export function _setTemporaryAuthToken(token: string | null): void {
    console.log(`[Vibe SDK Placeholder] Setting temporary auth token.`);
    temporaryAuthToken = token;
}

// --- Export the API ---
export const vibe = {
    isAgentAvailable,
    requestPermissions,
    write,
    readOnce,
    read,
    _setTemporaryAuthToken, // Expose temporary function
};

export default vibe;
