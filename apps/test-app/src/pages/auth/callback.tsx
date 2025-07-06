"use client";

import { useEffect } from "react";
import { useVibe } from "vibe-react";
export default function AuthCallbackPage() {
    const { handleRedirect } = useVibe();

    useEffect(() => {
        const process = async () => {
            try {
                await handleRedirect();
                window.location.href = "/";
            } catch (error) {
                console.error("Failed to handle redirect:", error);
                // Optionally, redirect to an error page
                window.location.href = "/auth/error";
            }
        };
        process();
    }, [handleRedirect]);

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="text-center">
                <p className="text-lg font-semibold">Authenticating...</p>
                <p className="text-gray-500">Please wait while we verify your identity.</p>
            </div>
        </div>
    );
}
