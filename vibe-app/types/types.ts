export type Operation = "read" | "write";
export type PermissionSetting = "always" | "ask" | "never";

export interface InstalledApp {
    appId: string;
    name: string;
    description: string;
    pictureUrl: string;
    url: string;
    permissions: Record<string, PermissionSetting>;
    hidden: boolean;
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

export type ReadResult = {
    doc: any;
    docs: any[];
};
