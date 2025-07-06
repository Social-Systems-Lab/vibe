"use client";

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

    const handleLoginSuccess = (data: AuthState) => {
        // TODO: Implement consent screen and redirect
        console.log("Login successful, now show consent screen", data);
    };

    // TODO: Add logic to check if user is already logged in

    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
}
