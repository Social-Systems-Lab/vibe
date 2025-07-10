import { VibeTransportStrategy } from "../strategy";
import { ReadCallback, Subscription, User } from "../types";

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
};

export class HubStrategy implements VibeTransportStrategy {
    private hubUrl: string;
    private hubFrame: HTMLIFrameElement | null = null;
    private hubPort: MessagePort | null = null;
    private isInitialized = false;
    private pendingRequests = new Map<string, PendingRequest>();

    constructor(config: { hubUrl: string }) {
        this.hubUrl = config.hubUrl;
    }

    async init(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.hubFrame = document.createElement("iframe");
            this.hubFrame.style.display = "none";
            this.hubFrame.src = this.hubUrl;
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
        throw new Error("Login is not handled by the HubStrategy. It assumes an existing session.");
    }

    async logout(): Promise<void> {
        // In a real implementation, this might need to clear the hub's session.
        console.log("Logging out.");
    }

    async signup(): Promise<void> {
        throw new Error("Signup is not handled by the HubStrategy.");
    }

    async getUser(): Promise<User | null> {
        // This could be implemented to ask the hub for user info.
        // For the PoC, we'll return a mock user.
        return { did: "did:vibe:hub-user", instanceId: "hub-instance", displayName: "Hub User" };
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
