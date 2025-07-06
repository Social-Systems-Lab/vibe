"use client";

import { useEffect, useState } from "react";
import { LoginForm } from "../../components/LoginForm";
import { SignupForm } from "../../components/SignupForm"; // We will create this next
import { AuthState } from "../auth/auth-actions";

export default function AuthorizePage() {
    const [prompt, setPrompt] = useState<string | null>(null);

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const error = searchParams.get("error");
        setPrompt(searchParams.get("prompt"));

        if (error) {
            window.opener?.postMessage({ type: "vibe-auth-error", error }, window.location.origin);
            window.close();
        }
    }, []);

    const handleAuthSuccess = (data: AuthState) => {
        if (data.did) {
            // TODO: Redirect to a new API route that will call provider.interactionFinished
            console.log("Login successful, user DID:", data.did);
            // For now, we'll just close the window to show the flow is working
            window.close();
        } else if (data.success && prompt === "create") {
            // After successful signup, show the login form
            setPrompt(null);
        }
    };

    // TODO: Add logic to check if user is already logged in

    if (prompt === "create") {
        return <SignupForm onSignupSuccess={handleAuthSuccess} />;
    }

    return <LoginForm onLoginSuccess={handleAuthSuccess} />;
}
