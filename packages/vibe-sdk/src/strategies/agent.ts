import { VibeTransportStrategy } from "../strategy";
import { DocRef, ReadCallback, Subscription, User, Document, ReadOnceApiResponse } from "vibe-core";

export class AgentStrategy implements VibeTransportStrategy {
    async login(): Promise<void> {
        throw new Error("Agent login not implemented");
    }

    async logout(): Promise<void> {
        throw new Error("Agent logout not implemented");
    }

    async signup(): Promise<void> {
        throw new Error("Agent signup not implemented");
    }

    async manageConsent(): Promise<void> {
        throw new Error("Agent manageConsent not implemented");
    }

    async manageProfile(): Promise<void> {
        throw new Error("Agent manageProfile not implemented");
    }

    async getUser(): Promise<any> {
        throw new Error("Agent getUser not implemented");
    }

    async read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription> {
        throw new Error("Agent read not implemented");
    }

    async readOnce<T extends Document>(collection: string, filter?: any): Promise<ReadOnceApiResponse<T>> {
        throw new Error("Agent readOnce not implemented");
    }

    async write(collection: string, data: any): Promise<any> {
        throw new Error("Agent write not implemented");
    }

    async remove(collection: string, data: any): Promise<any> {
        throw new Error("Agent delete not implemented");
    }

    onStateChange(callback: (state: { isLoggedIn: boolean; user: User | null }) => void): () => void {
        throw new Error("Agent onStateChange not implemented");
    }

    issueCert(targetDid: string, certType: DocRef, expires?: string): Promise<any> {
        throw new Error("Agent issueCert not implemented");
    }

    revokeCert(certId: string): Promise<any> {
        throw new Error("Agent revokeCert not implemented");
    }
}
