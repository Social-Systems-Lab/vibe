"use server";

import { createSdk } from "vibe-sdk";

const sdk = createSdk(process.env.API_URL ?? "http://127.0.0.1:5000");

export const checkApiHealth = async () => {
    try {
        const result = await sdk.healthCheck();
        return JSON.stringify(result, null, 2);
    } catch (e: any) {
        return e.message;
    }
};

export const signup = async (formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    return sdk.auth.signup({ email, password });
};

export const login = async (formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    return sdk.auth.login({ email, password });
};
