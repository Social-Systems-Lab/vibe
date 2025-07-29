import { Elysia, t } from "elysia";
import { proxyRequest } from "../lib/proxy";

export const defaultAuth = (app: Elysia) =>
    app.group("", (group) =>
        group
            .get(
                "/authorize",
                async ({ query, cookie, sessionJwt, identityService, redirect }: any) => {
                    console.log("Hit /authorize endpoint with query:", query);
                    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, prompt } = query;
                    const sessionToken = cookie.vibe_session.value;

                    if (sessionToken) {
                        const session = await sessionJwt.verify(sessionToken);
                        if (session && session.sessionId) {
                            const user = await identityService.findByDid(session.sessionId);
                            if (user) {
                                const hasConsented = await identityService.hasUserConsented(user.did, client_id!);
                                if (hasConsented && prompt !== "consent") {
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
                                    return redirect(finalRedirectUrl.toString());
                                }
                            }
                        }
                    }

                    // If not logged in, or consent is required, redirect to the UI wizard
                    const { form_type, ...rest } = query as any;
                    const params = new URLSearchParams(rest);
                    if (form_type) {
                        params.set("step", form_type);
                    }
                    const redirectPath = `/auth/wizard?${params.toString()}`;
                    return redirect(redirectPath);
                },
                {
                    query: t.Object({
                        client_id: t.String(),
                        redirect_uri: t.String(),
                        response_type: t.String(),
                        scope: t.String(),
                        state: t.Optional(t.String()),
                        code_challenge: t.String(),
                        code_challenge_method: t.Optional(t.String()),
                        form_type: t.Optional(t.String()),
                        prompt: t.Optional(t.String()),
                    }),
                }
            )
            .get(
                "/session-check",
                async ({ query, cookie, sessionJwt, identityService }: any) => {
                    const { client_id, redirect_uri } = query;

                    const renderScript = (data: any) => `
                        <script>
                            if (window.parent) {
                                window.parent.postMessage(${JSON.stringify(data)}, '${new URL(redirect_uri).origin}');
                            }
                        </script>
                    `;

                    const sessionToken = cookie.vibe_session.value;
                    if (!sessionToken) {
                        return new Response(renderScript({ status: "LOGGED_OUT" }), { headers: { "Content-Type": "text/html" } });
                    }

                    try {
                        const session = await sessionJwt.verify(sessionToken);
                        if (!session || !session.sessionId) {
                            return new Response(renderScript({ status: "LOGGED_OUT" }), { headers: { "Content-Type": "text/html" } });
                        }

                        const userDid = session.sessionId;
                        const user = await identityService.findByDid(userDid);
                        if (!user) {
                            return new Response(renderScript({ status: "LOGGED_OUT" }), { headers: { "Content-Type": "text/html" } });
                        }

                        const hasConsented = await identityService.hasUserConsented(userDid, client_id);

                        const sanitizedUser = {
                            did: user.did,
                            instanceId: user.instanceId,
                            displayName: user.displayName,
                        };

                        if (hasConsented) {
                            return new Response(renderScript({ status: "LOGGED_IN", user: sanitizedUser }), { headers: { "Content-Type": "text/html" } });
                        } else {
                            return new Response(renderScript({ status: "CONSENT_REQUIRED", user: sanitizedUser }), {
                                headers: { "Content-Type": "text/html" },
                            });
                        }
                    } catch (e) {
                        return new Response(renderScript({ status: "LOGGED_OUT" }), { headers: { "Content-Type": "text/html" } });
                    }
                },
                {
                    query: t.Object({
                        client_id: t.String(),
                        redirect_uri: t.String(),
                    }),
                }
            )
            .post(
                "/token",
                async ({ body, identityService, jwt }: any) => {
                    const { grant_type, code, code_verifier, client_id, redirect_uri } = body;

                    if (grant_type !== "authorization_code") {
                        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
                    }

                    const userDid = await identityService.validateAuthCode(code, code_verifier!, client_id, redirect_uri);
                    if (!userDid) {
                        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
                    }

                    const user = await identityService.findByDid(userDid);
                    if (!user) {
                        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
                    }

                    const accessToken = await jwt.sign({ sub: user.did, instanceId: user.instanceId });
                    return {
                        access_token: accessToken,
                        token_type: "Bearer",
                    };
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
            .all("/wizard", ({ request }) => proxyRequest(request))
            .post(
                "/login",
                async ({ body, sessionJwt, cookie, set, query, identityService, redirect }: any) => {
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

                        const params = new URLSearchParams(query as any);
                        return redirect(`/auth/authorize?${params.toString()}`);
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
                "/signup",
                async ({ body, sessionJwt, cookie, set, query, identityService, redirect }: any) => {
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

                    const params = new URLSearchParams(query as any);
                    params.set("step", "profile");
                    return redirect(`/auth/wizard?${params.toString()}`);
                },
                {
                    body: t.Object({
                        email: t.String(),
                        password: t.String(),
                    }),
                }
            )
            .post(
                "/profile",
                async ({ body, sessionJwt, cookie, set, query, identityService, redirect }: any) => {
                    const sessionToken = cookie.vibe_session.value;
                    if (!sessionToken) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }

                    const session = await sessionJwt.verify(sessionToken);
                    if (!session || !session.sessionId) {
                        set.status = 401;
                        return { error: "Invalid session" };
                    }

                    await identityService.updateUser(session.sessionId, body);

                    const params = new URLSearchParams(query as any);
                    return redirect(`/auth/authorize?${params.toString()}`);
                },
                {
                    body: t.Object({
                        displayName: t.String(),
                        bio: t.Optional(t.String()),
                    }),
                }
            )
            .all("/consent", ({ request }) => proxyRequest(request))
    );
