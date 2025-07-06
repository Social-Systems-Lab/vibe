"use client";

import { useEffect } from "react";
import { useVibe } from "vibe-react";
export default function AuthCallbackPage() {
    useEffect(() => {
        // The parent window will handle the redirect, so we just need to close this window.
        // However, to be safe, we'll redirect to the home page if this page is opened directly.
        if (window.opener) {
            // The parent window will close us
        } else {
            window.location.href = "/";
        }
    }, []);

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="text-center">
                <p className="text-lg font-semibold">Authenticating...</p>
                <p className="text-gray-500">Please wait while we verify your identity.</p>
            </div>
        </div>
    );
}
