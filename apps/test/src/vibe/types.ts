// apps/test/src/vibe/types.ts

/**
 * Defines the permissions an application requests.
 */
export interface AppManifest {
    id: string; // Unique identifier for the app
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

/**
 * Type for the unsubscribe function returned by subscription methods like `read`.
 */
export type Unsubscribe = () => void;

/**
 * Represents the result of a read operation (readOnce or read subscription update).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReadResult {
    docs: any[]; // Array of documents matching the query
    // Potentially add metadata like count, cursor, etc.
}

/**
 * Represents the result of a write operation.
 */
export interface WriteResult {
    ok: boolean; // Indicates if the write was successful
    ids?: string[]; // IDs of the created/updated documents
    errors?: any[]; // Any errors encountered during the write
}
/* eslint-enable @typescript-eslint/no-explicit-any */
