import { edenTreaty } from "@elysiajs/eden";
import type { App } from "vibe-cloud-api/src/index";

export const createSdk = (apiUrl: string) => {
    const client = edenTreaty<App>(apiUrl);
    return {
        healthCheck: async () => {
            const { data, error } = await client.health.get();
            if (error) {
                throw error;
            }
            return data;
        },
    };
};
