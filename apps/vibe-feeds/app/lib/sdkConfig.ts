import { VibeSDKConfig } from "vibe-sdk";

export const sdkConfig: VibeSDKConfig & { authFlow?: "onetap" | "default"; appName: string; useHub: boolean } = {
    appName: "Vibe Feed",
    appImageUrl: process.env.NEXT_PUBLIC_APP_IMAGE_URL || "https://picsum.photos/400/400",
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000",
    clientId: process.env.NEXT_PUBLIC_CLIENT_ID || "http://127.0.0.1:3000",
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || "http://127.0.0.1:3000/auth/callback",
    authFlow: "default",
    useHub: false,
};
