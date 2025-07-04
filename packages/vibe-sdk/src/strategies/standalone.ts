import { VibeTransportStrategy } from "../strategy";
import { edenTreaty } from "@elysiajs/eden";
import type { App } from "vibe-cloud-api";
import { User } from "../types";

const VIBE_WEB_URL = "http://localhost:3000";
const VIBE_API_URL = "http://localhost:5000";

// --- Internal Auth Manager ---
class AuthManager {
    private accessToken: string | null = null;
    private user: User | null = null;
    private stateChangeListeners: ((isLoggedIn: boolean) => void)[] = [];
    constructor() {}

    getAccessToken() {
        return this.accessToken;
    }

    setAccessToken(token: string | null) {
        this.accessToken = token;
        this.notifyStateChange();
    }

    getUser() {
        return this.user;
    }

    setUser(user: User | null) {
        this.user = user;
    }

    isLoggedIn() {
        return !!this.getAccessToken();
    }

    onStateChange(listener: (isLoggedIn: boolean) => void) {
        this.stateChangeListeners.push(listener);
        return () => {
            this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== listener);
        };
    }

    private notifyStateChange() {
        this.stateChangeListeners.forEach((listener) => listener(this.isLoggedIn()));
    }
}

// --- Standalone Strategy ---
export class StandaloneStrategy implements VibeTransportStrategy {
    private authManager: AuthManager;
    private api;
    private isRefreshing = false;
    private refreshPromise: Promise<any> | null = null;

    constructor() {
        this.authManager = new AuthManager();
        this.api = edenTreaty<App>(VIBE_API_URL, {
            $fetch: {
                credentials: "include",
            },
        });
    }

    async init() {
        await this.handleTokenRefresh();
    }

    private async handleTokenRefresh() {
        console.log("Attempting to refresh token...");
        try {
            const { data, error } = await this.api.auth.refresh.post();
            console.log("Refresh API response:", { data, error });
            if (error) {
                this.authManager.setAccessToken(null);
                this.authManager.setUser(null);
                throw new Error("Failed to refresh token");
            }
            if (data && typeof data === "object" && "token" in data) {
                this.authManager.setAccessToken(data.token as string);
                await this.getUser();
            }
        } catch (e) {
            console.error("Exception during token refresh:", e);
            this.authManager.setAccessToken(null);
            this.authManager.setUser(null);
            throw e;
        }
    }

    private openCenteredPopup(url: string, width: number, height: number): Window | null {
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
        return window.open(url, "vibeLogin", features);
    }

    private async _auth(path: "login" | "signup"): Promise<void> {
        const authUrl = `${VIBE_WEB_URL}/auth/${path}`;
        const popup = this.openCenteredPopup(authUrl, 500, 600);

        return new Promise((resolve, reject) => {
            if (!popup) {
                return reject(new Error("Popup failed to open."));
            }

            const messageListener = async (event: MessageEvent) => {
                if (event.origin !== VIBE_WEB_URL) return;

                if (event.data && event.data.type === "VIBE_AUTH_SUCCESS") {
                    this.authManager.setAccessToken(event.data.token);
                    await this.getUser();
                    window.removeEventListener("message", messageListener);
                    popup.close();
                    resolve();
                }

                if (event.data && event.data.type === "VIBE_AUTH_FAIL") {
                    window.removeEventListener("message", messageListener);
                    popup.close();
                    reject(new Error("Authentication failed."));
                }
            };

            window.addEventListener("message", messageListener);

            const timer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(timer);
                    window.removeEventListener("message", messageListener);
                    reject(new Error("Login window was closed by the user."));
                }
            }, 500);
        });
    }

    async login(): Promise<void> {
        return this._auth("login");
    }

    async logout(): Promise<void> {
        await this.api.auth.logout.post();
        this.authManager.setAccessToken(null);
        this.authManager.setUser(null);
    }

    async signup(): Promise<void> {
        return this._auth("signup");
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
                if (error.status === 401) {
                    if (!this.isRefreshing) {
                        this.isRefreshing = true;
                        this.refreshPromise = this.handleTokenRefresh();
                    }
                    await this.refreshPromise;
                    this.isRefreshing = false;
                    this.refreshPromise = null;
                    // Retry the request
                    return this.getUser();
                }
                console.error("Error fetching user:", error.value);
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

    onStateChange(callback: (isLoggedIn: boolean) => void) {
        return this.authManager.onStateChange(callback);
    }

    // --- Vibe DB Methods (Not Implemented) ---
    async read(collection: string, filter?: any): Promise<any> {
        console.log("Standalone read called", collection, filter);
        return [];
    }

    async write(collection: string, data: any): Promise<any> {
        console.log("Standalone write called", collection, data);
        return { ok: true };
    }
}
