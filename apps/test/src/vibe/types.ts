// apps/test/src/vibe/types.ts

/**
 * Defines the permissions an application requests.
 */
export interface AppManifest {
    appId: string; // Unique identifier for the app (matches X-Vibe-App-ID header)
    name: string; // Display name of the app
    description?: string; // Optional description
    pictureUrl?: string; // Optional URL for an app icon/logo
    permissions: string[]; // Array of permission strings (e.g., "read:notes", "write:tasks")
}

/**
 * Represents the user's account information provided by the Vibe Agent.
 */
export interface Account {
    userDid: string; // The user's Decentralized Identifier
    // Add other relevant account details here as needed
}

/**
 * Represents the possible permission settings for a specific permission string.
 * - always: The action is allowed without prompting.
 * - ask: The user must be prompted before the action is allowed.
 * - never: The action is denied.
 */
export type PermissionSetting = "always" | "ask" | "never";

/**
 * Represents the overall state managed by the Vibe SDK.
 */
export interface VibeState {
    account?: Account; // Current user account, if authenticated/initialized
    permissions?: Record<string, PermissionSetting>; // Permissions granted by the user for the app
    // Add other state properties like connection status, errors, etc.
}

// --- Agent Interface & Related Types ---

/**
 * Parameters for read operations.
 */
export interface ReadParams {
    collection: string;
    filter?: {
        ids?: string[];
        // Add other filter options like query, limit, sort etc. as needed
    };
}

/**
 * Parameters for write operations.
 */
export interface WriteParams<T = any> {
    collection: string;
    data: T | T[]; // Single document or array of documents
}

/**
 * Callback function type for subscriptions.
 * Receives error (if any) and data (if successful).
 */
export type SubscriptionCallback<T = any> = (error: Error | null, data: T[] | null) => void;

/**
 * Type for the unsubscribe function returned by subscription methods like `read`.
 */
export type Unsubscribe = () => void;

/**
 * Represents the result of a read operation (readOnce or read subscription update).
 * Made generic to type the data array.
 */
export interface ReadResult<T = any> {
    ok: boolean; // Indicates success or failure
    data: T[]; // Array of documents matching the query
    error?: string; // Error message if ok is false
    // Potentially add metadata like count, cursor, etc.
}

/**
 * Represents the result of a write operation.
 */
export interface WriteResult {
    ok: boolean; // Indicates if the overall operation was successful (might be false even with partial success in bulk)
    ids: string[]; // IDs of the successfully created/updated documents
    errors?: { id?: string; error: string; reason: string }[]; // Detailed errors for specific documents if any occurred
}

/**
 * Interface defining the expected methods of a Vibe Agent.
 * This is implemented by MockVibeAgent or a real agent connection module.
 */
export interface VibeAgent {
    init(manifest: AppManifest): Promise<void>;
    readOnce<T>(params: ReadParams): Promise<ReadResult<T>>;
    read<T>(params: ReadParams, callback: SubscriptionCallback<T>): Promise<Unsubscribe>;
    unsubscribe(unsubscribeFn: Unsubscribe): Promise<void>; // Changed to accept the function itself
    write<T extends { _id?: string }>(params: WriteParams<T>): Promise<WriteResult>;
}
