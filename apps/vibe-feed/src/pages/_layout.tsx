"use client";

import type { ReactNode } from "react";
import { AuthWidget, VibeProvider, useVibe } from "vibe-react";
import "../styles.css";
import "vibe-react/dist/vibe-react.css";

const config = {
    appName: "Vibe Feed",
    apiUrl: "http://localhost:5000",
    clientId: "http://localhost:3001",
    redirectUri: "http://localhost:3001/auth/callback",
    useHub: true, // Enable the Hub Strategy for our PoC
};

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <VibeProvider config={config}>
            <header>
                <div className="absolute top-4 right-6 flex items-center space-x-4">
                    <AuthWidget />
                </div>
            </header>
            <main className="font-sans bg-[#fbfbfb]">{children}</main>
        </VibeProvider>
    );
}
