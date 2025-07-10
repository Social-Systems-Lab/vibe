import { StandaloneStrategy } from "./strategies/standalone";
import { AgentStrategy } from "./strategies/agent";
import { HubStrategy } from "./strategies/hub";
import { VibeTransportStrategy } from "./strategy";
import { ReadCallback, Subscription } from "./types";

export type VibeSDKConfig = {
    apiUrl: string;
    clientId: string;
    redirectUri: string;
    useHub?: boolean;
    hubUrl?: string;
    appName?: string;
    appImageUrl?: string;
};

export class VibeSDK {
    private strategy: VibeTransportStrategy;
    public isAuthenticated = false;
    public user: any = null;

    constructor(config: VibeSDKConfig) {
        if (config.useHub) {
            this.strategy = new HubStrategy({
                hubUrl: config.hubUrl || `${config.apiUrl}/hub.html`,
            });
            console.log("Vibe SDK Initialized with Hub Strategy");
            // The hub strategy requires explicit initialization
            (this.strategy as HubStrategy).init().then(() => {
                this.strategy.getUser().then((user) => {
                    this.user = user;
                    this.isAuthenticated = !!user;
                });
            });
        } else {
            // For now, we default to Standalone. Later we'll add agent detection.
            this.strategy = new StandaloneStrategy({
                clientId: config.clientId,
                redirectUri: config.redirectUri,
            });
            console.log("Vibe SDK Initialized with Standalone Strategy");
        }
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

    async readOnce(collection: string, filter?: any): Promise<any> {
        return this.strategy.readOnce(collection, filter);
    }

    async write(collection: string, data: any): Promise<any> {
        return this.strategy.write(collection, data);
    }

    async remove(collection: string, data: any): Promise<any> {
        return this.strategy.remove(collection, data);
    }
}

export const createSdk = (config: VibeSDKConfig) => {
    return new VibeSDK(config);
};
