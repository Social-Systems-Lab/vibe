import { DocRef, ReadCallback, Subscription, User, Document, ReadOnceApiResponse } from "vibe-core";

export interface VibeTransportStrategy {
    // Auth
    login(): Promise<void>;
    logout(): Promise<void>;
    signup(): Promise<void>;
    manageConsent(): Promise<void>;
    manageProfile(): Promise<void>;
    getUser(): Promise<User | null>;

    // Data
    read<T extends Document>(type: string, query: any, callback: ReadCallback): Promise<Subscription>;
    readOnce<T extends Document>(type: string, query?: any): Promise<ReadOnceApiResponse<T>>;
    write(type: string, data: any): Promise<any>;
    remove(type: string, data: any): Promise<any>;

    // State management
    onStateChange(callback: (state: { isLoggedIn: boolean; user: User | null }) => void): () => void;

    // Certificates
    issueCert(targetDid: string, certType: DocRef, expires?: string): Promise<any>;
    revokeCert(certId: string): Promise<any>;
}
