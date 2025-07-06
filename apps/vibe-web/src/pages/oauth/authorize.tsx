"use client";

import { useEffect } from "react";
import { LoginForm } from "../../components/LoginForm";
import { AuthState } from "../auth/auth-actions";

export default function AuthorizePage() {
    const searchParams = new URLSearchParams(window.location.search);
    const clientId = searchParams.get("client_id");
    const redirectUri = searchParams.get("redirect_uri");
    const responseType = searchParams.get("response_type");
    const scope = searchParams.get("scope");
    const state = searchParams.get("state");
    const nonce = searchParams.get("nonce");
    const codeChallenge = searchParams.get("code_challenge");
    const codeChallengeMethod = searchParams.get("code_challenge_method");

    useEffect(() => {
        const error = searchParams.get("error");
        if (error) {
            window.opener.postMessage({ type: "vibe-auth-error", error }, window.location.origin);
            window.close();
        }
    }, [searchParams]);

    const handleLoginSuccess = (data: AuthState) => {
        if (data.code) {
            window.opener.postMessage({ type: "vibe-auth-code", code: data.code }, window.location.origin);
            window.close();
        }
    };

    // TODO: Add logic to check if user is already logged in

    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
}
