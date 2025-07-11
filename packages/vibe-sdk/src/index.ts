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
    private dataStrategy: VibeTransportStrategy;
    private authStrategy: VibeTransportStrategy;
    public isAuthenticated = false;
    public user: any = null;

    constructor(config: VibeSDKConfig) {
        if (config.useHub) {
            this.authStrategy = new StandaloneStrategy({
                clientId: config.clientId,
                redirectUri: config.redirectUri,
            });
            this.dataStrategy = new HubStrategy({
                ...config,
                hubUrl: config.hubUrl || `${config.apiUrl}/hub.html`,
            });
            console.log("Vibe SDK created with Hub Strategy");
        } else {
            const standalone = new StandaloneStrategy({
                clientId: config.clientId,
                redirectUri: config.redirectUri,
            });
            this.authStrategy = standalone;
            this.dataStrategy = standalone;
            console.log("Vibe SDK created with Standalone Strategy");
        }
    }

    async init() {
        if (this.authStrategy.init) {
            await this.authStrategy.init();
        }
        if (this.dataStrategy.init) {
            await this.dataStrategy.init();
        }
        this.user = await this.authStrategy.getUser();
        this.isAuthenticated = !!this.user;
        if (this.isAuthenticated && this.dataStrategy.init) {
            await this.dataStrategy.init();
        }
    }

    async login() {
        return new Promise<void>(async (resolve) => {
            let unsubscribe: () => void;
            unsubscribe = this.onStateChange((state: any) => {
                if (state.isAuthenticated) {
                    this.user = state.user;
                    this.isAuthenticated = true;
                    if (unsubscribe) {
                        unsubscribe();
                    }
                    resolve();
                }
            });
            await this.authStrategy.login();
        });
    }

    async logout() {
        await this.authStrategy.logout();
        this.isAuthenticated = false;
        this.user = null;
    }

    async signup() {
        await this.authStrategy.signup();
        this.user = await this.authStrategy.getUser();
        this.isAuthenticated = !!this.user;
    }

    async read(collection: string, callback: ReadCallback): Promise<Subscription>;
    async read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription>;
    async read(collection: string, filter: any, callback?: ReadCallback): Promise<Subscription> {
        if (typeof filter === "function") {
            callback = filter;
            filter = undefined;
        }
        return this.dataStrategy.read(collection, filter, callback as ReadCallback);
    }

    async readOnce(collection: string, filter?: any): Promise<any> {
        return this.dataStrategy.readOnce(collection, filter);
    }

    async write(collection: string, data: any): Promise<any> {
        return this.dataStrategy.write(collection, data);
    }

    async remove(collection: string, data: any): Promise<any> {
        return this.dataStrategy.remove(collection, data);
    }

    onStateChange(callback: (state: { isAuthenticated: boolean; user: any }) => void) {
        return this.authStrategy.onStateChange((state) => {
            callback({
                isAuthenticated: state.isLoggedIn,
                user: state.user,
            });
        });
    }
}

export const createSdk = (config: VibeSDKConfig) => {
    return new VibeSDK(config);
};

export * from "./types";
