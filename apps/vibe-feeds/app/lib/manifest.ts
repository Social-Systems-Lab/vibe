import { VibeManifest } from "vibe-sdk";

const getBaseUrl = () => {
    if (typeof window !== "undefined") {
        return process.env.NEXT_PUBLIC_CLIENT_ID || window.location.origin;
    }
    return process.env.NEXT_PUBLIC_CLIENT_ID || "http://localhost:3000";
};

const baseUrl = getBaseUrl();

export const appManifest: VibeManifest = {
    appName: "Feeds",
    backgroundImageUrl: `${baseUrl}/images/logo.png`,
    appTagline: "You control your feed.",
    appDescription: "Create custom feeds and share content on your terms.",
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050",
    clientId: baseUrl,
    redirectUri: `${baseUrl}/auth/callback`,
    themeColor: "#000000",
    appLogoUrl: `${baseUrl}/images/logo.png`,
    appLogotypeUrl: `${baseUrl}/images/logotype.png`,
    appShowcaseUrl: `${baseUrl}/images/showcase.png`,
    backgroundColor: "#000000",
    buttonColor: "#0000FF",
    fontColor: "#000000",
    debug: true,
};
