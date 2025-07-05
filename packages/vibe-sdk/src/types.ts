export interface User {
    did: string;
    instanceId: string;
}

export interface JwtPayload {
    sub: string; // This is the user's DID
    instanceId: string;
}
