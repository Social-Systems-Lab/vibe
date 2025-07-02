import { StandaloneStrategy } from "./strategies/standalone";
import { AgentStrategy } from "./strategies/agent";
import { VibeTransportStrategy } from "./strategy";

export type VibeSDKConfig = {
    apiUrl: string;
};

export class VibeSDK {
    private strategy: VibeTransportStrategy;
    public isAuthenticated = false;
    public user: any = null;

    constructor(config: VibeSDKConfig) {
        // For now, we default to Standalone. Later we'll add agent detection.
        this.strategy = new StandaloneStrategy();
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
}

export const createSdk = (config: VibeSDKConfig) => {
    return new VibeSDK(config);
};
