export interface User {
    id: string;
    did: string;
    name?: string;
    email?: string;
    picture?: string;
}

export interface JwtPayload {
    sub: string; // This is the user's DID
    name?: string;
    email?: string;
    picture?: string;
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
