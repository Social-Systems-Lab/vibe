// Force type regeneration
import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { IdentityService } from "./services/identity";
import { DataService, JwtPayload } from "./services/data";
import { CertsService } from "./services/certs";
import { StorageService, MinioStorageProvider, ScalewayStorageProvider, StorageProvider } from "./services/storage";
import { getUserDbName } from "./lib/db";
import { User } from "vibe-core";
import nano from "nano";
import { proxyRequest } from "./lib/proxy";

const identityService = new IdentityService({
    url: process.env.COUCHDB_URL!,
    user: process.env.COUCHDB_USER!,
    pass: process.env.COUCHDB_PASSWORD!,
    instanceIdSecret: process.env.INSTANCE_ID_SECRET!,
});

const storageProvider =
    process.env.STORAGE_PROVIDER === "minio"
        ? new MinioStorageProvider({
              endPoint: process.env.MINIO_ENDPOINT!,
              port: parseInt(process.env.MINIO_PORT!),
              useSSL: process.env.MINIO_USE_SSL === "true",
              accessKey: process.env.MINIO_ACCESS_KEY!,
              secretKey: process.env.MINIO_SECRET_KEY!,
          })
        : new ScalewayStorageProvider({
              region: process.env.SCALEWAY_REGION!,
              endpoint: process.env.SCALEWAY_ENDPOINT!,
              credentials: {
                  accessKeyId: process.env.SCALEWAY_ACCESS_KEY!,
                  secretAccessKey: process.env.SCALEWAY_SECRET_KEY!,
              },
          });

const storageService = new StorageService(storageProvider);

const dataService = new DataService(
    {
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
    },
    identityService
);

const certsService = new CertsService(identityService, dataService);

