import type { ReactNode } from "react";
import { AuthWidget, VibeProvider } from "vibe-react";
import "../styles.css";

const config = {
    appName: "Test App",
    apiUrl: "http://localhost:5000",
    clientId: "http://localhost:3001",
    redirectUri: "http://localhost:3001/auth/callback",
};

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <VibeProvider config={config}>
            <header>
                <AuthWidget />
            </header>
            <main className="font-sans">{children}</main>
        </VibeProvider>
    );
}
