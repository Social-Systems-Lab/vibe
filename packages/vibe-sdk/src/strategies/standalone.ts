import { VibeTransportStrategy } from "../strategy";
import { edenTreaty } from "@elysiajs/eden";
import type { App } from "vibe-cloud-api";
import { User, ReadCallback, Subscription } from "../types";
import { SessionManager } from "../session-manager";

const VIBE_API_URL = "http://localhost:5000";

// --- PKCE Helper ---
export async function generatePkce() {
    const verifier = window.crypto.getRandomValues(new Uint8Array(32)).reduce((s, byte) => s + String.fromCharCode(byte), "");
    const base64Verifier = btoa(verifier).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const encoder = new TextEncoder();
    const data = encoder.encode(base64Verifier);
    const digest = await window.crypto.subtle.digest("SHA-256", data);

    const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

    return { verifier: base64Verifier, challenge: base64Digest };
}

// --- Internal Auth Manager (Simplified) ---
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

// --- Standalone Strategy (Redirect Flow) ---
export class StandaloneStrategy implements VibeTransportStrategy {
    private authManager: AuthManager;
    private sessionManager: SessionManager;
    private api;
    private config: {
        clientId: string;
        redirectUri: string;
        apiUrl: string;
        appImageUrl?: string;
    };

    constructor(config: { clientId: string; redirectUri: string; apiUrl?: string; appImageUrl?: string }) {
        this.authManager = new AuthManager();
        const apiUrl = config.apiUrl || VIBE_API_URL;
        this.api = edenTreaty<App>(apiUrl);
        this.config = { ...config, apiUrl };
        this.sessionManager = new SessionManager(this.config);
    }

    async init(): Promise<void> {
        const sessionState = await this.sessionManager.checkSession();

        if (sessionState.status === "SILENT_LOGIN_SUCCESS" && sessionState.code) {
            try {
                await this.exchangeCodeForToken(sessionState.code);
            } catch (e) {
                console.error("Silent login failed:", e);
            }
        } else if (sessionState.status === "ONE_TAP_REQUIRED") {
            this.authManager.setUser(sessionState.user || null);
        }
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

    private redirectToAuthorize(formType: "login" | "signup" | "profile", promptConsent = false): Promise<void> {
        return new Promise(async (resolve, reject) => {
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
            });

            if (promptConsent) {
                params.set("prompt", "consent");
            }

            if (this.config.appImageUrl) {
                params.set("app_image_url", this.config.appImageUrl);
            }

            const url = `${this.config.apiUrl}/auth/authorize?${params.toString()}`;
            const popup = window.open(url, "vibe-auth", "width=600,height=700,popup=true");

            const messageListener = async (event: MessageEvent) => {
                if (event.source !== popup) {
                    return;
                }

                if (event.data.type === "vibe_auth_profile_updated") {
                    popup?.close();
                    this.getUser();
                    resolve();
                } else if (event.data.type === "vibe_auth_callback") {
                    if (promptConsent) {
                        const url = new URL(event.data.url);
                        const error = url.searchParams.get("error");
                        if (error === "access_denied") {
                            this.authManager.setAccessToken(null);
                            this.authManager.setUser(null);
                        }
                        window.removeEventListener("message", messageListener);
                        popup?.close();
                        this.getUser();
                        this.authManager.notifyStateChange();
                        resolve();
                    } else {
                        window.removeEventListener("message", messageListener);
                        popup?.close();
                        try {
                            await this.handleRedirectCallback(event.data.url);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    }
                }
            };

            window.addEventListener("message", messageListener);
        });
    }

    async login(): Promise<void> {
        return new Promise(async (resolve) => {
            const unsubscribe = this.onStateChange((state) => {
                if (state.isLoggedIn) {
                    unsubscribe();
                    resolve();
                }
            });
            await this.redirectToAuthorize("login");
        });
    }

    async signup(): Promise<void> {
        await this.redirectToAuthorize("signup");
    }

    async manageConsent(): Promise<void> {
        await this.redirectToAuthorize("login", true);
    }

    async manageProfile(): Promise<void> {
        await this.redirectToAuthorize("profile");
    }

    async handleRedirectCallback(url: string): Promise<void> {
        const params = new URLSearchParams(new URL(url).search);
        const code = params.get("code");
        const state = params.get("state");

        const storedState = sessionStorage.getItem("vibe_oauth_state");
        const storedVerifier = sessionStorage.getItem("vibe_pkce_verifier");

        sessionStorage.removeItem("vibe_oauth_state");
        sessionStorage.removeItem("vibe_pkce_verifier");

        if (!code || !state || !storedState || state !== storedState) {
            throw new Error("Invalid state or missing code from auth server.");
        }
        if (!storedVerifier) {
            throw new Error("Missing PKCE verifier.");
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

    async logout(): Promise<void> {
        // Clear client-side session first
        this.authManager.setAccessToken(null);
        this.authManager.setUser(null);

        // Redirect to the central logout endpoint
        const logoutUrl = new URL(`${this.config.apiUrl}/auth/logout`);
        logoutUrl.searchParams.set("redirect_uri", window.location.href);
        window.location.href = logoutUrl.toString();

        // Return a promise that never resolves, as the page is navigating away
        return new Promise(() => {});
    }

    async getUser(): Promise<User | null> {
        if (!this.authManager.isLoggedIn()) {
            return null;
        }
        try {
            const { data, error } = await this.api.users.me.get({
                $headers: {
                    Authorization: `Bearer ${this.authManager.getAccessToken()}`,
                },
            });

            if (error) {
                // Unlike before, we don't handle refresh. We just fail.
                // The app should re-initiate login, which will be seamless with SSO.
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

    onStateChange(callback: (state: { isLoggedIn: boolean; user: User | null }) => void) {
        return this.authManager.onStateChange(callback);
    }

    notifyStateChange() {
        this.authManager.notifyStateChange();
    }

    // --- Vibe DB Methods (unchanged) ---
    async readOnce(collection: string, query: any = {}): Promise<any> {
        if (!this.authManager.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }

        console.log("Reading once from collection:", collection, "with query:", query);

        const { expand, ...selector } = query;
        const apiQuery: { [key: string]: any } = {};
        if (expand) {
            apiQuery.expand = expand.join(",");
        }

        const { data, error } = await (this.api.data as any)[collection].query.post(selector, {
            headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
            query: apiQuery,
        });

        if (error) {
            console.error("Error reading data:", error.value);
            throw new Error("Failed to read data.");
        }
        return data;
    }

    async write(collection: string, doc: any): Promise<any> {
        if (!this.authManager.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }
        const { data, error } = await (this.api.data as any)[collection].post(doc, {
            headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
        });
        if (error) {
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

    async read(collection: string, query: any, callback: ReadCallback): Promise<Subscription> {
        if (!this.authManager.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }

        const { expand, ...selector } = query;

        if (expand) {
            this.readOnce(collection, query)
                .then((data) => callback({ ok: true, data: data.docs }))
                .catch((error) => callback({ ok: false, error: error.message }));
        }

        const VIBE_WS_URL = this.config.apiUrl.replace(/^http/, "ws");
        const wsApi = edenTreaty<App>(VIBE_WS_URL);
        const ws = (wsApi.data as any)[collection].subscribe({ filter: selector });
        ws.on("open", () => {
            ws.send(JSON.stringify({ type: "auth", token: this.authManager.getAccessToken() }));
        });
        ws.on("message", (message: any) => {
            callback({ ok: true, data: message.data });
        });
        ws.on("error", (error: any) => {
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
