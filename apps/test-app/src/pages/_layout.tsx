import type { ReactNode } from "react";
import { VibeProvider } from "vibe-react";

const config = {
    apiUrl: "http://localhost:3000/api", // This should be your Vibe Cloud API endpoint
};

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <VibeProvider config={config}>
            <div className="font-sans">{children}</div>
        </VibeProvider>
    );
}
