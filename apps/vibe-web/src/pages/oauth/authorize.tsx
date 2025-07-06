"use client";

import { useEffect } from "react";
import { LoginForm } from "../../components/LoginForm";
import { AuthState } from "../auth/auth-actions";

export default function AuthorizePage() {
    useEffect(() => {
        // This code now runs only on the client
        const searchParams = new URLSearchParams(window.location.search);
        const error = searchParams.get("error");

        if (error) {
            // Immediately notify the opener and close if there's an error
            window.opener?.postMessage({ type: "vibe-auth-error", error }, window.location.origin);
            window.close();
        }
    }, []);

    const handleLoginSuccess = (data: AuthState) => {
        if (data.code) {
            // On success, notify the opener and close
            window.opener?.postMessage({ type: "vibe-auth-code", code: data.code }, window.location.origin);
            window.close();
        }
    };

    // TODO: Add logic to check if user is already logged in

    // The LoginForm will now be rendered initially, and the logic will run on the client
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
}
