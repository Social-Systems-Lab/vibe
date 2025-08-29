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
    debug?: boolean;
};

export class VibeSDK {
    public isAuthenticated = false;
    public user: User | null = null;
    private isInitialized = false;
    private isInitializing = false;
    private debug: boolean = false;

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

    // Storage helper namespace
    public storage = {
        /**
         * High-level upload that returns both storageKey and created file metadata (server-created).
         * Accepts optional metadata { acl?, description?, tags? } which will be used when creating the file document.
         */
        upload: async (
            file: File & { type?: string; name: string },
            opts?: { acl?: unknown; description?: string; tags?: string[] }
        ): Promise<{
            storageKey: string;
            file?: { id?: string; name?: string; storageKey: string; mimeType?: string; size?: number };
        }> => {
            if (!this.authManager.isLoggedIn()) throw new Error("Not authenticated");
            const headers = { Authorization: `Bearer ${this.authManager.getAccessToken()}` };

            // 1) Ask API for upload plan (presign or server-upload), forwarding metadata
            const presignBody = {
                name: file.name,
                mime: file.type || "",
                size: (file as any).size as number,
                ...(opts || {}),
            };
            const { data: plan, error: planErr } = await this.api.storage["presign-put"].post(presignBody, { headers });
            if (planErr) throw new Error(`Failed to prepare upload: ${JSON.stringify(planErr)}`);

            // 2) Execute plan
            let storageKey: string | undefined;
            let createdFile:
                | { id?: string; name?: string; storageKey: string; mimeType?: string; size?: number }
                | undefined;

            if (plan && plan.strategy === "presigned") {
                const putHeaders = new Headers(plan.headers || {});
                if (!putHeaders.has("Content-Type") && file.type) putHeaders.set("Content-Type", file.type);
                const putRes = await fetch(plan.url!, { method: "PUT", body: file, headers: putHeaders });
                if (!putRes.ok) throw new Error(`Presigned upload failed with ${putRes.status}`);
                storageKey = plan.storageKey;

                // 3) Commit metadata to create files doc
                const commitBody = {
                    storageKey,
                    name: file.name,
                    mime: file.type || plan.metadata?.mime,
                    size: (file as any).size || plan.metadata?.size,
                    ...(opts || {}),
                };
                const { data: commitRes, error: commitErr } = await this.api.storage["commit"].post(commitBody, {
                    headers,
                });
                if (commitErr) {
                    console.warn("Commit metadata failed; continuing without file doc", commitErr);
                } else if (commitRes && typeof commitRes === "object" && "file" in commitRes) {
                    createdFile = commitRes.file as typeof createdFile;
                }
            } else if (plan && plan.strategy === "server-upload") {
                storageKey = plan.storageKey;

                // Use edenTreaty typed multipart posting: pass a File directly; treaty detects multipart and encodes it.
                const uploadBody = {
                    file,
                    storageKey,
                    name: file.name,
                    mime: file.type || plan.metadata?.mime,
                    size: (file as any).size || plan.metadata?.size,
                    ...(opts || {}),
                };
                const { data: upRes, error: upErr } = await this.api.storage.upload.post(uploadBody as any, {
                    headers,
                });
                if (upErr) throw new Error(`Server upload failed: ${JSON.stringify(upErr)}`);
                if (upRes && typeof upRes === "object") {
                    if ("storageKey" in upRes && (upRes as any).storageKey)
                        storageKey = (upRes as any).storageKey as string;
                    if ("file" in upRes) createdFile = upRes.file as typeof createdFile;
                }
            } else {
                throw new Error("Invalid upload plan from server");
            }

            if (!storageKey) throw new Error("Upload did not yield a storageKey");
            return { storageKey, file: createdFile };
        },

        // Low-level helpers (kept internal-ish but available)
        presignPut: async (name: string, mime?: string, size?: number, sha256?: string) => {
            if (!this.authManager.isLoggedIn()) throw new Error("Not authenticated");
            const { data, error } = await this.api.storage["presign-put"].post(
                { name, mime, size, sha256 },
                {
                    headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
                }
            );
            if (error) throw new Error(`Failed to presign PUT: ${JSON.stringify(error)}`);
            return data;
        },

        presignGet: async (storageKey: string, expires?: number) => {
            if (!this.authManager.isLoggedIn()) throw new Error("Not authenticated");
            const { data, error } = await this.api.storage["presign-get"].post(
                { storageKey, expires },
                {
                    headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
                }
            );
            if (error) throw new Error(`Failed to presign GET: ${JSON.stringify(error)}`);
            return data;
        },
    };

