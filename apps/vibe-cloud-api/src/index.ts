import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { cors } from "@elysiajs/cors";
import { IdentityService } from "./services/identity";
import { DataService, JwtPayload } from "./services/data";
import { getUserDbName } from "./lib/db";
import nano from "nano";
import { configureOidcProvider } from "./lib/oidc";
import { connect } from "elysia-connect-middleware";
import { ClientService } from "./services/client";

const startServer = async () => {
    const identityService = new IdentityService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
        instanceIdSecret: process.env.INSTANCE_ID_SECRET!,
    });

    const clientService = new ClientService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
        clientSecret: process.env.VIBE_WEB_CLIENT_SECRET!,
    });

    const couch = nano(process.env.COUCHDB_URL!);

    const dataService = new DataService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
    });

    const issuer = process.env.ISSUER_URL || "http://localhost:5000";
    const oidc = configureOidcProvider(issuer, identityService, clientService, process.env.VIBE_WEB_CLIENT_SECRET!);

    try {
        await identityService.onApplicationBootstrap(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
        await clientService.onApplicationBootstrap();
        await dataService.init();
        await couch.auth(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1); // Exit if cannot connect to DB
    }

    const app = new Elysia()
        .use(connect(oidc.callback()))
        .use(
            cors({
                origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
                credentials: true,
            })
        )
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
        .get("/health", () => ({
            status: identityService.isConnected ? "ok" : "error",
            details: identityService.isConnected ? "All systems operational" : "Database connection failed",
        }))
        .group("/auth", (app) =>
            app
                .post(
                    "/signup",
                    async ({ body, jwt }) => {
                        const { email, password } = body;
                        const existingUser = await identityService.findByEmail(email);
                        if (existingUser) {
                            return { error: "User already exists" };
                        }
                        const password_hash = await Bun.password.hash(password);
                        const user = await identityService.register(email, password_hash, password);
                        const accessToken = await jwt.sign({
                            sub: user.did,
                            instanceId: user.instanceId,
                        });

                        return { token: accessToken, refreshToken: user.refreshToken };
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
                    async ({ body, jwt }) => {
                        const { email, password } = body;
                        try {
                            const user = await identityService.login(email, password);
                            const accessToken = await jwt.sign({
                                sub: user.did,
                                instanceId: user.instanceId,
                            });
                            return { token: accessToken, refreshToken: user.refreshToken };
                        } catch (error: any) {
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
                    async ({ body }) => {
                        const { refreshToken } = body;
                        if (!refreshToken) {
                            return { success: true }; // No token to logout
                        }
                        try {
                            await identityService.logout(refreshToken);
                        } catch (error) {
                            // Fail silently if token is invalid
                        }
                        return { success: true };
                    },
                    {
                        body: t.Object({
                            refreshToken: t.String(),
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
