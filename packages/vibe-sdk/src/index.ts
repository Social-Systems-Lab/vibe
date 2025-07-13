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
    private isInitialized = false;
    private isInitializing = false;

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
        } else {
            const standalone = new StandaloneStrategy({
                clientId: config.clientId,
                redirectUri: config.redirectUri,
            });
            this.authStrategy = standalone;
            this.dataStrategy = standalone;
        }
    }

    async init() {
        if (this.isInitialized || this.isInitializing) {
            return;
        }
        this.isInitializing = true;

        // The onStateChange listener is now the single source of truth for handling auth changes.
        // It will be responsible for updating the VibeSDK's state and configuring the dataStrategy.
        this.onStateChange(() => {});

        if (this.authStrategy.init) {
            await this.authStrategy.init();
        }
        if (this.dataStrategy.init) {
            await (this.dataStrategy as any).init(this.user);
        }

        this.isInitialized = true;
        this.isInitializing = false;
    }

    async login() {
        return this.authStrategy.login();
    }

    async logout() {
        await this.authStrategy.logout();
        this.isAuthenticated = false;
        this.user = null;
        if ((this.dataStrategy as any).setUser) {
            await (this.dataStrategy as any).setUser(null);
        }
    }

    async signup() {
        // The authStrategy's signup method will trigger the onStateChange listener,
        // which is the single source of truth for updating the user state.
        await this.authStrategy.signup();
    }

    async manageConsent() {
        await this.authStrategy.manageConsent();
    }

    async manageProfile() {
        await this.authStrategy.manageProfile();
    }

    async forceRefreshPermissions() {
        if ("forceRefreshPermissions" in this.dataStrategy) {
            await (this.dataStrategy as any).forceRefreshPermissions();
        }
    }

    async read(collection: string, callback: ReadCallback): Promise<Subscription>;
    async read(collection: string, query: any, callback: ReadCallback): Promise<Subscription>;
    async read(collection: string, queryOrCallback: any, callback?: ReadCallback): Promise<Subscription> {
        let query: any;
        if (typeof queryOrCallback === "function") {
            callback = queryOrCallback;
            query = {};
        } else {
            query = queryOrCallback;
        }
        return this.dataStrategy.read(collection, query, callback as ReadCallback);
    }

    async readOnce(collection: string, query?: any): Promise<any> {
        return this.dataStrategy.readOnce(collection, query);
    }

    async write(collection: string, data: any): Promise<any> {
        return this.dataStrategy.write(collection, data);
    }

    async remove(collection: string, data: any): Promise<any> {
        return this.dataStrategy.remove(collection, data);
    }

    onStateChange(callback: (state: { isAuthenticated: boolean; user: any }) => void) {
        const authUnsubscribe = this.authStrategy.onStateChange(async (state) => {
            this.user = state.user;

            // This is the key: whenever the auth state changes, we inform the data strategy.
            // The data strategy (e.g., HubStrategy) is responsible for fetching permissions
            // and setting up the user session. We await this to ensure it's complete
            // before we update the application's authentication state.
            if ((this.dataStrategy as any).setUser) {
                await (this.dataStrategy as any).setUser(this.user);
            }

            // Now that the data strategy is ready, we update the auth state.
            this.isAuthenticated = state.isLoggedIn;
            callback({ isAuthenticated: this.isAuthenticated, user: this.user });
        });

        // Immediately notify the new listener with the current state.
        callback({ isAuthenticated: this.isAuthenticated, user: this.user });

        return authUnsubscribe;
    }
}

import { getSdk } from "./sdk-manager";

export const createSdk = (config: VibeSDKConfig) => {
    return getSdk(config);
};

export * from "./types";
