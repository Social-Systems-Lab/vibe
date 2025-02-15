export interface InstalledApp {
    appId: string;
    name: string;
    description: string;
    iconUrl: string;
    url: string;
    permissions: Record<string, "always" | "ask" | "never">;
    hidden: boolean; // not shown on home screen
    // Possibly layout info for multi-page home screens
    homeScreenPage?: number;
    homeScreenPosition?: number;
}

export type MessageType = {
    action: string;
    payload?: any;
};

export type RsaKeys = {
    publicKey: string;
    privateKey: string;
};

export type AuthType = "PIN" | "BIOMETRIC";

export type Account = {
    did: string;
    publicKey: string;
    name: string;
    pictureUrl?: string;
    requireAuthentication: AuthType;
    updatedAt?: number; // timestamp for cache busting
};
