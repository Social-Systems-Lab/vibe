"use client";

import { useEffect } from "react";

export default function LoginPage() {
    const handleLogin = () => {
        // In a real app, you would perform authentication here.
        // For now, we'll simulate a successful login.

        const token = "dummy-auth-token-from-vibe-web";

        if (window.opener) {
            window.opener.postMessage(
                { type: "VIBE_AUTH_SUCCESS", token: token },
                "*" // In production, you should specify the exact origin of the opener window
            );
            window.close();
        }
    };

    return (
        <div>
            <h1>Vibe Web Login</h1>
            <p>This is the login page that appears in the popup.</p>
            <button onClick={handleLogin}>Simulate Successful Login</button>
        </div>
    );
}
