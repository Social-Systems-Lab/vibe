import { ReadCallback, Subscription } from "./types";

export interface VibeTransportStrategy {
    login(): Promise<void>;
    logout(): Promise<void>;
    signup(): Promise<void>;
    getUser(): Promise<any>;
    read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription>;
    readOnce(collection: string, filter?: any): Promise<any>;
    write(collection: string, data: any): Promise<any>;
    remove(collection: string, data: any): Promise<any>;
}
