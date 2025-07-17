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
    private isInitialized = false;
    private isInitializing = false;
    private pendingRequests = new Map<string, PendingRequest>();
    private subscriptions = new Map<string, ReadCallback>();
    private sessionManager: SessionManager;

    constructor(private config: { hubUrl: string; clientId: string; redirectUri: string; apiUrl: string }) {
        this.hubUrl = config.hubUrl;
        this.sessionManager = new SessionManager(config);
    }

    async init(user: User | null = null): Promise<void> {
        if (this.isInitialized || this.isInitializing) {
            return;
        }
        this.isInitializing = true;

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
                        payload: {
                            origin: window.location.origin,
                            user: user,
                            redirectUri: this.config.redirectUri,
                        },
                    },
                    this.hubUrl,
                    [channel.port2]
                );
            };

            this.hubPort.onmessage = (event) => {
                const { type, nonce, success, data, error, subscriptionId } = event.data;

                if (type === "INIT_ACK") {
                    this.isInitialized = true;
                    this.isInitializing = false;
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

    private async ensureInitialized() {
        if (!this.isInitialized) {
            await this.init();
        }
    }

    private generateNonce(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    private generateSubscriptionId(): string {
        return `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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

    private async postToHubSimple(message: any): Promise<void> {
        await this.ensureInitialized();
        if (!this.hubPort) {
            throw new Error("Hub port not available.");
        }
        this.hubPort.postMessage(message);
    }

    // --- Interface Methods ---

    public async setUser(user: User | null): Promise<void> {
        await this.ensureInitialized();
        await this.postToHub({ type: "SET_USER", payload: user });
    }

    async login(): Promise<void> {
        throw new Error("Login is not supported in HubStrategy. Use the authStrategy.");
    }

    async logout(): Promise<void> {
        throw new Error("Logout is not supported in HubStrategy. Use the authStrategy.");
    }

    async signup(): Promise<void> {
        throw new Error("Signup is not supported in HubStrategy. Use the authStrategy.");
    }

    async manageConsent(): Promise<void> {
        return this.postToHub({ type: "MANAGE_CONSENT" });
    }

    async manageProfile(): Promise<void> {
        return this.postToHub({ type: "MANAGE_PROFILE" });
    }

    async forceRefreshPermissions(): Promise<void> {
        return this.postToHubSimple({ type: "FORCE_REFRESH_PERMISSIONS" });
    }

    async getUser(): Promise<User | null> {
        return this.postToHub({ type: "GET_USER" });
    }

    isLoggedIn(): boolean {
        // The HubStrategy does not manage auth state directly.
        return false;
    }

    onStateChange(listener: (state: { isLoggedIn: boolean; user: User | null }) => void) {
        // This strategy does not produce auth state changes. It consumes them from the authStrategy.
        return () => {};
    }

    async readOnce(collection: string, query: any = {}): Promise<any> {
        const { global, ...filter } = query;
        const type = global ? "DB_GLOBAL_QUERY" : "DB_QUERY";
        return this.postToHub({ type, collection, payload: { ...filter, collection } });
    }

    async issueCert(targetDid: string, type: string, expires?: string): Promise<any> {
        throw new Error("issueCert is not supported in HubStrategy. Use the authStrategy.");
    }
    async revokeCert(certId: string): Promise<any> {
        throw new Error("revokeCert is not supported in HubStrategy. Use the authStrategy.");
    }

    async write(collection: string, data: any): Promise<any> {
        return this.postToHub({ type: "DB_WRITE", collection, payload: data });
    }

    async remove(collection: string, data: any): Promise<any> {
        return this.postToHub({ type: "DB_REMOVE", collection, payload: data });
    }

    async read(collection: string, query: any, callback: ReadCallback): Promise<Subscription> {
        await this.ensureInitialized();
        const subscriptionId = this.generateSubscriptionId();
        this.subscriptions.set(subscriptionId, callback);

        const { global, ...filter } = query;
        const type = global ? "DB_GLOBAL_SUBSCRIBE" : "DB_SUBSCRIBE";

        this.hubPort?.postMessage({
            type,
            payload: { collection, query: filter },
            subscriptionId,
        });

        // Also perform an initial read
        const initialData = await this.readOnce(collection, query);
        callback({ ok: true, data: initialData });

        return {
            unsubscribe: () => {
                this.subscriptions.delete(subscriptionId);
                const unsubscribeType = global ? "DB_GLOBAL_UNSUBSCRIBE" : "DB_UNSUBSCRIBE";
                this.hubPort?.postMessage({
                    type: unsubscribeType,
                    payload: { subscriptionId },
                });
            },
        };
    }

    async waitForInit() {
        if (this.isInitialized) {
            return;
        }
        return new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (this.isInitialized) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }
}
