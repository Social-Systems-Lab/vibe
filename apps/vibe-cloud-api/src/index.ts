import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { cors } from "@elysiajs/cors";
import { IdentityService } from "./services/identity";

const startServer = async () => {
    const identityService = new IdentityService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
        instanceIdSecret: process.env.INSTANCE_ID_SECRET!,
    });

    try {
        await identityService.onApplicationBootstrap(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
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
        .use(cookie())
        .get("/health", () => ({
            status: identityService.isConnected ? "ok" : "error",
            details: identityService.isConnected ? "All systems operational" : "Database connection failed",
        }))
        .group("/auth", (app) =>
            app
                .post(
                    "/signup",
                    async ({ body, jwt, cookie }) => {
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
                        cookie.refreshToken.set({
                            value: user.refreshToken,
                            httpOnly: true,
                            maxAge: 30 * 86400, // 30 days
                            path: "/",
                        });

                        return { token: accessToken };
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
                    async ({ body, jwt, cookie }) => {
                        const { email, password } = body;
                        try {
                            const user = await identityService.login(email, password);
                            const accessToken = await jwt.sign({
                                sub: user.did,
                                instanceId: user.instanceId,
                            });
                            cookie.refreshToken.set({
                                value: user.refreshToken,
                                httpOnly: true,
                                maxAge: 30 * 86400, // 30 days
                                path: "/",
                            });
                            return { token: accessToken };
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
                .post("/refresh", async ({ jwt, cookie, set, headers }) => {
                    const { refreshToken } = cookie;

                    if (!refreshToken.value) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }

                    try {
                        const authHeader = headers.authorization;
                        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

                        if (!token) {
                            set.status = 401;
                            return { error: "Unauthorized" };
                        }

                        const payload = await jwt.verify(token);
                        if (!payload) {
                            set.status = 401;
                            return { error: "Unauthorized" };
                        }

                        const result = await identityService.validateRefreshToken(refreshToken.value);
                        const newAccessToken = await jwt.sign({
                            sub: result.did,
                            instanceId: result.instanceId,
                        });
                        cookie.refreshToken.set({
                            value: result.refreshToken,
                            httpOnly: true,
                            maxAge: 30 * 86400, // 30 days
                            path: "/",
                        });
                        return { token: newAccessToken };
                    } catch (error) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                })
                .post("/logout", async ({ jwt, cookie, set, headers }) => {
                    const { refreshToken } = cookie;
                    if (!refreshToken.value) {
                        return { success: true }; // No token to logout
                    }
                    try {
                        const authHeader = headers.authorization;
                        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

                        if (token) {
                            const payload = await jwt.verify(token);
                            if (payload) {
                                await identityService.logout(refreshToken.value);
                            }
                        }
                        refreshToken.remove();
                        return { success: true };
                    } catch (error) {
                        // If the token is invalid, we can just remove the cookie
                        refreshToken.remove();
                        return { success: true };
                    }
                })
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
