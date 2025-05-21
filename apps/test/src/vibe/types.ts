// apps/test/src/vibe/types.ts

/**
 * Defines the permissions an application requests.
 */
export interface AppManifest {
    appId: string; // Unique identifier for the app (matches X-Vibe-App-ID header)
    name: string; // Display name of the app
    description?: string; // Optional description
    pictureUrl?: string; // Optional URL for an app icon/logo
    iconUrl?: string; // Optional URL to an icon for the app (used by Vibe Agent)
    permissions: string[]; // Array of permission strings (e.g., "read:notes", "write:tasks")
}

import type { Ed25519KeyPair } from "../lib/identity";

// --- Identity Management Types ---

/**
 * Represents a single user identity managed by the agent.
 */
export interface Identity extends Ed25519KeyPair {
    did: string;
    label: string;
    pictureUrl?: string;
    // Add other identity-specific details if needed
}

/**
 * Represents a single note.
 */
export interface Note {
    _id?: string; // Unique identifier, usually assigned by the backend/storage
    title: string;
    content: string;
    createdAt?: string; // ISO 8601 date string
    updatedAt?: string; // ISO 8601 date string
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
    activeIdentity?: Identity | null; // The currently selected identity
    identities?: Identity[]; // All available identities
    permissions?: Record<string, PermissionSetting>; // Permissions granted for the active identity and current origin
    // Add other state properties like connection status, errors, etc.
}

// --- UI Interaction Types ---

/**
 * Details needed for the Consent Modal.
 */
export interface ConsentRequest {
    manifest: AppManifest;
    origin: string; // The origin requesting permission
    requestedPermissions: string[]; // Specific permissions being requested now
    existingPermissions: Record<string, PermissionSetting>; // Current settings for comparison
    newPermissions?: string[]; // Optional: Permissions requested that are not in existingPermissions
}

/**
 * Details needed for the Action Prompt Modal.
 */
export interface ActionRequest {
    actionType: "read" | "write";
    origin: string;
    collection: string;
    filter?: any; // For read
    data?: any | any[]; // For write
    identity: Identity; // Identity performing the action
    appInfo: { name: string; pictureUrl?: string }; // Requesting app info
}

/**
 * Response from the Action Prompt Modal.
 */
export interface ActionResponse {
    allowed: boolean;
    rememberChoice?: boolean; // If true, update permission from 'ask' to 'always'/'never'
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
    // --- Initialization & Setup ---
    setUIHandlers(handlers: {
        // Method for UI layer to inject handlers
        requestConsent: (request: ConsentRequest) => Promise<Record<string, PermissionSetting>>;
        requestActionConfirmation: (request: ActionRequest) => Promise<ActionResponse>;
    }): void;
    init(manifest: AppManifest): Promise<{ permissions: Record<string, PermissionSetting> | null; activeIdentity: Identity | null; identities: Identity[] }>;
    getVibeState(): Promise<VibeState>; // Method to get current agent state if needed

    // --- Identity Management ---
    createIdentity(label: string, pictureUrl?: string): Promise<Identity>;
    setActiveIdentity(did: string): Promise<void>;
    getIdentities(): Promise<Identity[]>;
    getActiveIdentity(): Promise<Identity | null>;

    // --- Permission Management ---
    getPermission(identityDid: string, origin: string, scope: string): Promise<PermissionSetting | null>;
    setPermission(identityDid: string, origin: string, scope: string, setting: PermissionSetting): Promise<void>;
    getAllPermissionsForIdentity(identityDid: string): Promise<Record<string, Record<string, PermissionSetting>>>; // origin -> scope -> setting
    revokeOriginPermissions(identityDid: string, origin: string): Promise<void>;

    // --- UI Interaction Hooks (Called by SDK) ---
    requestConsent(request: ConsentRequest): Promise<Record<string, PermissionSetting>>; // Returns the newly set permissions
    requestActionConfirmation(request: ActionRequest): Promise<ActionResponse>;

    // --- Data Operations (Called by SDK after permission checks/prompts) ---
    readOnce<T>(params: ReadParams): Promise<ReadResult<T>>;
    read<T>(params: ReadParams, callback: SubscriptionCallback<T>): Promise<Unsubscribe>;
    unsubscribe(unsubscribeFn: Unsubscribe): Promise<void>;
    write<T extends { _id?: string }>(params: WriteParams<T>): Promise<WriteResult>;

    // --- Authentication/Claim ---
    claimIdentityWithCode(identityDid: string, claimCode: string): Promise<{ jwt: string }>; // Returns JWT for the identity
}
