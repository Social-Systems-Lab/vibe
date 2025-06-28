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

export const signup = async (prevState: any, formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const { data } = await sdk.client.auth.signup.post({ email, password });
    console.log("signup result", data);
    if (data?.token) {
        sdk.setAccessToken(data.token);
        return { ...data, email };
    }
    return data;
};

export const login = async (prevState: any, formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const { data } = await sdk.client.auth.login.post({ email, password });
    console.log("login result", data);
    if (data?.token) {
        sdk.setAccessToken(data.token);
        return { ...data, email };
    }
    return data;
};
