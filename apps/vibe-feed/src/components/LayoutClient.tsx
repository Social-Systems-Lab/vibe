"use client";

import type { ReactNode } from "react";
import { VibeProvider } from "vibe-react";
import { Header } from "@/components/Header";
import { LeftSidebar } from "@/components/LeftSidebar";
import { RightSidebar } from "@/components/RightSidebar";

const config = {
    appName: "Vibe Feed",
    apiUrl: "http://localhost:5000",
    clientId: "http://localhost:3001",
    redirectUri: "http://localhost:3001/auth/callback",
    useHub: true,
};

export function LayoutClient({ children }: { children: ReactNode }) {
    return (
        <VibeProvider config={config}>
            <Header />
            <main>
                <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[240px_1fr_300px] gap-8 max-w-7xl mx-auto">
                    <LeftSidebar />
                    <div>{children}</div>
                    <RightSidebar />
                </div>
            </main>
        </VibeProvider>
    );
}
