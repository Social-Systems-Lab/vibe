import { VibeTransportStrategy } from "../strategy";
import { edenTreaty } from "@elysiajs/eden";
import type { App } from "vibe-cloud-api";
import { User, ReadCallback, Subscription } from "../types";
import { jwtDecode } from "jwt-decode";

const VIBE_API_URL = "http://localhost:5000";

export interface StandaloneStrategyOptions {
    issuer: string;
    clientId: string;
    redirectUri: string;
    scopes: string[];
}

interface OIDCConfig {
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    end_session_endpoint: string;
    registration_endpoint?: string;
}

// --- Standalone Strategy ---
export class StandaloneStrategy implements VibeTransportStrategy {
    private accessToken: string | null = null;
    private user: User | null = null;
    private stateChangeListeners: ((isLoggedIn: boolean) => void)[] = [];
    private api;
    private options: StandaloneStrategyOptions;
    private oidcConfig: OIDCConfig | null = null;

    constructor(options: StandaloneStrategyOptions) {
        this.options = options;
        this.api = edenTreaty<App>(VIBE_API_URL);
    }

    async init() {
        await this.loadOIDCConfig();
        // Attempt to silently refresh the token on initialization
        await this.handleTokenRefresh();
    }

    private async loadOIDCConfig() {
        try {
            const response = await fetch(`${this.options.issuer}/.well-known/openid-configuration`);
            if (!response.ok) {
                throw new Error("Failed to fetch OIDC configuration");
            }
            this.oidcConfig = await response.json();
        } catch (error) {
            console.error("Error loading OIDC configuration:", error);
            throw error;
        }
    }

    private async handleTokenRefresh() {
        if (!this.oidcConfig) {
            await this.loadOIDCConfig();
        }
        try {
            const response = await fetch(this.oidcConfig!.token_endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    client_id: this.options.clientId,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                this.setAccessToken(null);
                this.setUser(null);
                throw new Error(data.error_description || "Failed to refresh token");
            }

            this.setAccessToken(data.access_token);
            await this.fetchUser();
        } catch (e) {
            console.error("Exception during token refresh:", e);
            this.setAccessToken(null);
            this.setUser(null);
        }
    }

    private async generatePkce() {
        const verifier = this.generateRandomString(128);
        const challenge = await this.sha256(verifier);
        const base64Challenge = this.base64UrlEncode(challenge);
        return { verifier, challenge: base64Challenge };
    }

