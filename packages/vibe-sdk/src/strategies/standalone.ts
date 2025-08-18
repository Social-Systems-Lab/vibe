import { VibeTransportStrategy } from "../strategy";
import { edenTreaty, treaty } from "@elysiajs/eden";
import type { App } from "vibe-cloud-api";
import { User, ReadCallback, Subscription, Certificate, DocRef, CertType, Document, ReadOnceApiResponse } from "vibe-core";
import { SessionManager, SessionState } from "../session-manager";
import { deriveEncryptionKey, decryptData, privateKeyHexToPkcs8Pem } from "vibe-core";
import * as jose from "jose";

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
export type StandaloneStrategyConfig = {
    clientId: string;
    redirectUri: string;
    apiUrl: string;
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

export class StandaloneStrategy implements VibeTransportStrategy {
    private authManager: AuthManager;
    private sessionManager: SessionManager;
    private api;
    private config: StandaloneStrategyConfig;

    constructor(config: StandaloneStrategyConfig) {
        this.authManager = new AuthManager();
        this.api = edenTreaty<App>(config.apiUrl);
        this.config = config;
        this.sessionManager = new SessionManager(this.config);
    }

    async init(): Promise<SessionState> {
        console.log("StandaloneStrategy: init started.");
        const sessionState = await this.sessionManager.checkSession();
        console.log("StandaloneStrategy: session state checked.", sessionState);

        if (sessionState.status === "SILENT_LOGIN_SUCCESS" && sessionState.code) {
            console.log("StandaloneStrategy: Silent login success, exchanging code for token.");
            try {
                await this.exchangeCodeForToken(sessionState.code);
            } catch (e) {
                console.error("Silent login failed:", e);
            }
        } else if (sessionState.status === "LOGGED_IN") {
            console.log("StandaloneStrategy: User is logged in.", sessionState.user);
            this.authManager.setUser(sessionState.user || null);
            this.authManager.notifyStateChange();
        } else if (sessionState.status === "CONSENT_REQUIRED") {
            console.log("StandaloneStrategy: Consent is required.");
            await this.redirectToAuthorize("login", true);
        } else {
            console.log("StandaloneStrategy: No active session found or session status is not LOGGED_IN.");
        }
        console.log("StandaloneStrategy: init finished.");
        return sessionState;
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

    private redirectToAuthorize(
        formType: "login" | "signup" | "profile" = "signup",
        promptConsent = false,
        flow: "signup" | "settings" = "signup"
    ): Promise<void> {
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

            const formType = new URL(url).searchParams.get("form_type");
            if (formType === "signup") {
                await this.manageProfile();
            }
        } else {
            throw new Error("Invalid response from token endpoint.");
        }
    }

    async logout(): Promise<void> {
        // Clear client-side session first
        this.authManager.setAccessToken(null);
        this.authManager.setUser(null);
        sessionStorage.removeItem("vibe_pkce_verifier");
        sessionStorage.removeItem("vibe_oauth_state");

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
    async readOnce<T extends Document>(type: string, query: any = {}): Promise<ReadOnceApiResponse<T>> {
        if (!this.authManager.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }

        const { expand, global, ...selector } = query;
        const apiQuery: { [key: string]: any } = {};
        if (expand) {
            apiQuery.expand = Array.isArray(expand) ? expand.join(",") : expand;
        }
        if (global) {
            apiQuery.global = "true";
        }

        const { data, error } = await (this.api.data as any).types[type].query.post(selector, {
            headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
            query: apiQuery,
        });

        if (error) {
            console.error("Error reading data:", error.value);
            throw new Error("Failed to read data.");
        }
        return data as ReadOnceApiResponse<T>;
    }

    async write(type: string, doc: any): Promise<any> {
        if (!this.authManager.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }
        const { data, error } = await (this.api.data as any).types[type].post(doc, {
            headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
        });
        if (error) {
            console.error("Error writing data:", error.value);
            throw new Error("Failed to write data.");
        }
        return data;
    }

    async remove(type: string, data: any): Promise<any> {
        const itemsToProcess = Array.isArray(data) ? data : [data];
        const docsToDelete = itemsToProcess.map((doc) => ({ ...doc, _deleted: true }));
        return this.write(type, docsToDelete);
    }

    async read(type: string, query: any, callback: ReadCallback): Promise<Subscription> {
        if (!this.authManager.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }

        const { global, ...restQuery } = query;
        const VIBE_WS_URL = this.config.apiUrl.replace(/^http/, "ws");
        const wsApi = edenTreaty<App>(VIBE_WS_URL);

        const ws = global ? (wsApi.data as any).global.subscribe() : (wsApi.data as any).types[type].subscribe();

        ws.on("open", () => {
            const authMessage = {
                type: "auth",
                token: this.authManager.getAccessToken(),
                query: { ...restQuery, type: global ? type : undefined },
            };
            ws.send(JSON.stringify(authMessage));
        });

        ws.on("message", async (message: any) => {
            if (message.data.action === "error" && message.data.message === "Token expired") {
                try {
                    await this.getUser(); // This will trigger a token refresh if needed
                    const authMessage = {
                        type: "auth",
                        token: this.authManager.getAccessToken(),
                        query: { ...restQuery, type: global ? type : undefined },
                    };
                    ws.send(JSON.stringify(authMessage));
                } catch (e) {
                    callback({ ok: false, error: "Failed to refresh token" });
                }
            } else {
                callback({ ok: true, data: message.data });
            }
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

    async issueCert(targetDid: string, certType: DocRef, expires?: string): Promise<any> {
        console.log("issueCert: Starting the certificate issuance process.");
        if (!this.authManager.isLoggedIn()) {
            console.error("issueCert Error: User is not authenticated.");
            throw new Error("User is not authenticated.");
        }

        const user = this.authManager.getUser();
        if (!user) {
            console.error("issueCert Error: User not found.");
            throw new Error("User not found.");
        }
        console.log("issueCert: User authenticated, proceeding.", { user });

        // 1. Fetch the encrypted private key
        console.log("issueCert: Fetching encrypted private key...");
        const { data: keyData, error: keyError } = await this.api.users.me["encrypted-key"].get({
            $headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
        });

        if (keyError) {
            console.error("issueCert Error: Failed to fetch encrypted key.", keyError);
            throw new Error("Failed to fetch encrypted key.");
        }
        const { encryptedPrivateKey } = keyData as any;
        console.log("issueCert: Encrypted private key fetched successfully.");

        // 2. Get the decrypted private key using the new interactive prompt
        const privateKeyHex = await this.promptForPasswordAndDecryptKey(encryptedPrivateKey);

        if (privateKeyHex === null) {
            // This means the user closed the prompt.
            throw new Error("User cancelled the operation.");
        }

        // 3. Continue with signing and issuing
        try {
            const pkcs8Pem = privateKeyHexToPkcs8Pem(privateKeyHex);
            console.log("issueCert: Private key converted to PKCS#8 PEM.");

            const certId = `issued-certs/${certType.ref}-${targetDid}-${Date.now()}`;
            const certPayload = {
                jti: certId,
                type: certType.ref,
                sub: targetDid,
                iss: user.did,
                exp: expires ? Math.floor(new Date(expires).getTime() / 1000) : undefined,
            };
            console.log("issueCert: Certificate payload created.", { certPayload });

            const privateKey = await jose.importPKCS8(pkcs8Pem, "EdDSA");
            console.log("issueCert: jose.Private key imported.");
            const signature = await new jose.CompactSign(new TextEncoder().encode(JSON.stringify(certPayload)))
                .setProtectedHeader({ alg: "EdDSA" })
                .sign(privateKey);
            console.log("issueCert: Certificate signed successfully.");

            const certificate: Certificate = {
                _id: certId,
                type: certType.ref,
                certType: certType,
                issuer: user.did,
                subject: targetDid,
                expires,
                signature,
            };
            console.log("issueCert: Certificate object created.", { certificate });

            // 4. Send the signed certificate to the server
            console.log("issueCert: Sending signed certificate to the server...");
            const { data, error } = await this.api.certs.issue.post(certificate, {
                headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
            });

            if (error) {
                console.error("issueCert Error: Error issuing certificate from API.", error.value);
                throw new Error("Failed to issue certificate.");
            }

            console.log("issueCert: Certificate issued successfully.", { data });
            return data;
        } catch (e: any) {
            console.error("issueCert Error: An error occurred during the crypto or signing process.", e);
            throw e;
        }
    }

    private promptForPasswordAndDecryptKey(encryptedPrivateKey: any): Promise<string | null> {
        return new Promise((resolve) => {
            const url = `${this.config.apiUrl}/password-prompt.html?openerOrigin=${encodeURIComponent(window.location.origin)}`;
            const popup = window.open(url, "vibe-password-prompt", "width=400,height=350,popup=true");

            const messageListener = async (event: MessageEvent) => {
                if (event.source !== popup) {
                    return;
                }

                if (event.data.action === "vibe_password_submission") {
                    const { password } = event.data;
                    try {
                        const encryptionKey = await deriveEncryptionKey(password, Buffer.from(encryptedPrivateKey.salt, "hex"));
                        const privateKeyHex = await decryptData(encryptedPrivateKey, encryptionKey);

                        popup?.postMessage({ action: "vibe_password_accepted" }, this.config.apiUrl);

                        clearInterval(interval);
                        window.removeEventListener("message", messageListener);
                        popup?.close();
                        resolve(privateKeyHex);
                    } catch (e) {
                        console.error("issueCert Error: Decryption failed, likely incorrect password.", e);
                        popup?.postMessage({ action: "vibe_password_invalid", error: "Incorrect password. Please try again." }, this.config.apiUrl);
                    }
                }
            };

            const interval = setInterval(() => {
                if (popup?.closed) {
                    clearInterval(interval);
                    window.removeEventListener("message", messageListener);
                    resolve(null); // User closed the popup
                }
            }, 500);

            window.addEventListener("message", messageListener);
        });
    }

    async revokeCert(certId: string): Promise<any> {
        if (!this.authManager.isLoggedIn()) {
            throw new Error("User is not authenticated.");
        }
        const { data, error } = await (this.api.certs as any).revoke[certId].post(
            {},
            {
                headers: { Authorization: `Bearer ${this.authManager.getAccessToken()}` },
            }
        );
        if (error) {
            console.error("Error revoking certificate:", error.value);
            throw new Error("Failed to revoke certificate.");
        }
        return data;
    }
}
