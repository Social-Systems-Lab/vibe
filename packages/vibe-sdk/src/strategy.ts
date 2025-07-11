import { ReadCallback, Subscription, User } from "./types";

export interface VibeTransportStrategy {
    init?(): Promise<void>;
    login(): Promise<void>;
    logout(): Promise<void>;
    signup(): Promise<void>;
    getUser(): Promise<any>;
    isLoggedIn?(): boolean;
    read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription>;
    readOnce(collection: string, filter?: any): Promise<any>;
    write(collection: string, data: any): Promise<any>;
    remove(collection: string, data: any): Promise<any>;
    onStateChange(callback: (state: { isLoggedIn: boolean; user: User | null }) => void): () => void;
}
