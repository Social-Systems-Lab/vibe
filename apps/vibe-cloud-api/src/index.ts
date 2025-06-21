import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { IdentityService } from "./services/identity";

const identityService = new IdentityService({
    url: process.env.COUCHDB_URL!,
    user: process.env.COUCHDB_USER!,
    pass: process.env.COUCHDB_PASSWORD!,
});

await identityService.onApplicationBootstrap(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);

console.log("🦊 CouchDB connection initialized successfully");

const app = new Elysia()
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!,
            exp: "15m",
        })
    )
    .use(cookie())
    .get("/health", () => ({
        status: "ok",
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
                        id: user.id,
                    });
                    const refreshToken = await jwt.sign({
                        id: user.id,
                    });

                    cookie.refreshToken.set({
                        value: refreshToken,
                        httpOnly: true,
                        maxAge: 7 * 86400,
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
                    const user = await identityService.findByEmail(email);
                    if (!user) {
                        return { error: "Invalid credentials" };
                    }
                    const isMatch = await Bun.password.verify(password, user.password_hash);
                    if (!isMatch) {
                        return { error: "Invalid credentials" };
                    }
                    const accessToken = await jwt.sign({
                        id: user._id,
                    });
                    const refreshToken = await jwt.sign({
                        id: user._id,
                    });
                    cookie.refreshToken.set({
                        value: refreshToken,
                        httpOnly: true,
                        maxAge: 7 * 86400,
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
            .post("/refresh", async ({ jwt, cookie, set }) => {
                const refreshToken = cookie.refreshToken.value;
                if (!refreshToken) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }

                const decoded = await jwt.verify(refreshToken);
                if (!decoded) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }
                const token = await jwt.sign({
                    id: decoded.id,
                });
                return { token };
            })
            .post("/logout", ({ cookie }) => {
                cookie.refreshToken.remove();
                return { success: true };
            })
    )
    .group("/users", (app) =>
        app.get("/me", async ({ jwt, set }) => {
            const decoded = await jwt.verify();
            if (!decoded) {
                set.status = 401;
                return { error: "Unauthorized" };
            }
            return { user: decoded.id };
        })
    )
    .listen(5000);

console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