    constructor(config: VibeManifest) {
        this.config = config;
        this.debug = !!config.debug;
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
        if (this.debug) {
            console.log("VibeSDK Manifest:", this.config);
        }

        // Start Hub initialization and wait for it to be ready
        try {
            await this.initHub();
        } catch (hubError) {
            console.error("VibeSDK: Hub initialization failed.", hubError);
            this.isInitializing = false;
            // Optionally, re-throw or handle this as a fatal error for the consuming app
            throw hubError;
        }

        // Listen for auth state changes to sync with the Hub
        this.onStateChange(() => {});

        // Check the session state using Standalone's logic
        const sessionState = await this.sessionManager.checkSession();
        if (this.debug) {
            console.log("VibeSDK: session state checked.", sessionState);
        }

        if (sessionState.status === "LOGGED_IN") {
            this.authManager.setUser(sessionState.user || null);
            if (sessionState.hasConsented) {
                if (sessionState.code) {
                    console.log("VibeSDK: User has consented, exchanging code for token.");
                    try {
                        await this.exchangeCodeForToken(sessionState.code);
                    } catch (e) {
                        console.error("Token exchange failed:", e);
                    }
                }
            } else {
                console.log("VibeSDK: Consent is required.");
                await this.redirectToAuthorize("login", true, "signup", "consent", sessionState.hasConsented);
            }
            this.authManager.notifyStateChange();
        }

        this.isInitializing = false;
        this.isInitialized = true;
        console.log("VibeSDK: Initialization complete.");
        return sessionState;
    }

