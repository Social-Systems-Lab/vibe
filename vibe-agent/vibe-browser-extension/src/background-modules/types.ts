// Placeholder Identity type - should align with control plane's IdentitySchema
export interface Identity {
    identityDid: string;
    isAdmin: boolean;
    profileName?: string;
    profilePictureUrl?: string;
    instanceId?: string;
    instanceStatus?: string; // Should match IdentityInstanceStatus type from CP models
    instanceUrl?: string;
    instanceCreatedAt?: string;
    instanceUpdatedAt?: string;
    instanceErrorDetails?: string;
    // Add other fields as needed from control plane's IdentitySchema
}

// API response type for tokenDetails (align with CP models.ts TokenResponseSchema)
export interface TokenDetails {
    accessToken: string;
    accessTokenExpiresIn: number; // Absolute UNIX timestamp (seconds)
    refreshToken: string;
    refreshTokenExpiresAt: number; // Absolute UNIX timestamp (seconds)
    tokenType: "Bearer";
}
