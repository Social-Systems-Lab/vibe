import type { ReactNode } from "react";
import { AuthWidget, VibeProvider } from "vibe-react";
import "../styles.css";

const vibeConfig = {
    issuer: "http://localhost:5000",
    clientId: "http://localhost:3001",
    redirectUri: "http://localhost:3001/auth/callback",
    scopes: ["openid", "profile", "email"],
};

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <VibeProvider {...vibeConfig}>
            <header>
                <AuthWidget />
            </header>
            <main className="font-sans">{children}</main>
        </VibeProvider>
    );
}
