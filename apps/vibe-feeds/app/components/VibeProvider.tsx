"use client";

import { VibeProvider as VibeProviderReact } from "vibe-react";
import type { ReactNode } from "react";

export function VibeProvider({ children }: { children: ReactNode }) {
    const config = {
        appName: "Vibe Feed",
        apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
        clientId: process.env.NEXT_PUBLIC_CLIENT_ID || "http://localhost:3000",
        redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || "http://localhost:3000/auth/callback",
        useHub: true,
    };
    return <VibeProviderReact config={config}>{children}</VibeProviderReact>;
}
