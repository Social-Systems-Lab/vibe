"use client";

import type { ReactNode } from "react";
import { VibeProvider } from "vibe-react";
import { Header } from "@/components/Header";
import { LeftSidebar } from "@/components/LeftSidebar";
import { RightSidebar } from "@/components/RightSidebar";
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
            <div className="min-h-screen bg-background text-foreground">
                <Header />
                <main className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[240px_1fr_300px] max-w-7xl mx-auto">
                        <div></div>
                        {/* <LeftSidebar /> */}
                        <div>{children}</div>
                        {/* <RightSidebar /> */}
                        <div></div>
                    </div>
                </main>
            </div>
        </VibeProvider>
    );
}
