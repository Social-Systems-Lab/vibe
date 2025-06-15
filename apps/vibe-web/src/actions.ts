"use server";

import { createSdk } from "vibe-sdk";

export const checkApiHealth = async () => {
    try {
        const sdk = createSdk("http://127.0.0.1:3000");
        const result = await sdk.healthCheck();
        return JSON.stringify(result, null, 2);
    } catch (e: any) {
        return e.message;
    }
};