try {
    await identityService.onApplicationBootstrap(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
    await dataService.init();
    const couch = nano(process.env.COUCHDB_URL!);
    await couch.auth(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
} catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
}

const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://127.0.0.1:3000", "http://127.0.0.1:4000", "http://127.0.0.1:5050", "http://localhost:3000", "http://localhost:4000", "http://localhost:5050"];
console.log("Cors Origin:", allowedOrigins);

const app = new Elysia()
    .use(
        cors({
            origin: allowedOrigins,
            credentials: true,
            // methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            // allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
            // exposeHeaders: ["Content-Disposition"],
            // maxAge: 86400, // 24 hours
        })
    )
    .use(cookie())
    .use(
        staticPlugin({
            assets: "public",
            prefix: "",
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
    .decorate("identityService", identityService)
    .decorate("storageService", storageService)
    .decorate("dataService", dataService)
    .decorate("certsService", certsService)
    .get("/health", () => ({
        status: identityService.isConnected ? "ok" : "error",
        service: "vibe-cloud-api",
        version: process.env.APP_VERSION || "unknown",
        details: identityService.isConnected ? "All systems operational" : "Database connection failed",
    }))
    .ws("/_next/webpack-hmr", {
        open(ws) {
            console.log("[WS] HMR client connected");
            const serverWs = new WebSocket("ws://127.0.0.1:4000/_next/webpack-hmr");
            (ws.data as any).serverWs = serverWs;

            serverWs.onmessage = ({ data }) => ws.send(data);
            serverWs.onclose = (e) => ws.close(e.code, e.reason);
        },
        message(ws, message) {
            const { serverWs } = ws.data as any;
            const toSend =
                typeof message === "object" && message !== null
                    ? JSON.stringify(message) // Explicitly stringify objects to valid JSON
                    : message;
            serverWs.send(toSend);
        },
        close(ws) {
            const { serverWs } = ws.data as any;
            serverWs.close();
        },
    })
    .get("/_next/*", ({ request }) => {
        return proxyRequest(request);
    })
    .group("/auth", (app) =>
        app
            .get(
                "/authorize",
                async ({ query, request, cookie, sessionJwt, identityService, redirect }) => {
                    console.log("[authorize] Hit /authorize endpoint with query:", query);
                    const origin = new URL(request.url).origin;
                    console.log("[authorize] Request origin:", origin);

                    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, prompt } = query;
                    const sessionToken = cookie.vibe_session.value;
                    console.log("[authorize] Session token from cookie:", cookie.vibe_session.value);
                    console.log("[authorize] Using session token:", sessionToken);

                    if (sessionToken) {
                        try {
                            const session = await sessionJwt.verify(sessionToken);
                            console.log("[authorize] Session verified:", session);

                            if (session && session.sessionId) {
                                const user = await identityService.findByDid(session.sessionId);
                                console.log("[authorize] User found:", user ? user.did : "No user found");

                                if (user) {
                                    const hasConsented = await identityService.hasUserConsented(user.did, client_id!);
                                    console.log("[authorize] User has consented:", hasConsented);

                                    if (hasConsented && prompt !== "consent") {
                                        console.log("[authorize] User has consented, creating auth code.");
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
                                        console.log("[authorize] Redirecting to client with auth code:", finalRedirectUrl.toString());
                                        return redirect(finalRedirectUrl.toString());
                                    } else {
                                        console.log("[authorize] User has not consented or prompt is 'consent'.");
                                        const { form_type, ...rest } = query as any;
                                        const params = new URLSearchParams(rest);
                                        params.set("step", "consent");
                                        const redirectPath = `/auth/wizard?${params.toString()}`;
                                        console.log("[authorize] Redirecting to wizard for consent:", redirectPath);
                                        return redirect(redirectPath);
                                    }
                                }
                            } else {
                                console.log("[authorize] Invalid session object.");
                            }
                        } catch (error) {
                            console.error("[authorize] Error verifying session:", error);
                        }
                    } else {
                        console.log("[authorize] No session token found.");
                    }

                    // If not logged in, or consent is required, redirect to the UI wizard
                    const { form_type, ...rest } = query as any;
                    const params = new URLSearchParams(rest);
                    if (form_type) {
                        params.set("step", form_type);
                    } else {
                        params.set("step", "signup");
                    }
                    const redirectPath = `/auth/wizard?${params.toString()}`;
                    console.log("[authorize] Redirecting to wizard:", redirectPath);
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
                        appName: t.Optional(t.String()),
                        backgroundImageUrl: t.Optional(t.String()),
                        appTagline: t.Optional(t.String()),
                        appDescription: t.Optional(t.String()),
                        themeColor: t.Optional(t.String()),
                        appLogoUrl: t.Optional(t.String()),
                        appLogotypeUrl: t.Optional(t.String()),
                        appShowcaseUrl: t.Optional(t.String()),
                        backgroundColor: t.Optional(t.String()),
                        buttonColor: t.Optional(t.String()),
                    }),
                }
            )
            .get(
                "/session-check",
                async ({ query, cookie, sessionJwt, identityService }) => {
                    const { client_id, redirect_uri } = query;
                    console.log("[session-check] Received request. Cookie:", cookie.vibe_session.value);

                    const renderScript = (data: any) => `
                        <script>
                            if (window.opener) {
                                window.opener.postMessage(${JSON.stringify(data)}, '*');
                                window.close();
                            } else if (window.parent) {
                                window.parent.postMessage(${JSON.stringify(data)}, '*');
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
                            const authCode = await identityService.createAuthCode({
                                userDid: user.did,
                                clientId: client_id!,
                                scope: "openid profile email",
                                redirectUri: redirect_uri!,
                                codeChallenge: query.code_challenge,
                                codeChallengeMethod: query.code_challenge_method || "S256",
                            });
                            return new Response(renderScript({ status: "SILENT_LOGIN_SUCCESS", code: authCode }), {
                                headers: { "Content-Type": "text/html" },
                            });
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
                        code_challenge: t.String(),
                        code_challenge_method: t.Optional(t.String()),
                    }),
                }
            )
            .onAfterHandle(({ request, set }) => {
                // onAfterHandle needed to get rid off CORS errors in /token endpoint
                if (request.method === "OPTIONS") return; // Let CORS plugin handle preflight fully to avoid duplication

                const origin = request.headers.get("origin") ?? "";
                console.log(`[onAfterHandle] Processing response | URL: ${request.url} | Method: ${request.method} | Origin: ${origin}`);

                if (allowedOrigins.includes(origin)) {
                    // Set headers without duplication (these will override if already set)
                    set.headers["Access-Control-Allow-Origin"] = origin;
                    set.headers["Access-Control-Allow-Credentials"] = "true";
                    set.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
                    set.headers["Access-Control-Allow-Headers"] = "*"; // Wildcard to simplify; or request.headers.get("Access-Control-Request-Headers") ?? "*"
                    set.headers["Access-Control-Max-Age"] = "86400";
                    set.headers["Access-Control-Expose-Headers"] = "Content-Disposition";
                    set.headers["Vary"] = "Origin";
                    console.log("[onAfterHandle] CORS headers added successfully");
                } else {
                    console.log(`[onAfterHandle] Origin not allowed: ${origin}`);
                }
            })
            .post(
                "/token",
                async ({ body, identityService, jwt }) => {
                    //console.log("[/auth/token] Received body:", body);
                    const { grant_type, code, code_verifier, client_id, redirect_uri } = body;

                    if (grant_type !== "authorization_code") {
                        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
                    }

                    const userDid = await identityService.validateAuthCode(code, code_verifier, client_id, redirect_uri);
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
                async ({ body, sessionJwt, cookie, set, query, identityService, redirect, request }) => {
                    const { email, password } = body;
                    try {
                        const user = await identityService.login(email, password);
                        const sessionToken = await sessionJwt.sign({
                            sessionId: user.did,
                        });
                        const origin = new URL(request.url).origin;
                        console.log("[login] Setting session cookie on origin:", origin);

                        cookie.vibe_session.set({
                            value: sessionToken,
                            httpOnly: true,
                            maxAge: 30 * 86400, // 30 days
                            path: "/",
                            sameSite: "strict",
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
                async ({ body, sessionJwt, cookie, set, query, identityService, redirect, request }) => {
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
                    const origin = new URL(request.url).origin;
                    console.log("[signup] Setting session cookie on origin:", origin);

                    cookie.vibe_session.set({
                        value: sessionToken,
                        httpOnly: true,
                        maxAge: 30 * 86400, // 30 days
                        path: "/",
                        sameSite: "strict",
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
                async ({ body, sessionJwt, cookie, set, query, identityService, redirect }) => {
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
                    params.set("step", "consent");
                    return redirect(`/auth/wizard?${params.toString()}`);
                },
                {
                    body: t.Object({
                        displayName: t.String(),
                        bio: t.Optional(t.String()),
                    }),
                }
            )
            .post(
                "/consent",
                async ({ body, query, cookie, sessionJwt, identityService, redirect, set }) => {
                    const { action } = body;
                    const { client_id } = query;
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

                    if (action === "approve") {
                        await identityService.storeUserConsent(session.sessionId, client_id);
                    } else {
                        // Handle denial if necessary, for now, we'll just redirect
                    }

                    const params = new URLSearchParams(query as any);
                    return redirect(`/auth/authorize?${params.toString()}`);
                },
                {
                    body: t.Object({
                        action: t.String(),
                    }),
                }
            )
            .get(
                "/logout",
                async ({ cookie, query, redirect, request }) => {
                    const origin = new URL(request.url).origin;
                    console.log(`[logout] Clearing cookie ${cookie.vibe_session.value} on origin: ${origin}`);
                    cookie.vibe_session.set({
                        value: "",
                        maxAge: -1,
                        path: "/",
                        httpOnly: true,
                        sameSite: "strict",
                    });
                    console.log(`Cookie cleared. Set to ${cookie.vibe_session.value}`);
                    console.log("After logout, cookie should be cleared.");
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    return redirect(query.redirect_uri);
                },
                {
                    query: t.Object({
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
            .onAfterHandle(({ request, set }) => {
                // onAfterHandle needed to get rid off CORS errors in /users/me endpoint
                if (request.method === "OPTIONS") return; // Let CORS plugin handle preflight fully to avoid duplication

                const origin = request.headers.get("origin") ?? "";
                console.log(`[onAfterHandle] Processing response | URL: ${request.url} | Method: ${request.method} | Origin: ${origin}`);

                if (!origin || allowedOrigins.includes(origin)) {
                    // Set headers without duplication (these will override if already set)
                    set.headers["Access-Control-Allow-Origin"] = origin;
                    set.headers["Access-Control-Allow-Credentials"] = "true";
                    set.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
                    set.headers["Access-Control-Allow-Headers"] = "*"; // Wildcard to simplify; or request.headers.get("Access-Control-Request-Headers") ?? "*"
                    set.headers["Access-Control-Max-Age"] = "86400";
                    set.headers["Access-Control-Expose-Headers"] = "Content-Disposition";
                    set.headers["Vary"] = "Origin";
                    console.log("[onAfterHandle] CORS headers added successfully");
                } else {
                    console.log(`[onAfterHandle] Origin not allowed: ${origin}`);
                }
            })
            .get("/me", async ({ profile, set, identityService }) => {
                if (!profile) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }
                const userDoc = await identityService.findByDid(profile.sub);
                if (!userDoc) {
                    set.status = 404;
                    return { error: "User not found" };
                }
                const user: User = {
                    did: userDoc.did,
                    instanceId: userDoc.instanceId,
                    displayName: userDoc.displayName,
                    pictureUrl: userDoc.pictureUrl || userDoc.profilePictureUrl,
                };
                return { user };
            })
            .patch(
                "/me",
                async ({ profile, body, set, identityService, dataService }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const user = await identityService.updateUser(profile.sub, body);

                    await dataService.update(
                        "profiles",
                        {
                            _id: "profiles/me",
                            name: body.displayName,
                            pictureUrl: body.pictureUrl,
                            did: user.did,
                        },
                        profile as JwtPayload
                    );

                    return { user };
                },
                {
                    body: t.Object({
                        displayName: t.Optional(t.String()),
                        pictureUrl: t.Optional(t.String()),
                    }),
                }
            )
            .get("/me/encrypted-key", async ({ profile, set, identityService }) => {
                if (!profile) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }
                const userDoc = await identityService.findByDid(profile.sub);
                if (!userDoc) {
                    set.status = 404;
                    return { error: "User not found" };
                }
                return { encryptedPrivateKey: userDoc.encryptedPrivateKey };
            })
    )
    .group("/storage", (app) =>
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
            .post(
                "/upload",
                async ({ profile, body, set, storageService }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }

                    const { file } = body as { file: File };

                    if (!file || !(file instanceof Blob)) {
                        set.status = 400;
                        return { error: "Invalid file upload" };
                    }

                    try {
                        const buffer = Buffer.from(await file.arrayBuffer());
                        const bucketName = `user-${profile.instanceId}`;
                        const fileName = `${Date.now()}-${file.name}`;
                        await storageService.upload(bucketName, fileName, buffer, file.type);
                        const url = await storageService.getPublicURL(bucketName, fileName);
                        return { url };
                    } catch (error: any) {
                        console.error("Error uploading file:", error);
                        set.status = 500;
                        return { error: "Failed to upload file" };
                    }
                },
                {
                    body: t.Object({
                        file: t.Any(),
                    }),
                }
            )
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
                async ({ profile, params, body, set, dataService }) => {
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
                async ({ profile, params, body, set, query, dataService }) => {
                    try {
                        const fullQuery = {
                            ...(body as any),
                            expand: query.expand ? query.expand.split(",") : undefined,
                            global: query.global === "true",
                        };
                        const result = await dataService.readOnce(params.collection, fullQuery, profile as JwtPayload);
                        return result;
                    } catch (error: any) {
                        set.status = 500;
                        return { error: error.message };
                    }
                },
                {
                    params: t.Object({ collection: t.String() }),
                    query: t.Object({
                        expand: t.Optional(t.String()),
                        global: t.Optional(t.String()),
                    }),
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
                async message(ws, message: { type: string; token?: string; query?: any }) {
                    const { collection } = ws.data.params;

                    if (message.type === "auth") {
                        try {
                            const profile = await ws.data.jwt.verify(message.token);
                            if (!profile) {
                                ws.close(4001, "Unauthorized");
                                return;
                            }
                            (ws.data as any).profile = profile;
                            console.log(`WebSocket authenticated for collection: ${collection} by user ${profile.sub}`);

                            const processAndSend = async () => {
                                const result = await dataService.readOnce(collection, message.query || {}, profile as JwtPayload);
                                ws.send(result.docs);
                            };

                            await processAndSend();

                            const db = dataService.getDb(profile.instanceId);
                            const changes = db.changesReader.start({ since: "now", includeDocs: true });
                            (ws.data as any).changes = changes;

                            changes.on("change", async (change) => {
                                if (change.doc?.collection === collection) {
                                    await processAndSend();
                                }
                            });
                        } catch (e) {
                            ws.send({ type: "error", message: "Token expired" });
                        }
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
            .ws("/global", {
                async open(ws) {
                    console.log("Global WebSocket connection opened");
                },
                async message(ws, message: { type: string; token?: string; query?: any }) {
                    if (message.type === "auth") {
                        const profile = await ws.data.jwt.verify(message.token);
                        if (!profile) {
                            ws.close(4001, "Unauthorized");
                            return;
                        }
                        (ws.data as any).profile = profile;
                        const { collection, ...query } = message.query;
                        (ws.data as any).query = query;
                        (ws.data as any).collection = collection;

                        console.log(`Global WebSocket authenticated for collection: ${collection} by user ${profile.sub}`);

                        const dbNames = await dataService.getAllUserDbNames();
                        const changesFeeds: any[] = [];

                        const processAndSend = async () => {
                            const result = await dataService.readOnce(collection, { ...query, global: true }, profile as JwtPayload);
                            ws.send(result.docs);
                        };

                        await processAndSend();

                        for (const dbName of dbNames) {
                            try {
                                const instanceId = dbName.replace("userdb-", "");
                                const db = dataService.getDb(instanceId);
                                const changes = db.changesReader.start({ since: "now", includeDocs: true });
                                changes.on("change", async (change) => {
                                    if (change.doc?.collection === collection) {
                                        await processAndSend();
                                    }
                                });
                                changesFeeds.push(changes);
                            } catch (error) {
                                console.error(`Error processing database ${dbName}:`, error);
                            }
                        }
                        (ws.data as any).changes = changesFeeds;
                    }
                },
                close(ws) {
                    const { profile, changes, collection } = ws.data as any;
                    if (changes) {
                        changes.forEach((feed: any) => feed.stop());
                    }
                    if (profile) {
                        console.log(`Global WebSocket closed for collection: ${collection} by user ${profile.sub}`);
                    } else {
                        console.log(`Global WebSocket closed for collection: ${collection}`);
                    }
                },
            })
            .get(
                "/expand",
                async ({ query, set, identityService }) => {
                    const { did, ref } = query;
                    if (!did || !ref) {
                        set.status = 400;
                        return { error: "Missing did or ref" };
                    }
                    try {
                        const user = await identityService.findByDid(did);
                        if (!user) {
                            set.status = 404;
                            return { error: "User not found" };
                        }
                        const db = dataService.getDb(user.instanceId);
                        const doc = await db.get(ref);
                        return doc;
                    } catch (error) {
                        console.error("Error expanding document:", error);
                        set.status = 500;
                        return { error: "Failed to expand document" };
                    }
                },
                {
                    query: t.Object({
                        did: t.String(),
                        ref: t.String(),
                    }),
                }
            )
    )
    .group("/certs", (app) =>
        app
            .derive(async ({ jwt, headers }) => {
                const auth = headers.authorization;
                const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
                if (!token) return { profile: null };
                try {
                    const profile = await jwt.verify(token);
                    return { profile };
                } catch {
                    return { profile: null };
                }
            })
            .guard({
                beforeHandle: ({ profile, set }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                },
            })
            .post(
                "/issue",
                async ({ profile, body, set, certsService }) => {
                    try {
                        const certificate = await certsService.issue(body, profile as JwtPayload);
                        return { success: true, certificate };
                    } catch (error: any) {
                        set.status = 500;
                        return { error: error.message };
                    }
                },
                {
                    body: t.Object({
                        _id: t.String(),
                        type: t.String(),
                        certType: t.Object({
                            did: t.String(),
                            ref: t.String(),
                        }),
                        issuer: t.String(),
                        subject: t.String(),
                        expires: t.Optional(t.String()),
                        signature: t.String(),
                    }),
                }
            )
            .post(
                "/revoke/:certId",
                async ({ profile, params, set, certsService }) => {
                    try {
                        await certsService.revoke(params.certId, profile as JwtPayload);
                        return { success: true };
                    } catch (error: any) {
                        set.status = 500;
                        return { error: error.message };
                    }
                },
                {
                    params: t.Object({
                        certId: t.String(),
                    }),
                }
            )
    )
    .listen(process.env.PORT || 5050);

export type App = typeof app;

console.log(`Vibe Cloud API (${process.env.APP_VERSION}) is running at http://${app.server?.hostname}:${app.server?.port}`);
