// packages/vibe-sdk/src/index.ts
import { BlobManager } from "./blob";
import type { AppManifest, ReadResult, Unsubscribe, VibeState, WriteResult, VibeAgent } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class Vibe {
    private agent: VibeAgent;
    public blob: BlobManager;
    public token: string | null = null;
    public instanceUrl: string | null = null;
    public appId: string | null = null;

    constructor(agent: VibeAgent) {
        this.agent = agent;
        this.blob = new BlobManager(this);
    }

    async init(manifest: AppManifest, onStateChange: (state: VibeState) => void): Promise<Unsubscribe> {
        this.appId = manifest.appId;
        const initialState = await this.agent.init(manifest);

        // This is a simplified state management. A real implementation might use a more robust event emitter.
        const handler = (event: MessageEvent) => {
            if (event.data.type === "vibe-state-update") {
                onStateChange(event.data.payload);
            }
        };
        window.addEventListener("message", handler);

        // After init, we might have an identity and can claim a JWT
        if (initialState.activeIdentity) {
            try {
                // This is a simplified flow. The agent would handle when to claim.
                const { jwt } = await this.agent.claimIdentityWithCode(initialState.activeIdentity.did, "some-claim-code"); // Claim code flow needs more definition
                this.token = jwt;
                // The instance URL would also need to be discovered/provided.
                // For now, we'll assume it's part of the state or a separate discovery mechanism.
                // this.instanceUrl = ...
            } catch (error) {
                console.error("Failed to claim identity JWT:", error);
            }
        }

        onStateChange(initialState);

        const unsubscribe = () => {
            window.removeEventListener("message", handler);
            // Potentially call an agent.disconnect() method if it exists
        };
        return unsubscribe;
    }

    async readOnce(collection: string, filter?: any): Promise<ReadResult<any>> {
        return this.agent.readOnce({ collection, filter });
    }

    async read(collection: string, filter?: any, callback?: (result: ReadResult<any>) => void): Promise<Unsubscribe> {
        if (!callback) {
            throw new Error("A callback function must be provided for read subscriptions.");
        }
        return this.agent.read({ collection, filter }, (error, data) => {
            if (error) {
                callback({ ok: false, data: [], error: error.message });
            } else {
                callback({ ok: true, data: data || [] });
            }
        });
    }

    async write(collection: string, data: any | any[]): Promise<WriteResult> {
        return this.agent.write({ collection, data });
    }
}

// Export the main interface as well for consumers who want to type `window.vibe`
export interface IVibeSDK extends Vibe {}

/* eslint-enable @typescript-eslint/no-explicit-any */
