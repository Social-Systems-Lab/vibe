import { VibeTransportStrategy } from "../strategy";
import { ReadCallback, Subscription, User } from "../types";
import { SessionManager } from "../session-manager";

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
};

export class HubStrategy implements VibeTransportStrategy {
    private hubUrl: string;
    private hubFrame: HTMLIFrameElement | null = null;
    private hubPort: MessagePort | null = null;
    private sessionManager: SessionManager;
    private isInitialized = false;
    private pendingRequests = new Map<string, PendingRequest>();
    private stateChangeListeners: ((state: { isLoggedIn: boolean; user: User | null }) => void)[] = [];

    constructor(config: { hubUrl: string; clientId: string; redirectUri: string; apiUrl: string }) {
        this.hubUrl = config.hubUrl;
        this.sessionManager = new SessionManager(config);
    }

    async init(): Promise<void> {
        const sessionState = await this.sessionManager.checkSession();

        if (sessionState.status === "SILENT_LOGIN_SUCCESS" && sessionState.user) {
            this.notifyStateChange(true, sessionState.user);
        } else if (sessionState.status === "ONE_TAP_REQUIRED" && sessionState.user) {
            this.notifyStateChange(false, sessionState.user);
        } else {
            this.notifyStateChange(false, null);
        }

        if (this.isInitialized) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.hubFrame = document.createElement("iframe");
            this.hubFrame.style.display = "none";
            // Add a cache-busting query parameter
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
                    {
                        type: "INIT",
                        origin: window.location.origin,
                        user: sessionState.user,
                    },
                    this.hubUrl,
                    [channel.port2]
                );
            };

            this.hubPort.onmessage = (event) => {
                const { type, nonce, success, data, error } = event.data;

                if (type === "INIT_ACK") {
                    this.isInitialized = true;
                    console.log("Hub connection initialized successfully.");
                    resolve();
                    return;
                }

                if (type === "INIT_FAIL") {
                    reject(new Error(`Hub initialization failed: ${error}`));
                    return;
                }

                const pending = this.pendingRequests.get(nonce);
                if (pending) {
                    if (success) {
                        pending.resolve(data);
                    } else {
                        pending.reject(new Error(error));
                    }
                    this.pendingRequests.delete(nonce);
                }
            };
        });
    }

    private async ensureInitialized() {
        if (!this.isInitialized) {
            await this.init();
        }
    }

    private generateNonce(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    private postToHub(message: any): Promise<any> {
        return new Promise(async (resolve, reject) => {
            await this.ensureInitialized();
            if (!this.hubPort) {
                return reject(new Error("Hub port not available."));
            }
            const nonce = this.generateNonce();
            this.pendingRequests.set(nonce, { resolve, reject });
            this.hubPort.postMessage({ ...message, nonce });
        });
    }

    // --- Interface Methods ---

    async login(): Promise<void> {
        // The login flow is now handled by the session manager on init.
        // This method could be used to trigger a login prompt if the user is logged out.
        console.warn("HubStrategy.login() is not fully implemented in this PoC.");
    }

    async logout(): Promise<void> {
        console.warn("HubStrategy.logout() is not fully implemented in this PoC.");
    }

    async signup(): Promise<void> {
        console.warn("HubStrategy.signup() is not fully implemented in this PoC.");
    }

    async getUser(): Promise<User | null> {
        return this.postToHub({ type: "GET_USER" });
    }

    onStateChange(listener: (state: { isLoggedIn: boolean; user: User | null }) => void) {
        this.stateChangeListeners.push(listener);
        // For simplicity, we don't return an unsubscribe function in this PoC
        return () => {};
    }

    private notifyStateChange(isLoggedIn: boolean, user: User | null) {
        const state = { isLoggedIn, user };
        this.stateChangeListeners.forEach((listener) => listener(state));
    }

    async readOnce(collection: string, filter: any = {}): Promise<any> {
        return this.postToHub({ type: "DB_QUERY", collection, payload: filter });
    }

    async write(collection: string, data: any): Promise<any> {
        return this.postToHub({ type: "DB_WRITE", collection, payload: data });
    }

    async remove(collection: string, data: any): Promise<any> {
        return this.postToHub({ type: "DB_REMOVE", collection, payload: data });
    }

    async read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription> {
        // Real-time subscriptions are more complex and out of scope for this PoC.
        console.warn("Real-time 'read' with callback is not implemented in the HubStrategy PoC.");
        const data = await this.readOnce(collection, filter);
        callback({ ok: true, data });
        return {
            unsubscribe: () => {
                console.log("Unsubscribed from PoC read.");
            },
        };
    }
}
