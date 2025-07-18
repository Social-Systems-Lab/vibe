export interface User {
    did: string;
    instanceId: string;
    displayName?: string;
    pictureUrl?: string;
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

export interface CertType extends Document {
    owner: string; // did
    name: string;
    description: string;
    badgeIconUrl?: string;
    bannerImageUrl?: string;
}

export interface Post extends Document {
    content: string;
    author: DocRef | Profile;
}

export interface VibeQuery {
    sort?: any;
    limit?: number;
    expand?: string | string[];
    maxCacheAge?: number; // in seconds
    global?: boolean;
    [key: string]: any;
}

export interface CachedDoc<T> {
    _id: string; // "cache:<did>/<ref>"
    _rev?: string;
    type: "cache";
    data: T;
    cachedAt: number; // Unix timestamp (ms)
    originalDid: string;
    originalRef: string;
}

export interface Certificate extends Document {
    type: string;
    certType: DocRef;
    issuer: string; // did
    subject: string; // did
    expires?: string; // ISO timestamp
    signature: string; // JWS
}

export type AclRule = { issuer: string; type: string } | string; // did

export interface AclPermission {
    allow?: (AclRule | AclRule[])[]; // OR logic for top-level, AND for inner arrays
    deny?: (AclRule | AclRule[])[];
}

export interface Acl {
    read?: AclPermission;
    write?: AclPermission;
    create?: AclPermission;
}
