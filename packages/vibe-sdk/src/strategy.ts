import { CertType, DocRef, ReadCallback, Subscription, User } from "vibe-core";
import { SessionState } from "./session-manager";

export interface VibeTransportStrategy {
    init?(): Promise<SessionState | void>;
    login(): Promise<void>;
    logout(): Promise<void>;
    signup(): Promise<void>;
    manageConsent(): Promise<void>;
    manageProfile(): Promise<void>;
    getUser(): Promise<any>;
    isLoggedIn?(): boolean;
    read(collection: string, query: any, callback: ReadCallback): Promise<Subscription>;
    readOnce(collection: string, query?: any): Promise<any>;
    write(collection: string, data: any): Promise<any>;
    remove(collection: string, data: any): Promise<any>;
    onStateChange(callback: (state: { isLoggedIn: boolean; user: User | null }) => void): () => void;
    issueCert(targetDid: string, certType: DocRef, expires?: string): Promise<any>;
    revokeCert(certId: string): Promise<any>;
}
