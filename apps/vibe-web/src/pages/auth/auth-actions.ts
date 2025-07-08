"use server";

import { getEnv } from "waku";
import { createSdk } from "vibe-sdk";

const sdk = createSdk(getEnv("API_URL") ?? "http://127.0.0.1:5000");

export const checkApiHealth = async () => {
    try {
        const { data } = await sdk.client.health.get({});
        return JSON.stringify(data, null, 2);
    } catch (e: any) {
        return e.message;
    }
};

export type AuthState = {
    token?: string;
    refreshToken?: string;
    error?: string;
};

export const signup = async (prevState: AuthState | null, formData: FormData): Promise<AuthState> => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const displayName = formData.get("displayName") as string;

    try {
        const response = await fetch(`${getEnv("WAKU_PUBLIC_API_URL")}/auth/signup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password, displayName }),
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

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Signup error:", error);
        return { error: "An unexpected error occurred" };
    }
};

export const login = async (prevState: AuthState | null, formData: FormData): Promise<AuthState> => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
        const response = await fetch(`${getEnv("WAKU_PUBLIC_API_URL")}/auth/login`, {
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
        return data;
    } catch (error) {
        console.error("Login error:", error);
        return { error: "An unexpected error occurred" };
    }
};
