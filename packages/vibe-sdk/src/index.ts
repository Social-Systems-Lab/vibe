import { DocRef, ReadCallback, Subscription, User, Document, ReadOnceResponse } from "vibe-core";
import { SessionState, SessionManager } from "./session-manager";
import { edenTreaty } from "@elysiajs/eden";
import type { App } from "vibe-cloud-api";

// --- Internal Auth Manager (from standalone.ts) ---
class AuthManager {
    private accessToken: string | null = null;
    private user: User | null = null;
    private stateChangeListeners: ((state: { isLoggedIn: boolean; user: User | null }) => void)[] = [];

    getAccessToken() {
        return this.accessToken;
    }

    setAccessToken(token: string | null) {
        this.accessToken = token;
    }

    getUser() {
        return this.user;
    }

    setUser(user: User | null) {
        this.user = user;
        this.notifyStateChange();
    }

    isLoggedIn() {
        return !!this.getAccessToken();
    }

    onStateChange(listener: (state: { isLoggedIn: boolean; user: User | null }) => void) {
        this.stateChangeListeners.push(listener);
        return () => {
            this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== listener);
        };
    }

    notifyStateChange() {
        const state = {
            isLoggedIn: this.isLoggedIn(),
            user: this.user,
        };
        this.stateChangeListeners.forEach((listener) => listener(state));
    }
}

export type VibeManifest = {
    apiUrl: string;
    clientId: string;
    redirectUri: string;
    hubUrl?: string;
    appName?: string;
    backgroundImageUrl?: string;
    appTagline?: string;
    appDescription?: string;
    themeColor?: string;
    appLogoUrl?: string;
    appLogotypeUrl?: string;
    appShowcaseUrl?: string;
    backgroundColor?: string;
    buttonColor?: string;
    fontColor?: string;
};

export class VibeSDK {
    public isAuthenticated = false;
    public user: User | null = null;
    private isInitialized = false;
    private isInitializing = false;

    // Properties from HubStrategy
    private hubUrl: string;
    private hubFrame: HTMLIFrameElement | null = null;
    private hubPort: MessagePort | null = null;
    private pendingRequests = new Map<string, any>();
    private subscriptions = new Map<string, ReadCallback>();

    // Properties from StandaloneStrategy
    private authManager: AuthManager;
    private sessionManager: SessionManager;
    private api;
    private config: VibeManifest;

    constructor(config: VibeManifest) {
        this.config = config;
        this.hubUrl = config.hubUrl || `${config.apiUrl}/hub.html`;
        this.api = edenTreaty<App>(config.apiUrl);
        this.sessionManager = new SessionManager(config);
        this.authManager = new AuthManager();
    }

    // --- Combined Init Method ---
    async init(): Promise<SessionState | void> {
        if (this.isInitialized || this.isInitializing) {
            return;
        }
        this.isInitializing = true;
        console.log("VibeSDK: Initializing...");

        // Start Hub initialization
        this.initHub();

        // Listen for auth state changes to sync with the Hub
        this.onStateChange(() => {});

        // Check the session state using Standalone's logic
        const sessionState = await this.sessionManager.checkSession();
        console.log("VibeSDK: session state checked.", sessionState);

        if (sessionState.status === "SILENT_LOGIN_SUCCESS" && sessionState.code) {
            console.log("VibeSDK: Silent login success, exchanging code for token.");
            try {
                await this.exchangeCodeForToken(sessionState.code);
            } catch (e) {
                console.error("Silent login failed:", e);
            }
        } else if (sessionState.status === "LOGGED_IN") {
            console.log("VibeSDK: User is logged in.", sessionState.user);
            this.authManager.setUser(sessionState.user || null);
            this.authManager.notifyStateChange();
        } else if (sessionState.status === "CONSENT_REQUIRED") {
            console.log("VibeSDK: Consent is required.");
            await this.redirectToAuthorize("login", true);
        }

        this.isInitializing = false;
        this.isInitialized = true;
        console.log("VibeSDK: Initialization complete.");
        return sessionState;
    }

