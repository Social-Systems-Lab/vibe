import { Elysia, t } from "elysia";
import { env } from "@yolk-oss/elysia-env";
import { IdentityService } from "./services/identity";

const app = new Elysia()
    .use(
        env({
            COUCHDB_URL: t.String(),
            COUCHDB_USER: t.String(),
            COUCHDB_PASSWORD: t.String(),
        })
    )
    .decorate("identityService", ({ env }) => {
        const service = new IdentityService({
            url: env.COUCHDB_URL,
            user: env.COUCHDB_USER,
            pass: env.COUCHDB_PASSWORD,
        });
        service.onApplicationBootstrap(env.COUCHDB_USER, env.COUCHDB_PASSWORD);
        return service;
    })
    .get("/health", () => ({
        status: "ok",
    }))
    .group("/auth", (app) =>
        app
            .post(
                "/signup",
                async ({ body, identityService }) => {
                    const { email, password } = body;
                    const existingUser = await identityService.findByEmail(email);
                    if (existingUser) {
                        return { error: "User already exists" };
                    }
                    const password_hash = await Bun.password.hash(password);
                    await identityService.register(email, password_hash);
                    return { success: true };
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
                async ({ body, identityService }) => {
                    const { email, password } = body;
                    const user = await identityService.findByEmail(email);
                    if (!user) {
                        return { error: "Invalid credentials" };
                    }
                    const isMatch = await Bun.password.verify(password, user.password_hash);
                    if (!isMatch) {
                        return { error: "Invalid credentials" };
                    }
                    // TODO: JWT
                    return { token: "placeholder-token" };
                },
                {
                    body: t.Object({
                        email: t.String(),
                        password: t.String(),
                    }),
                }
            )
    )
    .listen(5000);

console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
