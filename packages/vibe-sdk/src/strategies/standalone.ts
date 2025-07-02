import { VibeTransportStrategy } from "../strategy";

const VIBE_WEB_URL = "http://localhost:3000"; // This should be the real URL of vibe-web
const VIBE_API_URL = "http://localhost:5000"; // This should be the real URL of vibe-cloud-api

function openCenteredPopup(url: string, width: number, height: number): Window | null {
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    return window.open(url, "vibeLogin", features);
}

export class StandaloneStrategy implements VibeTransportStrategy {
    private token: string | null = null;

    constructor() {
        if (typeof window !== "undefined") {
            this.token = localStorage.getItem("vibe_token");
        }
    }

    private async _auth(path: "login" | "signup"): Promise<void> {
        const authUrl = `${VIBE_WEB_URL}/auth/${path}`;
        const popup = openCenteredPopup(authUrl, 500, 600);

        return new Promise((resolve, reject) => {
            if (!popup) {
                return reject(new Error("Popup failed to open."));
            }

            const messageListener = (event: MessageEvent) => {
                if (event.origin !== VIBE_WEB_URL) {
                    // In production, this check should be more strict
                    return;
                }

                if (event.data && event.data.type === "VIBE_AUTH_SUCCESS") {
                    this.token = event.data.token;
                    localStorage.setItem("vibe_token", this.token!);
                    console.log("Received and stored auth token:", this.token);
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
        this.token = null;
        localStorage.removeItem("vibe_token");
        console.log("Standalone logout called, token cleared");
    }

    async signup(): Promise<void> {
        return this._auth("signup");
    }

    async getUser(): Promise<any> {
        if (!this.token) {
            return null;
        }

        try {
            const response = await fetch(`${VIBE_API_URL}/users/me`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch user");
            }

            const data = await response.json();
            return data.user;
        } catch (error) {
            console.error("Error fetching user:", error);
            return null;
        }
    }

    async read(collection: string, filter?: any): Promise<any> {
        console.log("Standalone read called", collection, filter);
        return [];
    }

    async write(collection: string, data: any): Promise<any> {
        console.log("Standalone write called", collection, data);
        return { ok: true };
    }
}
