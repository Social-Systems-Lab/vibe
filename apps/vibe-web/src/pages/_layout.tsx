"use client";

import "../styles.css";

import type { ReactNode } from "react";
import { Provider } from "jotai";
import { AuthWidget, VibeProvider } from "vibe-react";

const config = {
    appName: "Vibe Web",
    apiUrl: "http://localhost:5000",
    clientId: "http://localhost:3002",
    redirectUri: "http://localhost:3002/auth/callback",
};

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <VibeProvider config={config}>
            <Provider>
                <div className="font-['Nunito']">
                    <header>
                        <AuthWidget />
                    </header>
                    <meta name="description" content="Vibe - your everything" />
                    <link rel="icon" type="image/png" href="/images/favicon.png" />
                    <main>{children}</main>
                </div>
            </Provider>
        </VibeProvider>
    );
}
