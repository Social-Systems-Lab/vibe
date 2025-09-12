import { VibeManifest } from "vibe-sdk";

const getBaseUrl = () => {
    if (typeof window !== "undefined") {
        return process.env.NEXT_PUBLIC_CLIENT_ID || window.location.origin;
    }
    return process.env.NEXT_PUBLIC_CLIENT_ID || "http://localhost:3000";
};

const baseUrl = getBaseUrl();

export const appManifest: VibeManifest = {
    appName: "Notes",
    backgroundImageUrl: `${baseUrl}/images/logo.png`,
    appTagline: "Notes that stay with you.",
    appDescription:
        "Whether it’s a to-do list, a sudden idea, or a detailed plan, Vibe Notes makes it easy to capture your thoughts instantly. Lightweight and distraction-free, it’s designed to help your ideas flow.",
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
    scopes: ["read:notes", "write:notes"],
};
