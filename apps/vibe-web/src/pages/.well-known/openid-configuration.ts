export const GET = async (): Promise<Response> => {
    const configuration = {
        issuer: "http://localhost:3000",
        authorization_endpoint: "http://localhost:3000/oauth/authorize",
        token_endpoint: "http://localhost:5000/token",
        jwks_uri: "http://localhost:5000/jwks",
        userinfo_endpoint: "http://localhost:5000/me",
        end_session_endpoint: "http://localhost:3000/session/end",
        registration_endpoint: "http://localhost:5000/reg",
        // Add other necessary OIDC metadata here
    };

    return new Response(JSON.stringify(configuration), {
        headers: { "Content-Type": "application/json" },
    });
};
