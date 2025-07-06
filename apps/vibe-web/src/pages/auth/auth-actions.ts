"use server";

import { getEnv } from "waku";
import { createSdk } from "vibe-sdk";

// const sdk = createSdk(getEnv("API_URL") ?? "http://127.0.0.1:5000");

export const checkApiHealth = async () => {
    try {
        // const { data } = await sdk.client.health.get({});
        const data = { healht: "ok" };
        return JSON.stringify(data, null, 2);
    } catch (e: any) {
        return e.message;
    }
};

export type AuthState = {
    success?: boolean;
    error?: string;
    code?: string;
    did?: string;
};

export const signup = async (prevState: AuthState | null, formData: FormData): Promise<AuthState> => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
        // This still calls the original signup endpoint which creates the user
        const response = await fetch(`http://localhost:5000/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Signup failed: ${response.status} ${errorText}`);
            return { error: "Signup failed. Please try again." };
        }

        // After a successful signup, we indicate success.
        // The authorize page will then re-render the login form.
        return { success: true };
    } catch (error) {
        console.error("Signup error:", error);
        return { error: "An unexpected network error occurred." };
    }
};

export const login = async (prevState: AuthState | null, formData: FormData): Promise<AuthState> => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
        // Step 1: Verify credentials with our new dedicated endpoint
        const response = await fetch(`http://localhost:5000/auth/verify-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            return { error: data.error || "Invalid email or password." };
        }

        // Step 2: On successful verification, we need to complete the OIDC flow.
        // For now, we'll just return a success state with the user's DID.
        // The next step will be to use this to complete the interaction with the OIDC provider.
        return { success: true, did: data.did };
    } catch (error) {
        console.error("Login error:", error);
        return { error: "An unexpected network error occurred." };
    }
};
