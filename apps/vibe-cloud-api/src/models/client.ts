import { ResponseType, ClientAuthMethod } from "oidc-provider";

export interface Client {
    _id: string; // Will be client_id
    _rev?: string;
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
    grant_types: string[];
    response_types: ResponseType[];
    token_endpoint_auth_method?: ClientAuthMethod;
    // Add any other client metadata fields you need to store
}
