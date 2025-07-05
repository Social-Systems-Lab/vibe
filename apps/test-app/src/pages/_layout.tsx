import type { ReactNode } from "react";
import { Providers } from "../components/providers";
import { AuthWidget, VibeProvider } from "vibe-react";
import "../styles.css";

const config = {
    apiUrl: "http://localhost:3000/api", // This should be your Vibe Cloud API endpoint
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