    private generateRandomString(length: number) {
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);
        return Array.from(array, (byte) => ("0" + byte.toString(16)).slice(-2)).join("");
    }

    private async sha256(plain: string) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return window.crypto.subtle.digest("SHA-256", data);
    }

    private base64UrlEncode(buffer: ArrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    async login(): Promise<void> {
        if (!this.oidcConfig) {
            await this.loadOIDCConfig();
        }

        const state = this.generateRandomString(32);
        const nonce = this.generateRandomString(32);
        const { verifier, challenge } = await this.generatePkce();

        sessionStorage.setItem(`vibe_pkce_${state}`, verifier);
        sessionStorage.setItem(`vibe_nonce_${state}`, nonce);

        const authUrl = new URL(this.oidcConfig!.authorization_endpoint);
        authUrl.search = new URLSearchParams({
            client_id: this.options.clientId,
            redirect_uri: this.options.redirectUri,
            response_type: "code",
            scope: this.options.scopes.join(" "),
            state,
            nonce,
            code_challenge: challenge,
            code_challenge_method: "S256",
        }).toString();

        const popup = window.open(authUrl.toString(), "vibe-login", "width=600,height=700");

        return new Promise((resolve, reject) => {
            const handleMessage = async (event: MessageEvent) => {
                if (event.origin !== window.location.origin) {
                    return;
                }

                if (event.data.type === "vibe-auth-code") {
                    window.removeEventListener("message", handleMessage);
                    popup?.close();
                    try {
                        await this.exchangeCodeForToken(event.data.code, state);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                } else if (event.data.type === "vibe-registration-required") {
                    try {
                        await this.registerClient();
                        // Retry the login after successful registration
                        await this.login();
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
            };

            window.addEventListener("message", handleMessage);
        });
    }

    private async registerClient(): Promise<void> {
        if (!this.oidcConfig) {
            await this.loadOIDCConfig();
        }

        const response = await fetch(this.oidcConfig!.registration_endpoint!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_name: "My Vibe App",
                redirect_uris: [this.options.redirectUri],
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"],
                token_endpoint_auth_method: "none", // For public clients
            }),
        });

        if (!response.ok) {
            throw new Error("Failed to register client");
        }

        const client = await response.json();
        this.options.clientId = client.client_id;
    }

    private async exchangeCodeForToken(code: string, state: string): Promise<void> {
        const verifier = sessionStorage.getItem(`vibe_pkce_${state}`);
        if (!verifier) {
            throw new Error("Invalid state: PKCE verifier not found");
        }

        const response = await fetch(this.oidcConfig!.token_endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                client_id: this.options.clientId,
                redirect_uri: this.options.redirectUri,
                code,
                code_verifier: verifier,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error_description || "Failed to exchange code for token");
        }

        this.setAccessToken(data.access_token);
        await this.fetchUser();

        // Clean up storage
        sessionStorage.removeItem(`vibe_pkce_${state}`);
        sessionStorage.removeItem(`vibe_nonce_${state}`);
    }

    async logout(): Promise<void> {
        if (!this.oidcConfig) {
            await this.loadOIDCConfig();
        }
        // TODO: Add post_logout_redirect_uri and id_token_hint
        if (this.oidcConfig?.end_session_endpoint) {
            window.location.assign(this.oidcConfig.end_session_endpoint);
        }
        this.setAccessToken(null);
        this.setUser(null);
    }

    async signup(): Promise<void> {
        // Redirect to the login page with a signup hint
        const loginUrl = new URL(this.oidcConfig!.authorization_endpoint);
        loginUrl.searchParams.set("prompt", "create");
        await this.login();
    }

    private async fetchUser(): Promise<User | null> {
        if (!this.accessToken) return null;
        try {
            const decoded = jwtDecode(this.accessToken) as any;
            const user: User = {
                id: decoded.sub,
                did: decoded.sub, // Assuming sub is the DID
                name: decoded.name,
                email: decoded.email,
                picture: decoded.picture,
            };
            this.setUser(user);
            return user;
        } catch (e) {
            console.error("Failed to decode token or fetch user info", e);
            this.setUser(null);
            return null;
        }
    }

    async getUser(): Promise<User | null> {
        if (this.user) return this.user;
        return this.fetchUser();
    }

    onStateChange(callback: (isLoggedIn: boolean) => void) {
        this.stateChangeListeners.push(callback);
        return () => {
            this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== callback);
        };
    }

    private notifyStateChange() {
        this.stateChangeListeners.forEach((listener) => listener(this.isLoggedIn()));
    }

    isLoggedIn() {
        return !!this.accessToken;
    }

    private setAccessToken(token: string | null) {
        this.accessToken = token;
        this.notifyStateChange();
    }

    private setUser(user: User | null) {
        this.user = user;
    }

    // --- Vibe DB Methods ---
    async readOnce(collection: string, filter: any = {}): Promise<any> {
        if (!this.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }

        const { data, error } = await (this.api.data as any)[collection].query.post(filter, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        if (error) {
            if (error.status === 401) {
                await this.handleTokenRefresh();
                return this.readOnce(collection, filter); // Retry
            }
            console.error("Error reading data:", error.value);
            throw new Error("Failed to read data.");
        }

        return data;
    }

    async write(collection: string, doc: any): Promise<any> {
        if (!this.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }

        const { data, error } = await (this.api.data as any)[collection].post(doc, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        if (error) {
            if (error.status === 401) {
                await this.handleTokenRefresh();
                return this.write(collection, doc); // Retry
            }
            console.error("Error writing data:", error.value);
            throw new Error("Failed to write data.");
        }

        return data;
    }

    async remove(collection: string, data: any): Promise<any> {
        const itemsToProcess = Array.isArray(data) ? data : [data];
        const docsToDelete = itemsToProcess.map((doc) => ({ ...doc, _deleted: true }));
        return this.write(collection, docsToDelete);
    }

    async read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription> {
        if (!this.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }

        const VIBE_WS_URL = VIBE_API_URL.replace(/^http/, "ws");
        const wsApi = edenTreaty<App>(VIBE_WS_URL);
        const ws = (wsApi.data as any)[collection].subscribe({
            filter,
        });

        ws.on("open", () => {
            console.log("WebSocket connection opened");
            ws.send(
                JSON.stringify({
                    type: "auth",
                    token: this.accessToken,
                })
            );
        });

        ws.on("message", (message: any) => {
            try {
                callback({ ok: true, data: message.data });
            } catch (error: any) {
                callback({ ok: false, error: "Failed to parse message" });
            }
        });

        ws.on("error", (error: any) => {
            console.error("WebSocket error:", error);
            callback({ ok: false, error: error.message || "WebSocket error" });
        });

        const subscription: Subscription = {
            unsubscribe: () => {
                ws.close();
            },
        };

        return Promise.resolve(subscription);
    }
}
