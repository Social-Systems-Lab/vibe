"use client";

import React, { useEffect } from "react";

const AuthCallbackPage = () => {
    useEffect(() => {
        if (window.opener) {
            window.opener.postMessage(
                {
                    type: "vibe_auth_callback",
                    url: window.location.href,
                },
                window.location.origin
            );
        }
    }, []);

    return (
        <div>
            <h1>Authenticating...</h1>
            <p>Please wait while we complete the authentication process.</p>
        </div>
    );
};

export default AuthCallbackPage;
