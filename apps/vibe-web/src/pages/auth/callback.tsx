"use client";

import { useEffect } from "react";

export default function AuthCallback() {
    useEffect(() => {
        if (window.opener) {
            window.opener.postMessage({ type: "vibe_auth_callback", url: window.location.href }, window.location.origin);
            window.close();
        }
    }, []);

    return (
        <div>
            <h1>Authenticating...</h1>
            <p>Please wait while we redirect you.</p>
        </div>
    );
}
