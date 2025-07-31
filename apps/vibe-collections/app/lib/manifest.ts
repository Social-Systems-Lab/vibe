import { VibeManifest } from "vibe-sdk";

const getBaseUrl = () => {
    if (typeof window !== "undefined") {
        return process.env.NEXT_PUBLIC_CLIENT_ID || window.location.origin;
    }
    return process.env.NEXT_PUBLIC_CLIENT_ID || "http://127.0.0.1:3001";
};

const baseUrl = getBaseUrl();

export const appManifest: VibeManifest = {
    appName: "Collections",
    backgroundImageUrl: `${baseUrl}/images/logo.png`,
    appTagline: "Collect. Organize. Share.",
    appDescription: "Organize your files, photos and collections effortlessly.",
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5050",
    clientId: baseUrl,
    redirectUri: `${baseUrl}/auth/callback`,
    useHub: false,
    themeColor: "#000000",
    appLogoUrl: `${baseUrl}/images/logo.png`,
    appLogotypeUrl: `${baseUrl}/images/logotype.png`,
    appShowcaseUrl: `${baseUrl}/images/showcase.png`,
    backgroundColor: "#000000",
    buttonColor: "#0000FF",
    fontColor: "#000000",
};