    // --- Hub Methods (from HubStrategy) ---
    private initHub(): Promise<void> {
        if (this.debug) {
            console.log("VibeSDK: initHub started.");
        }
        return new Promise((resolve, reject) => {
            this.hubFrame = document.createElement("iframe");
            this.hubFrame.style.display = "none";
            const cacheBustedUrl = new URL(this.hubUrl);
            cacheBustedUrl.searchParams.set("t", Date.now().toString());
            this.hubFrame.src = cacheBustedUrl.toString();
            if (this.debug) {
                console.log("VibeSDK: Hub iframe src:", this.hubFrame.src);
            }
            document.body.appendChild(this.hubFrame);

            const channel = new MessageChannel();
            this.hubPort = channel.port1;

            this.hubFrame.onload = () => {
                if (this.debug) {
                    console.log("VibeSDK: Hub iframe onload event triggered.");
                }
                if (!this.hubFrame || !this.hubFrame.contentWindow) {
                    if (this.debug) {
                        console.error("VibeSDK: Hub iframe or contentWindow not available on load.");
                    }
                    return reject(new Error("Hub iframe failed to load."));
                }
                const targetOrigin = new URL(this.hubUrl).origin;
                if (this.debug) {
                    console.log("VibeSDK: Posting INIT message to hub with target origin:", targetOrigin);
                }
                this.hubFrame.contentWindow.postMessage(
                    {
                        action: "INIT",
                        payload: {
                            origin: window.location.origin,
                            user: this.user,
                            redirectUri: this.config.redirectUri,
                        },
                    },
                    targetOrigin,
                    [channel.port2]
                );
            };

            this.hubFrame.onerror = (error) => {
                if (this.debug) {
                    console.error("VibeSDK: Hub iframe onerror event triggered.", error);
                }
                reject(new Error("Hub iframe failed to load with an error."));
            };

            this.hubPort.onmessage = (event) => {
                const { action, nonce, success, data, error, subscriptionId } = event.data;

                if (this.debug) {
                    console.log("VibeSDK: Received message from hub:", event.data);
                }

                if (action === "INIT_ACK") {
                    console.log("Hub connection initialized successfully.");
                    resolve();
                    return;
                }
                if (action === "INIT_FAIL") {
                    reject(new Error(`Hub initialization failed: ${error}`));
                    return;
                }
                if (action === "DB_UPDATE") {
                    const callback = this.subscriptions.get(subscriptionId);
                    if (callback) {
                        callback({ ok: true, data });
                    }
                    return;
                }
                if (action.endsWith("_ACK")) {
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
        // Since we get consent status on init, we can pass it here.
        // The `user` object on the authManager should be populated by the time this is called.
        const sessionState = await this.sessionManager.checkSession();
        await this.redirectToAuthorize("login", false, "settings", "consent", sessionState.hasConsented);
    }

    async manageProfile(): Promise<void> {
        await this.redirectToAuthorize("profile", false, "settings", "profile", true);
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
        flow: "signup" | "settings" = "signup",
        prompt?: "consent" | "profile" | "login",
        hasConsented?: boolean
    ): Promise<void> {
        const { generatePkce } = await import("./strategies/standalone");
        const pkce = await generatePkce();
        sessionStorage.setItem("vibe_pkce_verifier", pkce.verifier);
        const state = window.crypto
            .getRandomValues(new Uint8Array(16))
            .reduce((s, byte) => s + byte.toString(16).padStart(2, "0"), "");
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
        params.set("flow", flow);
        if (flow === "settings") {
            params.set("redirect_uri", window.location.href);
        }
        if (promptConsent) {
            params.set("prompt", "consent");
        }
        if (prompt) {
            params.set("prompt", prompt);
        }
        if (hasConsented === true) {
            params.set("hasConsented", "true");
        } else if (hasConsented === false) {
            params.set("hasConsented", "false");
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
        window.top!.location.href = url;
    }

    async getUser(): Promise<User | null> {
        if (!this.authManager.isLoggedIn()) return null;
        try {
            const { data, error } = await this.api.users.me.get({
                $headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
            });
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

    getToken(): string | null {
        return this.authManager.getAccessToken();
    }

    // --- Data Methods (from HubStrategy, now using postToHub) ---
    async read(type: string, query: any, callback: ReadCallback): Promise<Subscription> {
        const subscriptionId = this.generateNonce(); // Re-use nonce generation for sub ids
        this.subscriptions.set(subscriptionId, callback);

        const { global, ...filter } = query;
        const action = global ? "DB_GLOBAL_SUBSCRIBE" : "DB_SUBSCRIBE";

        this.hubPort?.postMessage({ action, type, payload: { query: filter }, subscriptionId });

        const initialData = await this.readOnce(type, query);
        callback({ ok: true, data: initialData.docs });

        return {
            unsubscribe: () => {
                this.subscriptions.delete(subscriptionId);
                const unsubscribeType = global ? "DB_GLOBAL_UNSUBSCRIBE" : "DB_UNSUBSCRIBE";
                this.hubPort?.postMessage({ action: unsubscribeType, payload: { subscriptionId } });
            },
        };
    }

    async readOnce<T extends Document>(type: string, query: any = {}): Promise<ReadOnceResponse<T>> {
        const { global, ...filter } = query;
        const action = global ? "DB_GLOBAL_QUERY" : "DB_QUERY";
        const result = await this.postToHub({ action, type, payload: { ...filter } });
        return {
            docs: result,
            doc: result?.[0],
        };
    }

    async write(type: string, data: any): Promise<any> {
        return this.postToHub({ action: "DB_WRITE", type, payload: data });
    }

    async remove(type: string, data: any): Promise<any> {
        return this.postToHub({ action: "DB_REMOVE", type, payload: data });
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
        const authUnsubscribe = this.authManager.onStateChange(
            async (state: { isLoggedIn: boolean; user: User | null }) => {
                this.user = state.user;

                // Inform the hub about the user change
                if (this.hubPort) {
                    this.postToHub({ action: "SET_USER", payload: this.user });
                }

                this.isAuthenticated = state.isLoggedIn;
                callback({ isAuthenticated: this.isAuthenticated, user: this.user });
            }
        );

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
