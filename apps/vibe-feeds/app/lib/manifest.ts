import { VibeManifest } from "vibe-sdk";

export const appManifest: VibeManifest = {
    appName: "Vibe Feed",
    backgroundImageUrl: `${process.env.NEXT_PUBLIC_CLIENT_ID || "http://127.0.0.1:3000"}/images/logo.png`,
    appTagline: "You control your feed.",
    appDescription: "Create custom feeds and share content on your terms.",
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5050",
    clientId: process.env.NEXT_PUBLIC_CLIENT_ID || "http://127.0.0.1:3000",
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || "http://127.0.0.1:3000/auth/callback",
    useHub: false,
    themeColor: "#000000",
    appLogoUrl: `${process.env.NEXT_PUBLIC_CLIENT_ID || "http://127.0.0.1:3000"}/images/logo.png`,
    appLogotypeUrl: `${process.env.NEXT_PUBLIC_CLIENT_ID || "http://127.0.0.1:3000"}/images/logotype.png`,
    appShowcaseUrl: `${process.env.NEXT_PUBLIC_CLIENT_ID || "http://127.0.0.1:3000"}/images/showcase.png`,
    backgroundColor: "#000000",
    buttonColor: "#0000FF",
    fontColor: "#000000",
};
