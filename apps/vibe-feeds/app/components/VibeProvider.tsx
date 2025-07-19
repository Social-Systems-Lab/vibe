"use client";

import { VibeProvider as VibeProviderReact } from "vibe-react";
import type { ReactNode } from "react";

const config = {
    appName: "Vibe Feed",
    apiUrl: "http://localhost:5000",
    clientId: "http://localhost:3001",
    redirectUri: "http://localhost:3001/auth/callback",
    useHub: true,
};

export function VibeProvider({ children }: { children: ReactNode }) {
    return <VibeProviderReact config={config}>{children}</VibeProviderReact>;
}
