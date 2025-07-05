export interface VibeTransportStrategy {
    login(): Promise<void>;
    logout(): Promise<void>;
    signup(): Promise<void>;
    getUser(): Promise<any>;
    read(collection: string, filter?: any): Promise<any>;
    readOnce(collection: string, filter?: any): Promise<any>;
    write(collection: string, data: any): Promise<any>;
}
