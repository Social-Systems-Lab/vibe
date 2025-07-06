import { StandaloneStrategy, StandaloneStrategyOptions } from "./strategies/standalone";
import { AgentStrategy } from "./strategies/agent";
import { VibeTransportStrategy } from "./strategy";
import { ReadCallback, Subscription } from "./types";

export type VibeSDKConfig = StandaloneStrategyOptions & {
    // We can add other config options here later
};

export class VibeSDK {
    private strategy: VibeTransportStrategy;
    public isAuthenticated = false;
    public user: any = null;

    constructor(config: VibeSDKConfig) {
        // For now, we default to Standalone. Later we'll add agent detection.
        this.strategy = new StandaloneStrategy(config);
        console.log("Vibe SDK Initialized with Standalone Strategy");
    }

    async login() {
        await this.strategy.login();
        this.user = await this.strategy.getUser();
        this.isAuthenticated = !!this.user;
    }

    async logout() {
        await this.strategy.logout();
        this.isAuthenticated = false;
        this.user = null;
    }

    async signup() {
        await this.strategy.signup();
        this.user = await this.strategy.getUser();
        this.isAuthenticated = !!this.user;
    }

    async read(collection: string, callback: ReadCallback): Promise<Subscription>;
    async read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription>;
    async read(collection: string, filter: any, callback?: ReadCallback): Promise<Subscription> {
        if (typeof filter === "function") {
            callback = filter;
            filter = undefined;
        }
        return this.strategy.read(collection, filter, callback as ReadCallback);
    }
}

export const createSdk = (config: VibeSDKConfig) => {
    return new VibeSDK(config);
};
