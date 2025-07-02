import { VibeTransportStrategy } from "../strategy";

const VIBE_WEB_URL = "http://localhost:3000"; // This should be the real URL of vibe-web

function openCenteredPopup(url: string, width: number, height: number): Window | null {
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    return window.open(url, "vibeLogin", features);
}

export class StandaloneStrategy implements VibeTransportStrategy {
    private token: string | null = null;

    async login(): Promise<void> {
        const loginUrl = `${VIBE_WEB_URL}/login`;
        const popup = openCenteredPopup(loginUrl, 500, 600);

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

    async logout(): Promise<void> {
        this.token = null;
        console.log("Standalone logout called, token cleared");
    }

    async signup(): Promise<void> {
        // This would be a similar popup flow to login
        console.log("Standalone signup called");
        // For now, we'll just simulate a login
        return this.login();
    }

    async getUser(): Promise<any> {
        if (!this.token) {
            return null;
        }
        // In a real app, you'd use the token to fetch user data from the API
        console.log("Standalone getUser called, returning dummy user");
        return { name: "Authenticated User" };
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
