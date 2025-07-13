export interface User {
    did: string;
    instanceId: string;
    displayName?: string;
}

export interface JwtPayload {
    sub: string; // This is the user's DID
    instanceId: string;
    displayName?: string;
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

export type DocRef = {
    did: string;
    ref: string;
};

export interface Document {
    _id: string;
    [key: string]: any;
}

export interface Profile extends Document {
    name: string;
    pictureUrl?: string;
}

export interface Post extends Document {
    content: string;
    author: DocRef | Profile;
}
