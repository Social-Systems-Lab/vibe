import { VibeSDKConfig } from "vibe-sdk";

export const sdkConfig: VibeSDKConfig & { authFlow?: "onetap" | "default"; appName: string; useHub: boolean } = {
    appName: "Vibe Feed",
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
    clientId: process.env.NEXT_PUBLIC_CLIENT_ID || "http://localhost:3000",
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || "http://localhost:3000/auth/callback",
    authFlow: "default",
    useHub: false,
};
