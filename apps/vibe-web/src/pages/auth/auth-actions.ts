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
};

export const signup = async (prevState: AuthState | null, formData: FormData): Promise<AuthState> => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
        const response = await fetch(`http://localhost:5000/auth/signup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Signup failed with status:", response.status, "and response:", errorText);
            try {
                const errorData = JSON.parse(errorText);
                return { error: errorData.error || "Signup failed" };
            } catch (e) {
                return { error: "An unexpected error occurred and the response was not valid JSON." };
            }
        }

        return { success: true };
    } catch (error) {
        console.error("Signup error:", error);
        return { error: "An unexpected error occurred" };
    }
};

export const login = async (prevState: AuthState | null, formData: FormData): Promise<AuthState> => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
        const response = await fetch(`http://localhost:5000/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Login failed with status:", response.status, "and response:", errorText);
            try {
                const errorData = JSON.parse(errorText);
                return { error: errorData.error || "Login failed" };
            } catch (e) {
                return { error: "An unexpected error occurred and the response was not valid JSON." };
            }
        }

        const data = await response.json();
        return { success: true, code: data.code };
    } catch (error) {
        console.error("Login error:", error);
        return { error: "An unexpected error occurred" };
    }
};
