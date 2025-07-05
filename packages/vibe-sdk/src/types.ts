export interface User {
    did: string;
    instanceId: string;
}

export interface JwtPayload {
    sub: string; // This is the user's DID
    instanceId: string;
}

export type ReadResult<T = any> = {
    ok: boolean;
    data?: T;
    error?: string;
};

export type ReadCallback<T = any> = (result: ReadResult<T>) => void;

export type Subscription = {
    unsubscribe: () => void;
};
