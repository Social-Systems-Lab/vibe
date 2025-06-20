"use server";

import { getEnv } from "waku";
import { createSdk } from "vibe-sdk";

const sdk = createSdk(getEnv("API_URL") ?? "http://127.0.0.1:5000");

export const checkApiHealth = async () => {
    try {
        const result = await sdk.healthCheck();
        return JSON.stringify(result, null, 2);
    } catch (e: any) {
        return e.message;
    }
};

export const signup = async (prevState: any, formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const result = await sdk.auth.signup({ email, password });
    console.log("signup result", result);
    return result;
};

export const login = async (prevState: any, formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const result = await sdk.auth.login({ email, password });
    console.log("login result", result);
    if (result.token) {
        return { ...result, email };
    }
    return result;
};
