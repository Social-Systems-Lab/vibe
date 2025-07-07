// Force type regeneration
import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { cors } from "@elysiajs/cors";
import { html } from "@elysiajs/html";
import { IdentityService } from "./services/identity";
import { DataService, JwtPayload } from "./services/data";
import { getUserDbName } from "./lib/db";
import nano from "nano";

const startServer = async () => {
    const identityService = new IdentityService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
        instanceIdSecret: process.env.INSTANCE_ID_SECRET!,
    });

    const couch = nano(process.env.COUCHDB_URL!);

    const dataService = new DataService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
    });

    try {
        await identityService.onApplicationBootstrap(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
        await dataService.init();
        await couch.auth(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1); // Exit if cannot connect to DB
    }

    const app = new Elysia()
        .use(
            cors({
                origin: ["http://localhost:3000", "http://localhost:3001"],
                credentials: true,
            })
        )
        .use(cookie())
        .use(html())
        .use(
            jwt({
                name: "jwt",
                secret: process.env.JWT_SECRET!,
                exp: "15m",
                schema: t.Object({
                    sub: t.String(),
                    instanceId: t.String(),
                }),
            })
        )
        .use(
            jwt({
                name: "sessionJwt",
                secret: process.env.SESSION_SECRET! || process.env.JWT_SECRET!,
                exp: "30d",
                schema: t.Object({
                    sessionId: t.String(),
                }),
            })
        )
        .get("/health", () => ({
            status: identityService.isConnected ? "ok" : "error",
            details: identityService.isConnected ? "All systems operational" : "Database connection failed",
        }))
        .group("/auth", (app) =>
            app
                .derive(({ request }) => {
                    return { url: new URL(request.url) };
                })
                .post(
                    "/signup",
                    async ({ body, sessionJwt, cookie, set, query }) => {
                        const { email, password } = body;
                        const existingUser = await identityService.findByEmail(email);
                        if (existingUser) {
                            set.status = 409;
                            return { error: "User already exists" };
                        }
                        const password_hash = await Bun.password.hash(password);
                        const user = await identityService.register(email, password_hash, password);

                        const sessionToken = await sessionJwt.sign({
                            sessionId: user.did,
                        });

                        cookie.vibe_session.set({
                            value: sessionToken,
                            httpOnly: true,
                            maxAge: 30 * 86400, // 30 days
                            path: "/",
                        });

                        // Redirect back to the authorization flow
                        const authQuery = new URLSearchParams(query as any).toString();
                        const redirectUrl = `/auth/authorize?${authQuery}`;
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
                        }),
                    }
                )
                .post(
                    "/login",
                    async ({ body, sessionJwt, cookie, set, query }) => {
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
                            });

                            // Redirect back to the authorization flow
                            const authQuery = new URLSearchParams(query as any).toString();
                            const redirectUrl = `/auth/authorize?${authQuery}`;
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
                    async ({ jwt, body, set }) => {
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
                .post(
                    "/logout",
                    ({ cookie, set }) => {
                        cookie.vibe_session.remove();
                        set.status = 200;
                        return { success: true };
                    },
                    {}
                )
                .get(
                    "/authorize",
                    async ({ query, cookie, sessionJwt, set, html, url }) => {
                        const { client_id, response_type, scope, form_type = "login" } = query;

                        if (response_type !== "code") {
                            return "Invalid request"; // Or a more user-friendly error page
                        }

                        const sessionToken = cookie.vibe_session.value;
                        if (!sessionToken) {
                            const loginParams = new URLSearchParams(url.search);
                            loginParams.set("form_type", "login");

                            const signupParams = new URLSearchParams(url.search);
                            signupParams.set("form_type", "signup");

                            if (form_type === "signup") {
                                // Show Sign Up form
                                return html(`
                                   <h1>Sign Up</h1>
                                   <p>To authorize <strong>${client_id}</strong></p>
                                   <form method="POST" action="/auth/signup?${signupParams.toString()}">
                                       <input type="email" name="email" placeholder="Email" required />
                                       <input type="password" name="password" placeholder="Password" required />
                                       <button type="submit">Sign Up</button>
                                   </form>
                                   <hr/>
                                   <p>Already have an account? <a href="/auth/authorize?${loginParams.toString()}">Log in</a></p>
                               `);
                            }

                            // Show Login form by default
                            return html(`
                               <h1>Login</h1>
                               <p>To authorize <strong>${client_id}</strong></p>
                               <form method="POST" action="/auth/login?${loginParams.toString()}">
                                   <input type="email" name="email" placeholder="Email" required />
                                   <input type="password" name="password" placeholder="Password" required />
                                   <button type="submit">Login</button>
                               </form>
                               <hr/>
                               <p>Don't have an account? <a href="/auth/authorize?${signupParams.toString()}">Sign up here</a></p>
                           `);
                        }

                        try {
                            const session = await sessionJwt.verify(sessionToken);
                            if (!session || !session.sessionId) {
                                cookie.vibe_session.remove();
                                // Session is invalid, show login page again
                                return "Invalid session. Please log in again.";
                            }

                            // User is logged in, show the consent screen.
                            const queryString = new URLSearchParams(query as any).toString();
                            return html(`
                               <h1>Authorize Application</h1>
                               <p>The application <strong>${client_id}</strong> wants to access your data.</p>
                               <p>Scopes: ${scope}</p>
                               <form method="POST" action="/auth/authorize/decision?${queryString}">
                                   <button type="submit" name="decision" value="allow">Allow</button>
                                   <button type="submit" name="decision" value="deny">Deny</button>
                               </form>
                           `);
                        } catch (e) {
                            cookie.vibe_session.remove();
                            return "Your session has expired. Please log in again.";
                        }
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
                        }),
                    }
                )
                .post(
                    "/authorize/decision",
                    async ({ query, body, cookie, sessionJwt, set }) => {
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

                        if (decision === "deny") {
                            const redirectUrl = new URL(redirect_uri);
                            redirectUrl.searchParams.set("error", "access_denied");
                            if (state) {
                                redirectUrl.searchParams.set("state", state);
                            }
                            return new Response(null, {
                                status: 302,
                                headers: {
                                    Location: redirectUrl.toString(),
                                },
                            });
                        }

                        // Decision is "allow"
                        const authCode = await identityService.createAuthCode({
                            userDid,
                            clientId: client_id,
                            scope,
                            redirectUri: redirect_uri,
                            codeChallenge: code_challenge,
                            codeChallengeMethod: code_challenge_method || "S256",
                        });

                        const redirectUrl = new URL(redirect_uri);
                        redirectUrl.searchParams.set("code", authCode);
                        if (state) {
                            redirectUrl.searchParams.set("state", state);
                        }
                        return new Response(null, {
                            status: 302,
                            headers: {
                                Location: redirectUrl.toString(),
                            },
                        });
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
                    async ({ body, jwt, set }) => {
                        const { grant_type, code, code_verifier, client_id, redirect_uri } = body;

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
        )
        .group("/users", (app) =>
            app
                .derive(async ({ jwt, headers }) => {
                    const auth = headers.authorization;
                    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
                    const profile = await jwt.verify(token);
                    return { profile };
                })
                .guard({
                    beforeHandle: ({ profile, set }) => {
                        if (!profile) {
                            set.status = 401;
                            return { error: "Unauthorized" };
                        }
                    },
                })
                .get("/me", async ({ profile, set }) => {
                    if (!profile) {
                        // This should be unreachable due to the guard, but it satisfies TypeScript
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const userDoc = await identityService.findByDid(profile.sub);
                    if (!userDoc) {
                        set.status = 404;
                        return { error: "User not found" };
                    }
                    const user = {
                        did: userDoc.did,
                    };
                    return { user };
                })
        )
        .group("/data", (app) =>
            app
                .derive(async ({ jwt, headers }) => {
                    const auth = headers.authorization;
                    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
                    if (!token) {
                        return { profile: null };
                    }
                    try {
                        const profile = await jwt.verify(token);
                        return { profile };
                    } catch {
                        return { profile: null };
                    }
                })
                .post(
                    "/:collection",
                    async ({ profile, params, body, set }) => {
                        try {
                            const result = await dataService.write(params.collection, body, profile as JwtPayload);
                            return { success: true, ...result };
                        } catch (error: any) {
                            set.status = 500;
                            return { error: error.message };
                        }
                    },
                    {
                        params: t.Object({ collection: t.String() }),
                        beforeHandle: ({ profile, set }) => {
                            if (!profile) {
                                set.status = 401;
                                return { error: "Unauthorized" };
                            }
                        },
                    }
                )
                .post(
                    "/:collection/query",
                    async ({ profile, params, body, set }) => {
                        try {
                            const docs = await dataService.readOnce(params.collection, body, profile as JwtPayload);
                            return { docs };
                        } catch (error: any) {
                            set.status = 500;
                            return { error: error.message };
                        }
                    },
                    {
                        params: t.Object({ collection: t.String() }),
                        beforeHandle: ({ profile, set }) => {
                            if (!profile) {
                                set.status = 401;
                                return { error: "Unauthorized" };
                            }
                        },
                    }
                )
                .ws("/:collection", {
                    async open(ws) {
                        console.log("WebSocket connection opened");
                    },
                    async message(ws, message: { type: string; token?: string; filter?: any }) {
                        const { collection } = ws.data.params;

                        if (message.type === "auth") {
                            const profile = await ws.data.jwt.verify(message.token);
                            if (!profile) {
                                ws.close(4001, "Unauthorized");
                                return;
                            }
                            (ws.data as any).profile = profile;
                            console.log(`WebSocket authenticated for collection: ${collection} by user ${profile.sub}`);

                            const dbName = getUserDbName(profile.instanceId);
                            const db = couch.use(dbName);

                            const initialDocs = await dataService.readOnce(collection, {}, profile as JwtPayload);
                            ws.send(initialDocs);

                            const changes = db.changesReader.start({ since: "now", includeDocs: true });
                            (ws.data as any).changes = changes;

                            changes.on("change", async (change) => {
                                if (change.doc?.collection === collection) {
                                    // Re-fetch the full list to ensure consistency
                                    const docs = await dataService.readOnce(collection, {}, profile as JwtPayload);
                                    ws.send(docs);
                                }
                            });
                        }
                    },
                    close(ws) {
                        const { collection } = ws.data.params;
                        const { profile, changes } = ws.data as any;

                        if (changes) {
                            changes.stop();
                        }

                        if (profile) {
                            console.log(`WebSocket closed for collection: ${collection} by user ${profile.sub}`);
                        } else {
                            console.log(`WebSocket closed for collection: ${collection}`);
                        }
                    },
                })
        )
        .listen(5000);

    console.log(`Elysia is running at http://${app.server?.hostname}:${app.server?.port}`);

    return app;
};

startServer().then((app) => {
    if (app) {
        (global as any).app = app;
    }
});

export type App = Awaited<ReturnType<typeof startServer>>;
