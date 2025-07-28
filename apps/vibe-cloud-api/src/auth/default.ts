import { Elysia, t } from "elysia";

export const defaultAuth = (app: Elysia) =>
    app.group("", (group) =>
        group
            .get(
                "/authorize",
                async ({ query, cookie, sessionJwt, identityService, redirect }) => {
                    console.log("[AUTH] /authorize called", query);
                    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, form_type, prompt } = query;
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
                    const params = new URLSearchParams(query as any);
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
                async ({ query, cookie, sessionJwt, identityService }) => {
                    console.log("[AUTH] /session-check called", query);
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
    );
