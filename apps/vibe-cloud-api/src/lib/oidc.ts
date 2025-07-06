import Provider from "oidc-provider";
import { IdentityService } from "../services/identity";

export const configureOidcProvider = (issuer: string, identityService: IdentityService, clientSecret: string) => {
    const clients = [
        {
            client_id: "vibe-web",
            client_secret: clientSecret,
            grant_types: ["authorization_code", "refresh_token"],
            redirect_uris: ["http://localhost:3000/auth/callback"],
            response_types: ["code"],
        },
    ];

    const configuration = {
        clients,
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
