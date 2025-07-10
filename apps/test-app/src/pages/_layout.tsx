"use client";

import type { ReactNode } from "react";
import { AuthWidget, VibeProvider, useVibe } from "vibe-react";
import "../styles.css";
import { useState } from "react";

const config = {
    appName: "Test App",
    apiUrl: "http://localhost:5000",
    clientId: "http://localhost:3001",
    redirectUri: "http://localhost:3001/auth/callback",
    useHub: true, // Enable the Hub Strategy for our PoC
};

const HubTester = () => {
    const { sdk } = useVibe();
    const [result, setResult] = useState("");

    const handleWriteAllowed = async () => {
        try {
            const response = await sdk.write("posts", { content: "This should work" });
            setResult(`Write to 'posts' successful: ${JSON.stringify(response)}`);
        } catch (e: any) {
            setResult(`Write to 'posts' failed: ${e.message}`);
        }
    };

    const handleWriteDenied = async () => {
        try {
            await sdk.write("private_notes", { content: "This should be denied" });
            setResult("Write to 'private_notes' was allowed, but should have failed!");
        } catch (e: any) {
            setResult(`Write to 'private_notes' correctly failed: ${e.message}`);
        }
    };

    return (
        <div className="p-4 border-t-2 mt-4">
            <h2 className="text-lg font-bold mb-2">Hub Strategy Tester</h2>
            <div className="flex gap-4">
                <button onClick={handleWriteAllowed} className="bg-green-500 text-white p-2 rounded">
                    Test Write (Allowed)
                </button>
                <button onClick={handleWriteDenied} className="bg-red-500 text-white p-2 rounded">
                    Test Write (Denied)
                </button>
            </div>
            {result && <pre className="mt-4 p-2 bg-gray-100 rounded">{result}</pre>}
        </div>
    );
};

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <VibeProvider config={config}>
            <header>
                <div className="absolute top-4 right-6">
                    <AuthWidget />
                </div>
            </header>
            <main className="font-sans">
                {children}
                <HubTester />
            </main>
        </VibeProvider>
    );
}
