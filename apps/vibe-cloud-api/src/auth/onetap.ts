import { Elysia, t } from "elysia";
import { IdentityService } from "../services/identity";
import { proxyRequest } from "../lib/proxy";
import { getUserDbName } from "../lib/db";

export const onetapAuth = (app: Elysia) =>
    app.group("/onetap", (group) =>
        group
            .derive(({ request }) => {
                return { url: new URL(request.url) };
            })
            .get("/authorize", async ({ request, query, cookie, sessionJwt, identityService }: any) => {
                const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, form_type, prompt } = query;
                const sessionToken = cookie.vibe_session.value;

                if (sessionToken) {
                    const session = await sessionJwt.verify(sessionToken);
                    if (session && session.sessionId) {
                        const user = await identityService.findByDid(session.sessionId);
                        if (user) {
                            const returnUrl = new URL(request.url);
                            const { redirect_uri, ...restOfQuery } = query;
                            const proxyParams = new URLSearchParams({
                                ...(restOfQuery as any),
                                redirect_uri: returnUrl.toString(),
                            });

                            if (form_type === "profile") {
                                const profileUrl = new URL(request.url);
                                profileUrl.pathname = "/auth/profile";
                                profileUrl.search = proxyParams.toString();
                                const newRequest = new Request(profileUrl.toString(), { method: request.method, headers: request.headers });
                                return proxyRequest(newRequest);
                            }

                            if (prompt === "consent") {
                                const consentUrl = new URL(request.url);
                                consentUrl.pathname = "/auth/consent";
                                const newRequest = new Request(consentUrl.toString(), { method: request.method, headers: request.headers });
                                return proxyRequest(newRequest);
                            }

                            if (!user.displayName) {
                                proxyParams.set("is_signup", "true");
                                const profileUrl = new URL(request.url);
                                profileUrl.pathname = "/auth/profile";
                                profileUrl.search = proxyParams.toString();
                                const newRequest = new Request(profileUrl.toString(), { method: request.method, headers: request.headers });
                                return proxyRequest(newRequest);
                            }

                            const hasConsented = await identityService.hasUserConsented(user.did, client_id!);
                            if (hasConsented) {
                                const authCode = await identityService.createAuthCode({
                                    userDid: user.did,
                                    clientId: client_id!,
                                    scope: scope!,
                                    redirectUri: redirect_uri!,
                                    codeChallenge: code_challenge!,
                                    codeChallengeMethod: code_challenge_method || "S256",
                                });

                                const finalRedirectUrl = new URL(redirect_uri!);
                                finalRedirectUrl.searchParams.set("code", authCode);
                                if (state) {
                                    finalRedirectUrl.searchParams.set("state", state);
                                }
                                return new Response(null, { status: 302, headers: { Location: finalRedirectUrl.toString() } });
                            } else {
                                const consentUrl = new URL(request.url);
                                consentUrl.pathname = "/auth/consent";
                                const newRequest = new Request(consentUrl.toString(), { method: request.method, headers: request.headers });
                                return proxyRequest(newRequest);
                            }
                        }
                    }
                }

                // User is not logged in, show login/signup UI
                const params = new URLSearchParams(query as any);
                const effectiveFormType = params.get("form_type") || "login";
                let newPath = "/auth/login";
                if (effectiveFormType === "signup") {
                    newPath = "/auth/signup";
                }
                const url = new URL(request.url);
                url.pathname = newPath;
                const newRequest = new Request(url.toString(), { method: request.method, headers: request.headers });
                return proxyRequest(newRequest);
            })
            .post(
                "/signup",
                async ({ body, sessionJwt, cookie, set, query, identityService }: any) => {
                    console.log(`[API] POST /auth/onetap/signup received. Body:`, body);
                    const { email, password } = body;
                    const existingUser = await identityService.findByEmail(email);
                    if (existingUser) {
                        set.status = 409;
                        return { error: "User already exists" };
                    }
                    const password_hash = await Bun.password.hash(password);
                    const user = await identityService.register(email, password_hash, password, "");

                    const sessionToken = await sessionJwt.sign({
                        sessionId: user.did,
                    });

                    cookie.vibe_session.set({
                        value: sessionToken,
                        httpOnly: true,
                        maxAge: 30 * 86400, // 30 days
                        path: "/",
                        sameSite: "lax",
                    });

                    // Redirect back to the authorization flow
                    const authQuery = new URLSearchParams(query as any).toString();
                    const redirectUrl = `/auth/onetap/authorize?${authQuery}`;
                    return new Response(null, {
                        status: 302,
                        headers: {
                            Location: redirectUrl,
                        },
                    });
                },
                {
                    body: t.Object({
                        email: t.String(),
                        password: t.String(),
                        displayName: t.Optional(t.String()),
                    }),
                }
            )
            .post(
                "/login",
                async ({ body, sessionJwt, cookie, set, query, identityService }: any) => {
                    const { email, password } = body;
                    try {
                        const user = await identityService.login(email, password);
                        const sessionToken = await sessionJwt.sign({
                            sessionId: user.did,
                        });

                        cookie.vibe_session.set({
                            value: sessionToken,
                            httpOnly: true,
                            maxAge: 30 * 86400, // 30 days
                            path: "/",
                            sameSite: "lax",
                        });

                        // Redirect back to the authorization flow
                        const authQuery = new URLSearchParams(query as any).toString();
                        const redirectUrl = `/auth/onetap/authorize?${authQuery}`;
                        return new Response(null, {
                            status: 302,
                            headers: {
                                Location: redirectUrl,
                            },
                        });
                    } catch (error: any) {
                        set.status = 401;
                        return { error: error.message };
                    }
                },
                {
                    body: t.Object({
                        email: t.String(),
                        password: t.String(),
                    }),
                }
            )
            .post(
                "/refresh",
                async ({ jwt, body, set, identityService }: any) => {
                    const { refreshToken } = body;

                    if (!refreshToken) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }

                    try {
                        const result = await identityService.validateRefreshToken(refreshToken);
                        const newAccessToken = await jwt.sign({
                            sub: result.did,
                            instanceId: result.instanceId,
                        });
                        return { token: newAccessToken, refreshToken: result.refreshToken };
                    } catch (error: any) {
                        console.error("Error refreshing token:", error.message);
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                },
                {
                    body: t.Object({
                        refreshToken: t.String(),
                    }),
                }
            )
            .get(
                "/logout",
                ({ cookie, query }) => {
                    cookie.vibe_session.set({
                        value: "",
                        maxAge: -1,
                        path: "/",
                        httpOnly: true,
                        sameSite: "lax",
                    });

                    const redirectUri = query.redirect_uri || "/";
                    return new Response(null, {
                        status: 302,
                        headers: {
                            Location: redirectUri,
                        },
                    });
                },
                {
                    query: t.Object({
                        redirect_uri: t.Optional(t.String()),
                    }),
                }
            )
            .post(
                "/authorize/decision",
                async ({ query, body, cookie, sessionJwt, set, identityService }: any) => {
                    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = query;
                    const { decision } = body;

                    const sessionToken = cookie.vibe_session.value;
                    if (!sessionToken) {
                        set.status = 401;
                        return "Unauthorized. Please log in.";
                    }

                    const session = await sessionJwt.verify(sessionToken);
                    if (!session || !session.sessionId) {
                        set.status = 401;
                        return "Invalid session.";
                    }

                    const userDid = session.sessionId;

                    const redirectUrl = new URL(redirect_uri);
                    if (decision === "deny") {
                        await identityService.revokeConsent(userDid, client_id);
                        redirectUrl.searchParams.set("error", "access_denied");
                        if (state) {
                            redirectUrl.searchParams.set("state", state);
                        }
                    } else {
                        // Decision is "allow"
                        await identityService.storeUserConsent(userDid, client_id);

                        const authCode = await identityService.createAuthCode({
                            userDid,
                            clientId: client_id,
                            scope,
                            redirectUri: redirect_uri,
                            codeChallenge: code_challenge,
                            codeChallengeMethod: code_challenge_method || "S256",
                        });

                        redirectUrl.searchParams.set("code", authCode);
                        if (state) {
                            redirectUrl.searchParams.set("state", state);
                        }
                    }

                    return { redirect: redirectUrl.toString() };
                },
                {
                    body: t.Object({
                        decision: t.String(),
                    }),
                    query: t.Object({
                        client_id: t.String(),
                        redirect_uri: t.String(),
                        response_type: t.String(),
                        scope: t.String(),
                        state: t.Optional(t.String()),
                        code_challenge: t.String(),
                        code_challenge_method: t.Optional(t.String()),
                    }),
                }
            )
            .post(
                "/token",
                async ({ body, jwt, set, identityService }: any) => {
                    const { grant_type, code, code_verifier, client_id, redirect_uri } = body;

                    try {
                        const clientIdOrigin = new URL(client_id).origin;
                        const redirectUriOrigin = new URL(redirect_uri).origin;
                        if (clientIdOrigin !== redirectUriOrigin) {
                            set.status = 400;
                            return { error: "invalid_grant", error_description: "Invalid redirect_uri." };
                        }
                    } catch (e) {
                        set.status = 400;
                        return { error: "invalid_grant", error_description: "Invalid client_id or redirect_uri." };
                    }

                    if (grant_type !== "authorization_code") {
                        set.status = 400;
                        return { error: "invalid_grant", error_description: "grant_type must be authorization_code" };
                    }

                    try {
                        const { userDid, clientId, scope } = await identityService.validateAuthCode(code, code_verifier);

                        if (clientId !== client_id) {
                            set.status = 400;
                            return { error: "invalid_client", error_description: "Client ID mismatch." };
                        }

                        const user = await identityService.findByDid(userDid);
                        if (!user) {
                            set.status = 401;
                            return { error: "invalid_grant", error_description: "User not found." };
                        }

                        const accessToken = await jwt.sign({
                            sub: user.did,
                            instanceId: user.instanceId,
                        });

                        return {
                            access_token: accessToken,
                            token_type: "Bearer",
                            expires_in: 900, // 15 minutes in seconds
                            scope: scope,
                        };
                    } catch (error: any) {
                        set.status = 400;
                        return { error: "invalid_grant", error_description: error.message };
                    }
                },
                {
                    body: t.Object({
                        grant_type: t.String(),
                        code: t.String(),
                        code_verifier: t.String(),
                        client_id: t.String(),
                        redirect_uri: t.String(),
                    }),
                }
            )
            .get(
                "/session-check",
                async ({ query, cookie, sessionJwt, html, identityService }: any) => {
                    const { client_id, redirect_uri, code_challenge, code_challenge_method } = query;

                    const renderScript = (data: any) => `
                        <script>
                            if (window.parent) {
                                window.parent.postMessage(${JSON.stringify(data)}, '${new URL(redirect_uri).origin}');
                            }
                        </script>
                    `;

                    const sessionToken = cookie.vibe_session.value;
                    if (!sessionToken) {
                        return html(renderScript({ status: "LOGGED_OUT" }));
                    }

                    try {
                        const session = await sessionJwt.verify(sessionToken);
                        if (!session || !session.sessionId) {
                            return html(renderScript({ status: "LOGGED_OUT" }));
                        }

                        const userDid = session.sessionId;
                        const user = await identityService.findByDid(userDid);
                        if (!user) {
                            return html(renderScript({ status: "LOGGED_OUT" }));
                        }

                        const hasConsented = await identityService.hasUserConsented(userDid, client_id);

                        // Sanitize user object before sending to client
                        const sanitizedUser = {
                            did: user.did,
                            instanceId: user.instanceId,
                            displayName: user.displayName,
                        };

                        if (hasConsented) {
                            // Silently log in
                            const authCode = await identityService.createAuthCode({
                                userDid,
                                clientId: client_id,
                                scope: "openid profile email", // Assuming default scope
                                redirectUri: redirect_uri,
                                codeChallenge: code_challenge,
                                codeChallengeMethod: code_challenge_method || "S256",
                            });
                            return html(renderScript({ status: "SILENT_LOGIN_SUCCESS", code: authCode, user: sanitizedUser }));
                        } else {
                            // Prompt for one-tap
                            return html(renderScript({ status: "ONE_TAP_REQUIRED", user: sanitizedUser }));
                        }
                    } catch (e) {
                        // Invalid token or other error
                        return html(renderScript({ status: "LOGGED_OUT" }));
                    }
                },
                {
                    query: t.Object({
                        client_id: t.String(),
                        redirect_uri: t.String(),
                        code_challenge: t.String(),
                        code_challenge_method: t.Optional(t.String()),
                    }),
                }
            )
    );