    // --- Hub Methods (from HubStrategy) ---
    private initHub(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.hubFrame = document.createElement("iframe");
            this.hubFrame.style.display = "none";
            const cacheBustedUrl = new URL(this.hubUrl);
            cacheBustedUrl.searchParams.set("t", Date.now().toString());
            this.hubFrame.src = cacheBustedUrl.toString();
            document.body.appendChild(this.hubFrame);

            const channel = new MessageChannel();
            this.hubPort = channel.port1;

            this.hubFrame.onload = () => {
                if (!this.hubFrame || !this.hubFrame.contentWindow) {
                    return reject(new Error("Hub iframe failed to load."));
                }
                this.hubFrame.contentWindow.postMessage(
                    { type: "INIT", payload: { origin: window.location.origin, user: this.user, redirectUri: this.config.redirectUri } },
                    this.hubUrl,
                    [channel.port2]
                );
            };

            this.hubPort.onmessage = (event) => {
                const { type, nonce, success, data, error, subscriptionId } = event.data;

                if (type === "INIT_ACK") {
                    console.log("Hub connection initialized successfully.");
                    resolve();
                    return;
                }
                if (type === "INIT_FAIL") {
                    reject(new Error(`Hub initialization failed: ${error}`));
                    return;
                }
                if (type === "DB_UPDATE") {
                    const callback = this.subscriptions.get(subscriptionId);
                    if (callback) {
                        callback({ ok: true, data });
                    }
                    return;
                }
                if (type.endsWith("_ACK")) {
                    const pending = this.pendingRequests.get(nonce);
                    if (pending) {
                        if (success) {
                            pending.resolve(data);
                        } else {
                            pending.reject(new Error(error));
                        }
                        this.pendingRequests.delete(nonce);
                    }
                }
            };
        });
    }

    private generateNonce(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    private postToHub(message: any): Promise<any> {
        return new Promise(async (resolve, reject) => {
            if (!this.hubPort) {
                return reject(new Error("Hub port not available."));
            }
            const nonce = this.generateNonce();
            this.pendingRequests.set(nonce, { resolve, reject });
            this.hubPort.postMessage({ ...message, nonce });
        });
    }

    // --- Auth Methods (from StandaloneStrategy) ---
    async login(): Promise<void> {
        await this.redirectToAuthorize("login");
    }

    async signup(): Promise<void> {
        await this.redirectToAuthorize("signup");
    }

    async logout(): Promise<void> {
        this.authManager.setAccessToken(null);
        this.authManager.setUser(null);
        sessionStorage.removeItem("vibe_pkce_verifier");
        sessionStorage.removeItem("vibe_oauth_state");

        const logoutUrl = new URL(`${this.config.apiUrl}/auth/logout`);
        logoutUrl.searchParams.set("redirect_uri", window.location.href);
        window.location.href = logoutUrl.toString();
        return new Promise(() => {});
    }

    async manageConsent(): Promise<void> {
        await this.redirectToAuthorize("login", true, "settings");
    }

    async manageProfile(): Promise<void> {
        await this.redirectToAuthorize("profile", false, "settings");
    }

    async handleRedirectCallback(url: string): Promise<void> {
        const params = new URLSearchParams(new URL(url).search);
        const code = params.get("code");
        const state = params.get("state");
        const storedState = sessionStorage.getItem("vibe_oauth_state");
        sessionStorage.removeItem("vibe_oauth_state");
        if (!code || !state || !storedState || state !== storedState) {
            throw new Error("Invalid state or missing code from auth server.");
        }
        await this.exchangeCodeForToken(code);
    }

    private async exchangeCodeForToken(code: string): Promise<void> {
        const storedVerifier = sessionStorage.getItem("vibe_pkce_verifier");
        if (!storedVerifier) {
            throw new Error("Missing PKCE verifier for token exchange.");
        }
        const { data, error } = await this.api.auth.token.post({
            grant_type: "authorization_code",
            code,
            code_verifier: storedVerifier,
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
        });
        if (error) {
            console.error("Error exchanging code for token:", error.value);
            throw new Error("Failed to exchange authorization code for token.");
        }
        if (data && typeof data === "object" && "access_token" in data) {
            this.authManager.setAccessToken(data.access_token as string);
            await this.getUser();
        } else {
            throw new Error("Invalid response from token endpoint.");
        }
    }

    private async redirectToAuthorize(
        formType: "login" | "signup" | "profile" = "signup",
        promptConsent = false,
        flow: "signup" | "settings" = "signup"
    ): Promise<void> {
        const { generatePkce } = await import("./strategies/standalone");
        const pkce = await generatePkce();
        sessionStorage.setItem("vibe_pkce_verifier", pkce.verifier);
        const state = window.crypto.getRandomValues(new Uint8Array(16)).reduce((s, byte) => s + byte.toString(16).padStart(2, "0"), "");
        sessionStorage.setItem("vibe_oauth_state", state);
        const params = new URLSearchParams({
            response_type: "code",
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: "openid profile email",
            state: state,
            code_challenge: pkce.challenge,
            code_challenge_method: "S256",
            form_type: formType,
            flow: flow,
        });
        if (promptConsent) {
            params.set("prompt", "consent");
        }
        if (this.config.appName) {
            params.set("appName", this.config.appName);
        }
        if (this.config.backgroundImageUrl) {
            params.set("backgroundImageUrl", this.config.backgroundImageUrl);
        }
        if (this.config.appTagline) {
            params.set("appTagline", this.config.appTagline);
        }
        if (this.config.appDescription) {
            params.set("appDescription", this.config.appDescription);
        }
        if (this.config.themeColor) {
            params.set("theme_color", this.config.themeColor);
        }
        if (this.config.appLogoUrl) {
            params.set("appLogoUrl", this.config.appLogoUrl);
        }
        if (this.config.appLogotypeUrl) {
            params.set("appLogotypeUrl", this.config.appLogotypeUrl);
        }
        if (this.config.appShowcaseUrl) {
            params.set("appShowcaseUrl", this.config.appShowcaseUrl);
        }
        if (this.config.backgroundColor) {
            params.set("backgroundColor", this.config.backgroundColor);
        }
        if (this.config.buttonColor) {
            params.set("buttonColor", this.config.buttonColor);
        }
        if (this.config.fontColor) {
            params.set("fontColor", this.config.fontColor);
        }
        const url = `${this.config.apiUrl}/auth/authorize?${params.toString()}`;
        window.location.href = url;
    }

    async getUser(): Promise<User | null> {
        if (!this.authManager.isLoggedIn()) return null;
        try {
            const { data, error } = await this.api.users.me.get({ $headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` } });
            if (error) {
                console.error("Error fetching user:", error.value);
                this.authManager.setAccessToken(null);
                this.authManager.setUser(null);
                return null;
            }
            const user = data?.user as User | undefined;
            this.authManager.setUser(user ?? null);
            return user ?? null;
        } catch (e) {
            console.error("Exception fetching user:", e);
            return null;
        }
    }

    // --- Data Methods (from HubStrategy, now using postToHub) ---
    async read(collection: string, query: any, callback: ReadCallback): Promise<Subscription> {
        const subscriptionId = this.generateNonce(); // Re-use nonce generation for sub ids
        this.subscriptions.set(subscriptionId, callback);

        const { global, ...filter } = query;
        const type = global ? "DB_GLOBAL_SUBSCRIBE" : "DB_SUBSCRIBE";

        this.hubPort?.postMessage({ type, payload: { collection, query: filter }, subscriptionId });

        const initialData = await this.readOnce(collection, query);
        callback({ ok: true, data: initialData });

        return {
            unsubscribe: () => {
                this.subscriptions.delete(subscriptionId);
                const unsubscribeType = global ? "DB_GLOBAL_UNSUBSCRIBE" : "DB_UNSUBSCRIBE";
                this.hubPort?.postMessage({ type: unsubscribeType, payload: { subscriptionId } });
            },
        };
    }

    async readOnce<T extends Document>(collection: string, query: any = {}): Promise<ReadOnceResponse<T>> {
        const { global, ...filter } = query;
        const type = global ? "DB_GLOBAL_QUERY" : "DB_QUERY";
        const result = await this.postToHub({ type, collection, payload: { ...filter, collection } });
        return {
            docs: result,
            doc: result?.[0],
        };
    }

    async write(collection: string, data: any): Promise<any> {
        return this.postToHub({ type: "DB_WRITE", collection, payload: data });
    }

    async remove(collection: string, data: any): Promise<any> {
        return this.postToHub({ type: "DB_REMOVE", collection, payload: data });
    }

    // --- Cert Methods (from StandaloneStrategy) ---
    async issueCert(targetDid: string, certType: DocRef, expires?: string): Promise<any> {
        // This implementation remains complex and relies on DOM interaction (password prompt)
        // For now, we'll keep it in standalone and call it from there.
        const { StandaloneStrategy } = await import("./strategies/standalone");
        const tempStandalone = new StandaloneStrategy(this.config);
        // We need to pass the authManager to the temporary strategy
        (tempStandalone as any).authManager = this.authManager;
        return tempStandalone.issueCert(targetDid, certType, expires);
    }

    async revokeCert(certId: string): Promise<any> {
        const { StandaloneStrategy } = await import("./strategies/standalone");
        const tempStandalone = new StandaloneStrategy(this.config);
        // We need to pass the authManager to the temporary strategy
        (tempStandalone as any).authManager = this.authManager;
        return tempStandalone.revokeCert(certId);
    }

    // --- State Management ---
    onStateChange(callback: (state: { isAuthenticated: boolean; user: User | null }) => void) {
        const authUnsubscribe = this.authManager.onStateChange(async (state: { isLoggedIn: boolean; user: User | null }) => {
            this.user = state.user;

            // Inform the hub about the user change
            if (this.hubPort) {
                this.postToHub({ type: "SET_USER", payload: this.user });
            }

            this.isAuthenticated = state.isLoggedIn;
            callback({ isAuthenticated: this.isAuthenticated, user: this.user });
        });

        // Immediately notify with current state
        callback({ isAuthenticated: this.isAuthenticated, user: this.user });

        return authUnsubscribe;
    }
}

import { getSdk } from "./sdk-manager";

export const createSdk = (config: VibeManifest) => {
    return getSdk(config);
};

export * from "vibe-core";
export type { SessionState };
export * from "vibe-core/crypto";
export * from "vibe-core/did";
