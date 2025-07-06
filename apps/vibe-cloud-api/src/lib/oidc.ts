import Provider, { KoaContextWithOIDC, ResponseType } from "oidc-provider";
import { IdentityService } from "../services/identity";
import { ClientService } from "../services/client";
import { CustomOidcAdapter } from "./oidc-adapter";
import { Client } from "../models/client";

export const configureOidcProvider = (issuer: string, identityService: IdentityService, clientService: ClientService, clientSecret: string) => {
    const adapterFactory = (name: string) => {
        return new CustomOidcAdapter(clientService);
    };

    const configuration = {
        adapter: adapterFactory,
        clients: [
            {
                client_id: "vibe-web",
                client_secret: clientSecret,
                redirect_uris: ["http://localhost:3000/auth/callback"],
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"] as ResponseType[],
            },
        ],
        pkce: {
            required: () => true,
        },

        ttl: {
            AccessToken: 900, // 15 minutes
            AuthorizationCode: 300, // 5 minutes
            BackchannelAuthenticationRequest: 300, // 5 minutes
            DeviceCode: 300, // 5 minutes
            Grant: 1209600, // 14 days
            ClientCredentials: 900, // 15 minutes
            IdToken: 300, // 5 minutes
            Interaction: 600, // 10 minutes
            RefreshToken: 60 * 60 * 24 * 90, // 90 days
            Session: 1209600, // 14 days
        },

        // This is the "adapter" that connects oidc-provider to our user database.
        async findAccount(ctx: any, id: string) {
            // `id` is the `sub` (subject) claim, which is the user's unique identifier.
            // In our case, we'll use the user's DID.
            const account = await identityService.findByDid(id);

            if (account) {
                return {
                    accountId: id,
                    // The `claims` function is called by the provider to get the claims for the ID Token.
                    async claims(use: string, scope: string) {
                        return {
                            sub: id,
                            email: account.email,
                            // Add other claims as needed based on scope
                        };
                    },
                };
            }
            return undefined;
        },

        features: {
            devInteractions: { enabled: false }, // Disable development views
            revocation: { enabled: true },
            introspection: { enabled: true },
            clientCredentials: { enabled: true },
            registration: {
                enabled: true,
                async post(ctx: KoaContextWithOIDC, client: Client) {
                    // Custom validation logic based on client_id type
                    if (client.client_id.startsWith("did:")) {
                        // TODO: Implement DID-based validation (JWS verification)
                        console.log("DID-based client registration:", client);
                    } else {
                        // Origin-based validation
                        try {
                            const response = await fetch(`${client.client_id}/.well-known/vibe-client.json`);
                            if (!response.ok) {
                                throw new Error("Failed to fetch client metadata");
                            }
                            const metadata = await response.json();
                            // TODO: Add more robust validation of the metadata
                            console.log("Origin-based client metadata:", metadata);
                        } catch (error) {
                            console.error("Client metadata validation failed:", error);
                            throw new Error("Invalid client metadata");
                        }
                    }
                },
            },
        },

        cookies: {
            keys: ["some-secret-key-that-is-at-least-32-characters-long", "and-another-one-for-rotation"],
        },

        claims: {
            openid: ["sub"],
            email: ["email"],
        },
    };

    return new Provider(issuer, configuration);
};
