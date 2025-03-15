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

export type ServerOption = "official" | "custom" | "none";
export interface ServerConfig {
    url: string;
    name?: string;
    isConnected?: boolean;
    lastConnected?: number;
    serverOption: ServerOption;
}

export type Account = {
    did: string;
    publicKey: string;
    name: string;
    pictureUrl?: string;
    requireAuthentication: AuthType;
    updatedAt?: number; // timestamp for cache busting
    server?: ServerConfig; // server configuration
};

export type ReadResult = {
    doc: any;
    docs: any[];
};

export type ServerResponse<T> = {
    success: boolean;
    error?: string;
} & T;

export type ChallengeResponse = ServerResponse<{
    challenge: string;
    timestamp: number;
    expiresAt: number;
}>;

export type RegistrationResponse = ServerResponse<{
    credentials: {
        username: string;
        password: string;
        dbName: string;
    };
    serverInfo: {
        version: string;
        features: string[];
    };
}>;
