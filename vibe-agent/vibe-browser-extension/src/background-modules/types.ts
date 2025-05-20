// Placeholder Identity type - should align with control plane's IdentitySchema
// This is the structure often stored in the vault or coming from CP.
export interface AgentIdentity {
    identityDid: string; // This is the primary DID
    derivationPath?: string; // Added to match vault structure
    isAdmin: boolean;
    profile_name?: string; // Matching vault storage
    profile_picture?: string; // Matching vault storage
    instanceId?: string;
    instanceStatus?: string; // Should match IdentityInstanceStatus type from CP models
    instanceUrl?: string; // Renamed from cloudUrl to match CP more closely
    instanceCreatedAt?: string;
    instanceUpdatedAt?: string;
    instanceErrorDetails?: string;
    cloudUrl?: string; // Keep if used by older parts, but instanceUrl is preferred
    // Add other fields as needed from control plane's IdentitySchema
}

// --- Types for VibeState (to be exposed to third-party apps) ---

/**
 * Represents the user's account information provided by the Vibe Agent.
 */
export interface Account {
    did: string; // The user's Decentralized Identifier (matches activeIdentity.did)
    // Add other relevant account details here as needed (e.g., primary email, display name from agent settings)
}

/**
 * Represents the possible permission settings for a specific permission string.
 */
export type PermissionSetting = "always" | "ask" | "never";

/**
 * Represents a single user identity as exposed to third-party apps.
 * This is a simplified/mapped version of AgentIdentity.
 */
export interface VibeIdentity {
    did: string;
    label: string; // User-defined label or profile name
    pictureUrl?: string;
    // Any other fields safe and relevant to expose
}

/**
 * Represents the overall state managed by the Vibe SDK, exposed to third-party apps.
 */
export interface VibeState {
    isUnlocked: boolean; // Is the agent's vault currently unlocked?
    did?: string | null; // Active DID of the user in the agent, if any and unlocked/session valid
    account?: Account | null; // Current user account (based on active identity)
    activeIdentity?: VibeIdentity | null; // The currently selected identity, mapped for app consumption
    identities?: VibeIdentity[]; // All available identities, mapped for app consumption
    permissions?: Record<string, PermissionSetting>; // Permissions granted for the active app session (appId + origin)
    // Add other state properties like connection status, errors, etc.
}

// API response type for tokenDetails (align with CP models.ts TokenResponseSchema)
export interface TokenDetails {
    accessToken: string;
    accessTokenExpiresIn: number; // Absolute UNIX timestamp (seconds)
    refreshToken: string;
    refreshTokenExpiresAt: number; // Absolute UNIX timestamp (seconds)
    tokenType: "Bearer";
}

export class HandledError extends Error {
    constructor(public payload: any, message?: string) {
        super(message || (payload && payload.message) || "Handled error");
        this.name = "HandledError";
        Object.setPrototypeOf(this, HandledError.prototype);
    }
}
