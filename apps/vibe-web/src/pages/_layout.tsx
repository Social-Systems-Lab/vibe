"use client";

import "../styles.css";

import type { ReactNode } from "react";
import { Provider } from "jotai";
import { AuthWidget, VibeProvider } from "vibe-react";

const config = {
    appName: "Vibe Web",
    apiUrl: "http://localhost:5000",
    clientId: "http://localhost:3000",
    redirectUri: "http://localhost:3000/auth/callback",
    useHub: false,
};

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <VibeProvider config={config}>
            <Provider>
                <div className="font-['Nunito']">
                    <header>
                        <div className="absolute top-4 right-6 flex items-center space-x-4">
                            <a href="/certs" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                                Manage Certs
                            </a>
                            <AuthWidget />
                        </div>
                    </header>
                    <meta name="description" content="Vibe - your everything" />
                    <link rel="icon" type="image/png" href="/images/favicon.png" />
                    <main>{children}</main>
                </div>
            </Provider>
        </VibeProvider>
    );
}
