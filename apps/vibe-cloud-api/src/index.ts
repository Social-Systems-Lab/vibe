// Force type regeneration
import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { IdentityService as CouchIdentityService } from "./services/identity";
import { IdentityService as PostgresIdentityService } from "./services/identity.postgres";
import { DataService, JwtPayload } from "./services/data";
import { PostgresDataService } from "./services/data.postgres";
import { CertsService } from "./services/certs";
import { EmailService } from "./services/email";
import { StorageService, MinioStorageProvider, ScalewayStorageProvider, StorageProvider } from "./services/storage";
import { QuotaService } from "./services/quota";
import { QuotaServiceNoop } from "./services/quota.noop";
import { getUserDbName } from "./lib/db";
import { Certificate, User } from "vibe-core";
import nano from "nano";
import { randomBytes, createHash } from "crypto";
import { proxyRequest } from "./lib/proxy";
import { GlobalFeedService } from "./services/global-feed";
import { allowRead, isKeyInInstance } from "./lib/acl";

const globalFeedService = new GlobalFeedService();

const dataProvider = process.env.DATA_PROVIDER || "couch";

const identityService =
    dataProvider === "postgres"
        ? new PostgresIdentityService({
              connectionString: process.env.PG_CONNECTION_STRING,
              host: process.env.PGHOST,
              port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
              database: process.env.PGDATABASE,
              user: process.env.PGUSER,
              password: process.env.PGPASSWORD,
              instanceIdSecret: process.env.INSTANCE_ID_SECRET!,
          })
        : new CouchIdentityService({
              url: process.env.COUCHDB_URL!,
              user: process.env.COUCHDB_USER!,
              pass: process.env.COUCHDB_PASSWORD!,
              instanceIdSecret: process.env.INSTANCE_ID_SECRET!,
          });

const storageProvider =
    process.env.STORAGE_PROVIDER === "minio"
        ? new MinioStorageProvider({
              endPoint: process.env.MINIO_ENDPOINT || "http://localhost",
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
const quotaService = dataProvider === "postgres" ? new QuotaServiceNoop() : new QuotaService();
const STORAGE_BUCKET = process.env.STORAGE_BUCKET_NAME || process.env.SCALEWAY_BUCKET_NAME!;

// TTL and caching policy (configurable via env)
const PRESIGN_DEFAULT_TTL_SECONDS = Number(process.env.PRESIGN_DEFAULT_TTL_SECONDS ?? 300);
const PRESIGN_MAX_TTL_SECONDS = Number(process.env.PRESIGN_MAX_TTL_SECONDS ?? 3600);
const PRESIGN_OWNER_TTL_SECONDS = Number(process.env.PRESIGN_OWNER_TTL_SECONDS ?? 86400);
const PRESIGN_FORCE_TTL_FOR_OWNER = (process.env.PRESIGN_FORCE_TTL_FOR_OWNER ?? "false") === "true";
const STREAM_PRIVATE_MAX_AGE_SECONDS = Number(process.env.STREAM_PRIVATE_MAX_AGE_SECONDS ?? 3600);
const STREAM_PUBLIC_MAX_AGE_SECONDS = Number(process.env.STREAM_PUBLIC_MAX_AGE_SECONDS ?? 86400);

const dataService: any =
    dataProvider === "postgres"
        ? new PostgresDataService(
              {
                  connectionString: process.env.PG_CONNECTION_STRING,
                  host: process.env.PGHOST,
                  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
                  database: process.env.PGDATABASE,
                  user: process.env.PGUSER,
                  password: process.env.PGPASSWORD,
              },
              identityService,
              globalFeedService
          )
        : new DataService(
              {
                  url: process.env.COUCHDB_URL!,
                  user: process.env.COUCHDB_USER!,
                  pass: process.env.COUCHDB_PASSWORD!,
              },
              identityService,
              globalFeedService
          );

const certsService = new CertsService(identityService, dataService);
const emailService = new EmailService();

try {
    await identityService.onApplicationBootstrap(
        process.env.COUCHDB_USER!,
        process.env.COUCHDB_PASSWORD!
    );
    await dataService.init();
    if (dataProvider === "couch") {
        const couch = nano(process.env.COUCHDB_URL!);
        await couch.auth(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
        await globalFeedService.init(
            process.env.COUCHDB_URL!,
            process.env.COUCHDB_USER!,
            process.env.COUCHDB_PASSWORD!
        );
    }
} catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
}

const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : "http://localhost:3000,http://localhost:3001,http://localhost:4000,http://localhost:5050".split(",");

//allowedOrigins.push(process.env.VIBE_CLOUD_UI_URL || "http://vibe-cloud-ui-service:4000");

console.log("Cors Origin:", allowedOrigins);

const app = new Elysia()
    .use(
        cors({
            origin: allowedOrigins,
            credentials: true,
        })
    )
    .use(cookie())
    .use(
        staticPlugin({
            assets: "public",
            prefix: "",
            ignorePatterns: ["hub.html"],
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
    .decorate("quotaService", quotaService)
    .decorate("dataService", dataService)
    .decorate("certsService", certsService)
    .decorate("emailService", emailService)
    .decorate("globalFeedService", globalFeedService)
    .get("/health", () => ({
        status: identityService.isConnected ? "ok" : "error",
        service: "vibe-cloud-api",
        version: process.env.APP_VERSION || "unknown",
        details: identityService.isConnected ? "All systems operational" : "Database connection failed",
    }))
    .get("/hub.html", async () => {
        const hubHtml = await Bun.file("public/hub.html").text();
        // Use public Couch URL if provided, else fall back to internal COUCHDB_URL
        const couchDbUrl = process.env.COUCHDB_PUBLIC_URL || process.env.COUCHDB_URL!;
        const replacedHtml = hubHtml.replace("__COUCHDB_URL__", couchDbUrl);
        return new Response(replacedHtml, {
            headers: { "Content-Type": "text/html" },
        });
    })
    .ws("/_next/webpack-hmr", {
        open(ws) {
            console.log("[WS] HMR client connected");
            const uiUrl = process.env.VIBE_CLOUD_UI_URL || "http://localhost:4000";
            const wsUrl = uiUrl.replace(/^http/, "ws");
            const serverWs = new WebSocket(`${wsUrl}/_next/webpack-hmr`);
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
    // Proxy the App Grid UI just like the wizard
    .get("/app-grid", ({ request }) => proxyRequest(request))
    .group("/auth", (app) =>
        app
            .get(
                "/me",
                async ({ cookie, sessionJwt, identityService, set }) => {
                    const sessionToken = cookie.vibe_session.value;
                    if (!sessionToken) return { displayName: "", pictureUrl: undefined };
                    try {
                        const session = await sessionJwt.verify(sessionToken);
                        if (!session || !session.sessionId) return { displayName: "", pictureUrl: undefined };
                        const user = await identityService.findByDid(session.sessionId);
                        if (!user) return { displayName: "", pictureUrl: undefined };
                        return {
                            displayName: user.displayName || "",
                            pictureUrl: user.pictureUrl || user.profilePictureUrl,
                        };
                    } catch (e) {
                        set.status = 200;
                        return { displayName: "", pictureUrl: undefined };
                    }
                }
            )
            .get(
                "/authorize",
                async ({ query, request, cookie, sessionJwt, identityService, redirect }) => {
                    console.log("[authorize] Hit /authorize endpoint with query:", query);
                    const origin = new URL(request.url).origin;
                    console.log("[authorize] Request origin:", origin);

                    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, prompt } =
                        query;
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
                                    // Handle prompt for settings
                                    if (prompt === "profile" || prompt === "consent") {
                                        const { form_type, ...rest } = query as any;
                                        const params = new URLSearchParams(rest);
                                        params.set("step", prompt);
                                        const redirectPath = `/auth/wizard?${params.toString()}`;
                                        return redirect(redirectPath);
                                    }

                                    const hasConsented = await identityService.hasUserConsented(user.did, client_id!);
                                    console.log("[authorize] User has consented:", hasConsented);

                                    if (hasConsented) {
                                        // Check if manifest has changed significantly (especially scopes)
                                        const consents = await identityService.listUserConsents(user.did);
                                        const existingConsent = consents.find((c) => c.clientId === client_id);

                                        if (existingConsent) {
                                            // Compare scopes - if app requested new scopes, require re-consent
                                            const requestedScopes = scope ? scope.split(" ").sort() : [];
                                            const consentedScopes = (existingConsent.scopes || []).sort();

                                            const hasNewScopes = requestedScopes.some(
                                                (scope) => !consentedScopes.includes(scope)
                                            );
                                            const hasFewerScopes = consentedScopes.some(
                                                (scope) => !requestedScopes.includes(scope)
                                            );

                                            if (hasNewScopes || hasFewerScopes) {
                                                console.log("[authorize] App manifest changed, requiring re-consent");
                                                const { form_type, ...rest } = query as any;
                                                const params = new URLSearchParams(rest);
                                                params.set("step", "consent");
                                                params.set("hasConsented", "false"); // Force re-consent
                                                const redirectPath = `/auth/wizard?${params.toString()}`;
                                                console.log(
                                                    "[authorize] Redirecting to wizard for re-consent:",
                                                    redirectPath
                                                );
                                                return redirect(redirectPath);
                                            }
                                        }

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
                                        console.log(
                                            "[authorize] Redirecting to client with auth code:",
                                            finalRedirectUrl.toString()
                                        );
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
                    // Sanitize UI-only params (avoid literal "undefined" strings)
                    const { form_type, ...rest } = query as any;
                    const params = new URLSearchParams();
                    for (const [k, v] of Object.entries(rest)) {
                        if (v === undefined || v === null || v === "undefined") continue;
                        params.set(k, String(v));
                    }
                    if (form_type) {
                        params.set("step", form_type);
                    } else if (!params.get("step")) {
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
                        flow: t.Optional(t.String()), // "settings" or "consent"
                        hasConsented: t.Optional(t.Boolean()), // For settings flow
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
                        return new Response(renderScript({ status: "LOGGED_OUT" }), {
                            headers: { "Content-Type": "text/html" },
                        });
                    }

                    try {
                        const session = await sessionJwt.verify(sessionToken);
                        if (!session || !session.sessionId) {
                            return new Response(renderScript({ status: "LOGGED_OUT" }), {
                                headers: { "Content-Type": "text/html" },
                            });
                        }

                        const userDid = session.sessionId;
                        const user = await identityService.findByDid(userDid);
                        if (!user) {
                            return new Response(renderScript({ status: "LOGGED_OUT" }), {
                                headers: { "Content-Type": "text/html" },
                            });
                        }

                        const hasConsented = await identityService.hasUserConsented(userDid, client_id);

                        const sanitizedUser = {
                            did: user.did,
                            instanceId: user.instanceId,
                            displayName: user.displayName,
                        };

                        let authCode: string | null = null;
                        if (hasConsented) {
                            authCode = await identityService.createAuthCode({
                                userDid: user.did,
                                clientId: client_id!,
                                scope: "openid profile email",
                                redirectUri: redirect_uri!,
                                codeChallenge: query.code_challenge,
                                codeChallengeMethod: query.code_challenge_method || "S256",
                            });
                        }

                        return new Response(
                            renderScript({
                                status: "LOGGED_IN",
                                user: sanitizedUser,
                                code: authCode,
                                hasConsented,
                            }),
                            {
                                headers: { "Content-Type": "text/html" },
                            }
                        );
                    } catch (e) {
                        return new Response(renderScript({ status: "LOGGED_OUT" }), {
                            headers: { "Content-Type": "text/html" },
                        });
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
            // .onAfterHandle(({ request, set }) => {
            //     // onAfterHandle needed to get rid off CORS errors in /token endpoint
            //     if (request.method === "OPTIONS") return; // Let CORS plugin handle preflight fully to avoid duplication

            //     const origin = request.headers.get("origin") ?? "";
            //     console.log(`[onAfterHandle] Processing response | URL: ${request.url} | Method: ${request.method} | Origin: ${origin}`);

            //     if (allowedOrigins.includes(origin)) {
            //         // Set headers without duplication (these will override if already set)
            //         set.headers["Access-Control-Allow-Origin"] = origin;
            //         set.headers["Access-Control-Allow-Credentials"] = "true";
            //         set.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
            //         set.headers["Access-Control-Allow-Headers"] = "*"; // Wildcard to simplify; or request.headers.get("Access-Control-Request-Headers") ?? "*"
            //         set.headers["Access-Control-Max-Age"] = "86400";
            //         set.headers["Access-Control-Expose-Headers"] = "Content-Disposition";
            //         set.headers["Vary"] = "Origin";
            //         console.log("[onAfterHandle] CORS headers added successfully");
            //     } else {
            //         console.log(`[onAfterHandle] Origin not allowed: ${origin}`);
            //     }
            // })
            .post(
                "/token",
                async ({ body, identityService, jwt }) => {
                    //console.log("[/auth/token] Received body:", body);
                    const { grant_type, code, code_verifier, client_id, redirect_uri } = body;

                    if (grant_type !== "authorization_code") {
                        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
                    }

                    const userDid = await identityService.validateAuthCode(
                        code,
                        code_verifier,
                        client_id,
                        redirect_uri
                    );
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
                            sameSite: "none",
                            secure: true,
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
                        const params = new URLSearchParams(query as any);
                        params.set("error", "User already exists");
                        return redirect(`/auth/wizard?${params.toString()}`);
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
                        sameSite: "none",
                        secure: true,
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
                async ({
                    body,
                    sessionJwt,
                    cookie,
                    set,
                    query,
                    identityService,
                    storageService,
                    dataService,
                    redirect,
                }) => {
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

                    const userDid = session.sessionId;
                    const { displayName, bio, picture, pictureUrl: bodyPictureUrl } = body;

                    let pictureUrl: string | undefined = bodyPictureUrl;

                    if (!pictureUrl && picture && picture.size > 0) {
                        try {
                            const user = await identityService.findByDid(userDid);
                            if (!user) {
                                set.status = 404;
                                return { error: "User not found" };
                            }
                            const buffer = Buffer.from(await picture.arrayBuffer());
                            const bucketName = STORAGE_BUCKET;
                            const fileName = `profile-${Date.now()}-${picture.name}`;
                            await storageService.upload(bucketName, fileName, buffer, picture.type);
                            pictureUrl = await storageService.getPublicURL(bucketName, fileName);
                        } catch (error) {
                            console.error("Error uploading profile picture:", error);
                            set.status = 500;
                            return { error: "Failed to upload profile picture." };
                        }
                    }

                    const userData: { displayName: string; bio?: string; pictureUrl?: string } = { displayName };
                    if (bio) {
                        userData.bio = bio;
                    }
                    if (pictureUrl) {
                        userData.pictureUrl = pictureUrl;
                    }

                    const updatedUser = await identityService.updateUser(userDid, userData);

                    // The hub will handle syncing the profile document

                    const params = new URLSearchParams(query as any);
                    const flow = params.get("flow");

                    if (flow === "settings") {
                        // When editing from profile settings, we might want to stay on the page
                        // or redirect somewhere else. For now, let's redirect back to the app.
                        const clientRedirect = params.get("redirect_uri");
                        if (clientRedirect) {
                            return { redirectTo: clientRedirect };
                        }
                    }

                    params.set("step", "consent");
                    return redirect(`/auth/wizard?${params.toString()}`);
                },
                {
                    body: t.Object({
                        displayName: t.String(),
                        bio: t.Optional(t.String()),
                        picture: t.Optional(t.File()),
                        pictureUrl: t.Optional(t.String()),
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
                        // Build consent object from existing authorize query params
                        const redirectUri = (query as any).redirect_uri as string | undefined;
                        const origin = redirectUri ? new URL(redirectUri).origin : (query as any).origin || client_id;

                        const manifest = {
                            appName: (query as any).appName,
                            appDescription: (query as any).appDescription,
                            appTagline: (query as any).appTagline,
                            appLogoUrl: (query as any).appLogoUrl,
                            appLogotypeUrl: (query as any).appLogotypeUrl,
                            appShowcaseUrl: (query as any).appShowcaseUrl,
                            backgroundImageUrl: (query as any).backgroundImageUrl,
                            backgroundColor: (query as any).backgroundColor,
                            buttonColor: (query as any).buttonColor,
                            themeColor: (query as any).themeColor,
                        };

                        await identityService.storeUserConsent(session.sessionId, {
                            clientId: client_id,
                            origin: origin!,
                            manifest,
                        });
                    } else {
                        await identityService.revokeUserConsent(session.sessionId, client_id);
                    }

                    // Rebuild query without "undefined" string values or UI-only noise that breaks flows
                    const params = new URLSearchParams();
                    for (const [k, v] of Object.entries(query as any)) {
                        if (v === undefined || v === null || v === "undefined") continue;
                        params.set(k, String(v));
                    }
                    if (params.get("flow") === "settings") {
                        if (action === "approve") {
                            const redirectUri = params.get("redirect_uri");
                            if (redirectUri) {
                                console.log("[consent] Redirecting to:", redirectUri);
                                return { redirectTo: redirectUri };
                            }
                        }
                        return { ok: true };
                    }

                    params.delete("prompt");
                    params.delete("step");
                    // UI-only params should not leak into authorize roundtrip
                    params.delete("appName");
                    params.delete("appTagline");
                    params.delete("appDescription");
                    params.delete("appLogoUrl");
                    params.delete("appLogotypeUrl");
                    params.delete("appShowcaseUrl");
                    params.delete("backgroundImageUrl");
                    params.delete("backgroundColor");
                    params.delete("fontColor");
                    params.delete("buttonColor");
                    const redirectTo = `/auth/authorize?${params.toString()}`;
                    console.log("[consent] Redirecting to:", redirectTo);
                    return { redirectTo };
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
                        sameSite: "none",
                        secure: true,
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
            .get("/me", async ({ cookie, set, identityService, sessionJwt }) => {
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

                const user = await identityService.findByDid(session.sessionId);
                if (!user) {
                    set.status = 404;
                    return { error: "User not found" };
                }

                return {
                    displayName: user.displayName,
                    pictureUrl: user.pictureUrl,
                };
            })
            // Return structured consents for the logged-in user (for cloud-ui iframe)
            .get("/me/consents", async ({ cookie, set, identityService, sessionJwt, request }) => {
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

                const consents = await identityService.listUserConsents(session.sessionId);
                return { consents };
            })
            .delete(
                "/me/consents",
                async ({ cookie, set, identityService, sessionJwt, body }) => {
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

                    const { clientId } = body as { clientId: string };
                    if (!clientId) {
                        set.status = 400;
                        return { error: "Missing clientId" };
                    }

                    await identityService.revokeUserConsent(session.sessionId, clientId);
                    return { success: true };
                },
                {
                    body: t.Object({
                        clientId: t.String(),
                    }),
                }
            )
            .post(
                "/password/forgot",
                async ({ body, identityService, emailService }) => {
                    const { email } = body;
                    const user = await identityService.findByEmail(email);
                    if (user) {
                        const token = randomBytes(32).toString("hex");
                        const hashedToken = createHash("sha256").update(token).digest("hex");
                        const expires = new Date();
                        expires.setHours(expires.getHours() + 1); // 1 hour validity
                        if (!user.resetTokens) {
                            user.resetTokens = [];
                        }
                        user.resetTokens.push({
                            hash: hashedToken,
                            expires: expires.toISOString(),
                        });
                        await identityService.updateUser(user.did, {});
                        await emailService.sendPasswordResetEmail(email, token);
                    }
                    return { success: true };
                },
                {
                    body: t.Object({
                        email: t.String(),
                    }),
                }
            )
            .post(
                "/password/reset",
                async ({ body, identityService, set }) => {
                    const { token, password } = body;
                    const user = await identityService.findUserByResetToken(token);
                    if (!user) {
                        set.status = 400;
                        return { error: "Invalid or expired token" };
                    }
                    const password_hash = await Bun.password.hash(password);
                    user.password_hash = password_hash;
                    user.resetTokens = user.resetTokens.filter(
                        (t: any) => t.hash !== createHash("sha256").update(token).digest("hex")
                    );
                    await identityService.updateUser(user.did, { password_hash });
                    return { success: true };
                },
                {
                    body: t.Object({
                        token: t.String(),
                        password: t.String(),
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
            // .onAfterHandle(({ request, set }) => {
            //     // onAfterHandle needed to get rid off CORS errors in /users/me endpoint
            //     if (request.method === "OPTIONS") return; // Let CORS plugin handle preflight fully to avoid duplication

            //     const origin = request.headers.get("origin") ?? "";
            //     console.log(`[onAfterHandle] Processing response | URL: ${request.url} | Method: ${request.method} | Origin: ${origin}`);

            //     if (!origin || allowedOrigins.includes(origin)) {
            //         // Set headers without duplication (these will override if already set)
            //         set.headers["Access-Control-Allow-Origin"] = origin;
            //         set.headers["Access-Control-Allow-Credentials"] = "true";
            //         set.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
            //         set.headers["Access-Control-Allow-Headers"] = "*"; // Wildcard to simplify; or request.headers.get("Access-Control-Request-Headers") ?? "*"
            //         set.headers["Access-Control-Max-Age"] = "86400";
            //         set.headers["Access-Control-Expose-Headers"] = "Content-Disposition";
            //         set.headers["Vary"] = "Origin";
            //         console.log("[onAfterHandle] CORS headers added successfully");
            //     } else {
            //         console.log(`[onAfterHandle] Origin not allowed: ${origin}`);
            //     }
            // })
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
                const user: User & { coverUrl?: string } = {
                    did: userDoc.did,
                    instanceId: userDoc.instanceId,
                    displayName: userDoc.displayName,
                    pictureUrl: userDoc.pictureUrl || userDoc.profilePictureUrl,
                    coverUrl: (userDoc as any).coverUrl,
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
                    // Persist identity fields (supports displayName, pictureUrl, coverUrl)
                    const user = await identityService.updateUser(profile.sub, body);

                    // Upsert canonical profile document
                    await dataService.update(
                        "profiles",
                        {
                            _id: "profiles/me",
                            name: body.displayName,
                            pictureUrl: body.pictureUrl,
                            coverUrl: body.coverUrl,
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
                        coverUrl: t.Optional(t.String()),
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
                const verified = await jwt.verify(token);
                const profile = verified as unknown as JwtPayload | null;
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
            // Upload (server-upload) + immediate file doc creation
            .post(
                "/upload",
                async ({ profile, body, set, storageService, dataService }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }

                    const file = (body as any)?.file as File | undefined;
                    if (!file || typeof (file as any).arrayBuffer !== "function") {
                        set.status = 422;
                        return { error: "Invalid multipart form-data: missing 'file' field" };
                    }

                    // Quota reservation tracking for outer try/catch
                    let uploadId: string | undefined;

                    try {
                        const buffer = Buffer.from(await file.arrayBuffer());
                        const bucketName = STORAGE_BUCKET;

                        // Optional client-provided key; else yyyy/mm/uuid.ext
                        const providedStorageKey = (body as any).storageKey as string | undefined;
                        let storageKey = providedStorageKey;
                        if (!storageKey) {
                            const fname = (body as any).name ?? (file as any).name ?? "file";
                            const ext = typeof fname === "string" && fname.includes(".") ? fname.split(".").pop() : "";
                            const uuid = crypto.randomUUID();
                            const now = new Date();
                            const yyyy = now.getUTCFullYear();
                            const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
                            storageKey = `u/${profile.instanceId}/${yyyy}/${mm}/${uuid}${ext ? "." + ext : ""}`;
                        } else if (!storageKey.startsWith(`u/${profile.instanceId}/`)) {
                            set.status = 400;
                            return { error: "invalid_storageKey_prefix" };
                        }
                        // Quota: reserve before upload
                        try {
                            const reserve = await quotaService.reserve(
                                profile.sub,
                                profile.instanceId,
                                Number((file as any).size) || 0,
                                storageKey
                            );
                            uploadId = reserve.uploadId;
                        } catch (e: any) {
                            set.status = 413;
                            return { error: "quota_exceeded", details: e?.meta };
                        }

                        console.debug("[/storage/upload] start", {
                            instanceId: profile.instanceId,
                            bucketName,
                            providedStorageKey,
                            finalStorageKey: storageKey,
                            mime: (file as any).type,
                            size: (file as any).size,
                        });

                        await storageService.upload(
                            bucketName,
                            storageKey,
                            buffer,
                            (file as any).type || "application/octet-stream"
                        );

                        // Sanitize and persist metadata immediately (server-upload strategy)
                        const { sanitizeText, sanitizeTags, validateAclShape, coercePositiveNumber } = await import(
                            "./services/storage"
                        );
                        const nameFromClient = (body as any).name ?? (file as any).name ?? "file";
                        const cleanName =
                            sanitizeText(
                                typeof nameFromClient === "string" ? nameFromClient : String(nameFromClient),
                                256
                            ) || "file";
                        const cleanDesc = sanitizeText((body as any).description, 1024);

                        // tags: allow "a,b" or JSON '["a","b"]' or array of strings
                        let tagsRaw = (body as any).tags as any;
                        if (typeof tagsRaw === "string") {
                            try {
                                const parsed = JSON.parse(tagsRaw);
                                tagsRaw = parsed;
                            } catch {
                                tagsRaw = tagsRaw
                                    .split(",")
                                    .map((s: string) => s.trim())
                                    .filter(Boolean);
                            }
                        }
                        const cleanTags = sanitizeTags(Array.isArray(tagsRaw) ? tagsRaw : undefined, 64, 64);

                        // acl: allow JSON string or object
                        let aclRaw = (body as any).acl as any;
                        if (typeof aclRaw === "string") {
                            try {
                                aclRaw = JSON.parse(aclRaw);
                            } catch {
                                aclRaw = undefined;
                            }
                        }
                        const cleanAcl = validateAclShape(aclRaw);

                        const stat = await storageService.statObject(bucketName, storageKey);
                        const finalSize = stat?.size ?? coercePositiveNumber(Number((file as any).size));
                        const finalMime = stat?.contentType ?? ((file as any).type || undefined);
                        if (uploadId) {
                            try {
                                await quotaService.commit(profile.sub, uploadId, Number(finalSize) || 0);
                            } catch {}
                        }

                        // Idempotency: if a files doc already exists for this storageKey, return it instead of creating a new one
                        const existing = await dataService.readOnce(
                            "files",
                            { storageKey, limit: 1 },
                            profile as JwtPayload
                        );
                        if (existing && Array.isArray((existing as any).docs) && (existing as any).docs.length > 0) {
                            const doc = (existing as any).docs[0];
                            const url = await storageService.getPublicURL(bucketName, storageKey);
                            console.debug("[/storage/upload] done (idempotent hit)", {
                                bucketName,
                                storageKey,
                                url,
                                fileId: doc._id || doc.id,
                            });
                            return {
                                url,
                                storageKey,
                                file: {
                                    id: doc._id || doc.id,
                                    name: doc.name ?? cleanName,
                                    storageKey,
                                    mimeType: doc.mimeType ?? finalMime,
                                    size: doc.size ?? finalSize,
                                },
                            };
                        }

                        // Build enriched metadata similar to legacy client shape
                        const nowIso = new Date().toISOString();
                        const ext =
                            typeof cleanName === "string" && cleanName.includes(".")
                                ? cleanName.split(".").pop()
                                : undefined;
                        const category = (finalMime || "").startsWith("image/")
                            ? "image"
                            : (finalMime || "").startsWith("video/")
                            ? "video"
                            : (finalMime || "").startsWith("audio/")
                            ? "audio"
                            : (finalMime || "").includes("pdf") ||
                              (finalMime || "").includes("word") ||
                              (finalMime || "").includes("excel") ||
                              (finalMime || "").includes("text")
                            ? "doc"
                            : "other";

                        const writeRes = await dataService.write(
                            "files",
                            {
                                name: cleanName,
                                storageKey,
                                mimeType: finalMime,
                                size: finalSize,
                                description: cleanDesc,
                                tags: cleanTags ?? [],
                                acl: cleanAcl,
                                // namespace and classification
                                type: "files",
                                category,
                                // legacy/compat fields
                                ext,
                                mime: finalMime,
                                collections: [],
                                createdAt: nowIso,
                                updatedAt: nowIso,
                            },
                            profile as JwtPayload
                        );
                        const newId =
                            Array.isArray(writeRes) && writeRes.length > 0
                                ? (writeRes[0] as any).id || (writeRes[0] as any)._id || (writeRes[0] as any).docId
                                : undefined;

                        const url = await storageService.getPublicURL(bucketName, storageKey);

                        console.debug("[/storage/upload] done", { bucketName, storageKey, url, fileId: newId });

                        return {
                            url,
                            storageKey,
                            file: {
                                id: newId,
                                name: cleanName,
                                storageKey,
                                mimeType: finalMime,
                                size: finalSize,
                            },
                        };
                    } catch (error: any) {
                        try {
                            if (typeof uploadId === "string" && uploadId) {
                                await quotaService.release(profile.sub, uploadId);
                            }
                        } catch {}
                        console.error("[/storage/upload] Error uploading file:", error);
                        set.status = 500;
                        return { error: "Failed to upload file" };
                    }
                },
                {
                    // Accept multipart form-data with proper types to avoid validator-caused 422 without CORS headers
                    body: t.Object({
                        file: t.File(),
                        storageKey: t.Optional(t.String()),
                        name: t.Optional(t.String()),
                        mime: t.Optional(t.String()),
                        size: t.Optional(t.Union([t.Number(), t.String()])),
                        acl: t.Optional(t.String()),
                        description: t.Optional(t.String()),
                        tags: t.Optional(t.Union([t.Array(t.String()), t.String()])),
                    }),
                }
            )
            // Presign PUT: include metadata echo to be sent back on /commit
            .post(
                "/presign-put",
                async ({ profile, body, set, storageService }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const { name, mime, size, acl, description, tags } = body as {
                        name: string;
                        mime?: string;
                        size?: number;
                        acl?: any;
                        description?: string;
                        tags?: string[];
                    };
                    if (!name) {
                        set.status = 400;
                        return { error: "Missing name" };
                    }
                    const ext = name.includes(".") ? name.split(".").pop() : "";
                    const uuid = crypto.randomUUID();
                    const now = new Date();
                    const yyyy = now.getUTCFullYear();
                    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
                    const storageKey = `u/${profile.instanceId}/${yyyy}/${mm}/${uuid}${ext ? "." + ext : ""}`;
                    const bucket = STORAGE_BUCKET;

                    try {
                        if (typeof size !== "number" || size <= 0) {
                            set.status = 400;
                            return { error: "Missing or invalid size" };
                        }
                        // Quota reserve
                        let uploadId: string | undefined;
                        try {
                            const reserve = await quotaService.reserve(
                                profile.sub,
                                profile.instanceId,
                                size,
                                storageKey
                            );
                            uploadId = reserve.uploadId;
                        } catch (e: any) {
                            set.status = 413;
                            return { error: "quota_exceeded", details: e?.meta };
                        }

                        const res = await storageService.presignPut(bucket, storageKey, mime, 300);
                        if (res.strategy === "presigned") {
                            return {
                                strategy: "presigned",
                                bucket: res.bucket,
                                storageKey: res.key,
                                url: res.url,
                                headers: res.headers,
                                expiresIn: 300,
                                uploadId,
                                metadata: { name, mime, size, acl, description, tags },
                            };
                        }
                        // Fallback for providers without presign support (e.g., MinIO)
                        return {
                            strategy: "server-upload",
                            bucket,
                            storageKey,
                            uploadPath: "/storage/upload",
                            uploadId,
                            metadata: { name, mime, size, acl, description, tags },
                        };
                    } catch (e: any) {
                        console.error("presign-put error:", e);
                        set.status = 500;
                        return { error: "Failed to presign upload" };
                    }
                },
                {
                    body: t.Object({
                        name: t.String(),
                        mime: t.Optional(t.String()),
                        size: t.Optional(t.Number()),
                        sha256: t.Optional(t.String()),
                        acl: t.Optional(t.Any()),
                        description: t.Optional(t.String()),
                        tags: t.Optional(t.Array(t.String())),
                    }),
                }
            )
            // Presign GET unchanged (kept above)
            .post(
                "/presign-get",
                async ({ profile, body, set, storageService, request, dataService }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const { storageKey, expires, appId, origin } = body as any;
                    if (!storageKey) {
                        set.status = 400;
                        return { error: "Missing storageKey" };
                    }
                    if (!isKeyInInstance(storageKey, (profile as any).instanceId)) {
                        set.status = 403;
                        return { error: "forbidden_storageKey" };
                    }

                    const bucket = STORAGE_BUCKET;

                    const urlObj = new URL(request.url);
                    const debug = urlObj.searchParams.get("debug") === "1";

                    try {
                        // Load file doc for ACL checks
                        const existing = await dataService.readOnce(
                            "files",
                            { storageKey, limit: 1 },
                            profile as JwtPayload
                        );
                        const doc = (existing as any)?.docs?.[0];
                        if (!doc) {
                            set.status = 404;
                            return debug
                                ? { error: "NoSuchKey", storageKey, bucket }
                                : { error: "NoSuchKey", storageKey };
                        }

                        // TTL policy
                        const requested = Number(expires ?? PRESIGN_DEFAULT_TTL_SECONDS);
                        const clamped = Math.min(
                            Math.max(isFinite(requested) ? requested : PRESIGN_DEFAULT_TTL_SECONDS, 60),
                            PRESIGN_MAX_TTL_SECONDS
                        );
                        let ttl = clamped;
                        const isOwner =
                            (doc?.ownerDid || doc?.did) && (doc.ownerDid || doc.did) === (profile as any).sub;
                        if (isOwner && !PRESIGN_FORCE_TTL_FOR_OWNER) {
                            ttl = Math.min(PRESIGN_OWNER_TTL_SECONDS, PRESIGN_MAX_TTL_SECONDS);
                        }

                        // ACL evaluation
                        const allowed = await allowRead(profile as any, doc, {
                            appIdOrOrigin: (appId as string) || (origin as string),
                            services: { identityService, dataService },
                        });
                        if (!allowed) {
                            set.status = 403;
                            return { error: "forbidden" };
                        }

                        // Try provider presign
                        const res = await storageService.presignGet(bucket, storageKey, ttl);

                        // Prepare an optional public URL for debug/compat
                        let publicURL: string | undefined;
                        try {
                            publicURL = await storageService.getPublicURL(bucket, storageKey);
                        } catch {}

                        if (res.strategy === "presigned" && res.url) {
                            if (debug) {
                                return {
                                    strategy: "debug",
                                    bucket,
                                    storageKey,
                                    presignedURL: res.url,
                                    publicURL,
                                    expiresIn: ttl,
                                };
                            }
                            return { url: res.url, expiresIn: ttl };
                        }

                        // Fallback: if public URL might work (public visibility), expose it in debug or as a last resort
                        if (debug) {
                            return {
                                strategy: "debug",
                                bucket,
                                storageKey,
                                presignedURL: undefined,
                                publicURL,
                                expiresIn: ttl,
                            };
                        }
                        // No direct URL available
                        return { error: "no_presigned_url_available" };
                    } catch (e: any) {
                        console.error("[/storage/presign-get] error:", e);
                        set.status = 500;
                        return { error: "Failed to presign download" };
                    }
                },
                {
                    body: t.Object({
                        storageKey: t.String(),
                        expires: t.Optional(t.Number()),
                        appId: t.Optional(t.String()),
                        origin: t.Optional(t.String()),
                    }),
                }
            )
            // Commit endpoint: create files doc after presigned PUT with server-side override of size/mime and sanitization
            .post(
                "/commit",
                async ({ profile, body, set, dataService, storageService }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const { storageKey, name, mime, size, acl, description, tags } = body as any;
                    if (!storageKey || !name) {
                        set.status = 400;
                        return { error: "Missing storageKey or name" };
                    }
                    const bucket = STORAGE_BUCKET;
                    try {
                        // Verify object exists and stat it to override size/mime
                        const stat = await storageService.statObject(bucket, storageKey);
                        if (!stat) {
                            set.status = 404;
                            return { error: "Object not found for storageKey" };
                        }

                        // Sanitize user-intent fields
                        const { sanitizeText, sanitizeTags, validateAclShape, coercePositiveNumber } = await import(
                            "./services/storage"
                        );
                        const cleanName = sanitizeText(name, 256) || name.slice(0, 256);
                        const cleanDesc = sanitizeText(description, 1024);
                        const cleanTags = sanitizeTags(tags, 64, 64);
                        const cleanAcl = validateAclShape(acl); // undefined => private by default

                        // Override suspicious fields with provider stat when available
                        const finalSize = stat.size ?? coercePositiveNumber(size);
                        const finalMime = stat.contentType ?? (typeof mime === "string" ? mime : undefined);
                        const uploadId = (body as any).uploadId as string | undefined;
                        if (uploadId) {
                            try {
                                await quotaService.commit(profile.sub, uploadId, Number(finalSize) || 0);
                            } catch {}
                        }

                        // Idempotency: if a files doc already exists for this storageKey, return it instead of creating a new one
                        const existing = await dataService.readOnce(
                            "files",
                            { storageKey, limit: 1 },
                            profile as JwtPayload
                        );
                        if (existing && Array.isArray((existing as any).docs) && (existing as any).docs.length > 0) {
                            const doc = (existing as any).docs[0];
                            return {
                                storageKey,
                                file: {
                                    id: doc._id || doc.id,
                                    name: doc.name ?? cleanName,
                                    storageKey,
                                    mimeType: doc.mimeType ?? finalMime,
                                    size: doc.size ?? finalSize,
                                },
                            };
                        }

                        // Persist metadata document with enriched fields (compat with earlier client-written docs)
                        const nowIso = new Date().toISOString();
                        const ext =
                            typeof cleanName === "string" && cleanName.includes(".")
                                ? cleanName.split(".").pop()
                                : undefined;
                        const category = (finalMime || "").startsWith("image/")
                            ? "image"
                            : (finalMime || "").startsWith("video/")
                            ? "video"
                            : (finalMime || "").startsWith("audio/")
                            ? "audio"
                            : (finalMime || "").includes("pdf") ||
                              (finalMime || "").includes("word") ||
                              (finalMime || "").includes("excel") ||
                              (finalMime || "").includes("text")
                            ? "doc"
                            : "other";

                        const writeRes = await dataService.write(
                            "files",
                            {
                                name: cleanName,
                                storageKey,
                                mimeType: finalMime,
                                size: finalSize,
                                description: cleanDesc,
                                tags: cleanTags ?? [],
                                acl: cleanAcl,
                                // namespace and classification
                                type: "files",
                                category,
                                // legacy/compat fields
                                ext,
                                mime: finalMime,
                                collections: [],
                                createdAt: nowIso,
                                updatedAt: nowIso,
                            },
                            profile as JwtPayload
                        );
                        const newId =
                            Array.isArray(writeRes) && writeRes.length > 0
                                ? (writeRes[0] as any).id || (writeRes[0] as any)._id || (writeRes[0] as any).docId
                                : undefined;

                        return {
                            storageKey,
                            file: {
                                id: newId,
                                name: cleanName,
                                storageKey,
                                mimeType: finalMime,
                                size: finalSize,
                            },
                        };
                    } catch (e: any) {
                        console.error("[/storage/commit] error:", e);
                        set.status = 500;
                        return { error: "Failed to commit file metadata" };
                    }
                },
                {
                    body: t.Object({
                        storageKey: t.String(),
                        name: t.String(),
                        mime: t.Optional(t.String()),
                        size: t.Optional(t.Number()),
                        acl: t.Optional(t.Any()),
                        description: t.Optional(t.String()),
                        tags: t.Optional(t.Array(t.String())),
                        uploadId: t.Optional(t.String()),
                    }),
                }
            )
            .get("/usage", async ({ profile, set, quotaService }) => {
                if (!profile) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }
                try {
                    const usage = await quotaService.usage(profile.sub);
                    return usage;
                } catch (e: any) {
                    set.status = 500;
                    return { error: "Failed to get usage" };
                }
            })
            .delete(
                "/object",
                async ({ profile, body, set, storageService, dataService, quotaService }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const { storageKey } = body as any;
                    if (!storageKey) {
                        set.status = 400;
                        return { error: "Missing storageKey" };
                    }
                    if (!storageKey.startsWith(`u/${profile.instanceId}/`)) {
                        set.status = 403;
                        return { error: "forbidden_storageKey" };
                    }
                    const bucket = STORAGE_BUCKET;
                    try {
                        const stat = await storageService.statObject(bucket, storageKey);
                        await storageService.delete(bucket, storageKey);
                        // Attempt to delete associated metadata doc
                        try {
                            await dataService.deleteByStorageKey(storageKey, profile as JwtPayload);
                        } catch {}
                        if (stat?.size) {
                            await quotaService.debit(profile.sub, Number(stat.size) || 0);
                        }
                        return { ok: true };
                    } catch (e: any) {
                        set.status = 500;
                        return { error: "Failed to delete object" };
                    }
                },
                {
                    body: t.Object({ storageKey: t.String() }),
                }
            )
            .post(
                "/backfill-files-type",
                async ({ profile, set, dataService, body }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    try {
                        const db = dataService.getDb(profile.instanceId);
                        const dryRun = !!(body && (body as any).dryRun);
                        const selector = { storageKey: { $exists: true }, type: { $exists: false } } as any;
                        const result = await (db as any).find({ selector, limit: 10000 });
                        const legacyDocs = (result?.docs as any[]) || [];
                        if (dryRun) {
                            return {
                                found: legacyDocs.length,
                                sampleIds: legacyDocs.slice(0, 10).map((d: any) => d._id),
                            };
                        }
                        const updatedAtIso = new Date().toISOString();
                        const updatedDocs = legacyDocs.map((d: any) => {
                            const mime = d.mimeType || d.mime;
                            let category = d.category;
                            if (!category) {
                                category = (mime || "").startsWith("image/")
                                    ? "image"
                                    : (mime || "").startsWith("video/")
                                    ? "video"
                                    : (mime || "").startsWith("audio/")
                                    ? "audio"
                                    : (mime || "").includes("pdf") ||
                                      (mime || "").includes("word") ||
                                      (mime || "").includes("excel") ||
                                      (mime || "").includes("text")
                                    ? "doc"
                                    : "other";
                            }
                            return { ...d, type: "files", category, updatedAt: updatedAtIso };
                        });
                        if (updatedDocs.length === 0) return { updated: 0 };
                        const bulkRes = await (db as any).bulk({ docs: updatedDocs });
                        const ok = bulkRes.filter((r: any) => !r.error).length;
                        const errors = bulkRes.filter((r: any) => r.error);
                        return { updated: ok, errors };
                    } catch (e: any) {
                        set.status = 500;
                        return { error: "Backfill failed", details: e?.message };
                    }
                },
                {
                    body: t.Object({
                        dryRun: t.Optional(t.Boolean()),
                    }),
                }
            )
            .get("/debug/files-scan", async ({ profile, dataService, set }) => {
                if (!profile) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }
                try {
                    const names = await dataService.getAllUserDbNames();
                    const results: any[] = [];
                    for (const dbName of names) {
                        const instanceId = dbName.replace(/^userdb-/, "");
                        try {
                            const db = dataService.getDb(instanceId);
                            // Use Mango if available, else fallback to list
                            let count = 0;
                            let sample: any[] = [];
                            try {
                                await (db as any).createIndex({
                                    index: { fields: ["type"] },
                                    name: "idx_type",
                                    type: "json",
                                });
                            } catch {}
                            try {
                                const r = await (db as any).find({ selector: { type: "files" }, limit: 10 });
                                count = (r?.docs?.length as number) || 0;
                                sample = (r?.docs || []).map((d: any) => ({
                                    _id: d._id,
                                    name: d.name,
                                    storageKey: d.storageKey,
                                }));
                                // Try to get a true total count cheaply via list (best-effort)
                                try {
                                    const full = await (db as any).find({
                                        selector: { type: "files" },
                                        limit: 1_000_000,
                                    });
                                    count = (full?.docs?.length as number) || count;
                                } catch {}
                            } catch {
                                const lst = await (db as any).list({ include_docs: true, limit: 100000 });
                                const docs = ((lst?.rows as any[]) || []).map((r) => r?.doc).filter(Boolean);
                                const files = docs.filter((d: any) => d?.type === "files");
                                count = files.length;
                                sample = files
                                    .slice(0, 10)
                                    .map((d: any) => ({ _id: d._id, name: d.name, storageKey: d.storageKey }));
                            }
                            results.push({ dbName, instanceId, filesCount: count, sample });
                        } catch (e) {
                            results.push({ dbName, instanceId, error: "scan_failed" });
                        }
                    }
                    return { results };
                } catch (e: any) {
                    set.status = 500;
                    return { error: "scan_failed", details: e?.message };
                }
            })
            .get("/debug/list-objects", async ({ profile, storageService, set }) => {
                if (!profile) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }
                try {
                    const prefix = `u/${profile.instanceId}/`;
                    const bucket = STORAGE_BUCKET;
                    const objs = await storageService.listObjects(bucket, prefix, 2000);
                    return { bucket, prefix, count: objs.length, sample: objs.slice(0, 15) };
                } catch (e: any) {
                    set.status = 500;
                    return { error: "list_failed", details: e?.message };
                }
            })
            .post(
                "/reindex-from-storage",
                async ({ profile, set, dataService, storageService, body }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    try {
                        const dryRun = !!(body && (body as any).dryRun);
                        const max = Math.min(Math.max(Number((body as any)?.max ?? 1000), 1), 5000);
                        const prefix = `u/${profile.instanceId}/`;
                        const bucket = STORAGE_BUCKET;

                        // List objects under this tenant prefix
                        const objects = await storageService.listObjects(bucket, prefix, max);

                        let created = 0;
                        const missing: string[] = [];
                        const ensured: { key: string; id?: string }[] = [];

                        for (const obj of objects) {
                            const storageKey = obj.key;
                            // Skip "directory" placeholders if any
                            if (!storageKey || storageKey.endsWith("/")) continue;

                            // Does a files doc already exist?
                            const existing = await dataService.readOnce(
                                "files",
                                { storageKey, limit: 1 },
                                profile as JwtPayload
                            );
                            const doc = (existing as any)?.docs?.[0];
                            if (doc) {
                                ensured.push({ key: storageKey, id: doc._id || doc.id });
                                continue;
                            }

                            missing.push(storageKey);
                            if (dryRun) continue;

                            // Stat to derive mime/size when possible
                            const stat = await storageService.statObject(bucket, storageKey);
                            const name = storageKey.split("/").pop() || "file";
                            const finalMime = stat?.contentType;
                            const size = stat?.size;

                            const category = (finalMime || "").startsWith("image/")
                                ? "image"
                                : (finalMime || "").startsWith("video/")
                                ? "video"
                                : (finalMime || "").startsWith("audio/")
                                ? "audio"
                                : (finalMime || "").includes("pdf") ||
                                  (finalMime || "").includes("word") ||
                                  (finalMime || "").includes("excel") ||
                                  (finalMime || "").includes("text")
                                ? "doc"
                                : "other";

                            const nowIso = new Date().toISOString();
                            const ext =
                                typeof name === "string" && name.includes(".") ? name.split(".").pop() : undefined;

                            await dataService.write(
                                "files",
                                {
                                    name,
                                    storageKey,
                                    mimeType: finalMime,
                                    size,
                                    description: undefined,
                                    tags: [],
                                    acl: undefined,
                                    type: "files",
                                    category,
                                    ext,
                                    mime: finalMime,
                                    collections: [],
                                    createdAt: nowIso,
                                    updatedAt: nowIso,
                                },
                                profile as JwtPayload
                            );
                            created++;
                        }

                        return {
                            scanned: objects.length,
                            missing: missing.length,
                            created,
                            dryRun,
                            sampleMissing: missing.slice(0, 10),
                        };
                    } catch (e: any) {
                        console.error("[/storage/reindex-from-storage] error:", e);
                        set.status = 500;
                        return { error: "Failed to reindex from storage", details: e?.message };
                    }
                },
                {
                    body: t.Object({
                        dryRun: t.Optional(t.Boolean()),
                        max: t.Optional(t.Number()),
                    }),
                }
            )
    )
    // Streaming endpoint for first-party UI with cookie or bearer auth
    .get(
        "/storage/stream",
        async ({ request, headers, cookie, jwt, sessionJwt, identityService, storageService, dataService, set }) => {
            try {
                const url = new URL(request.url);
                const storageKey = url.searchParams.get("key") || url.searchParams.get("storageKey");
                const tokenFromQuery = url.searchParams.get("token");
                if (!storageKey) {
                    set.status = 400;
                    return { error: "Missing storageKey" };
                }

                // Resolve profile from Bearer, query param, or cookie session
                let profile: { sub: string; instanceId: string } | null = null;

                const auth = headers.authorization;
                const bearerToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
                const tokenToVerify = bearerToken || tokenFromQuery;

                if (tokenToVerify) {
                    try {
                        const verified = await jwt.verify(tokenToVerify);
                        if (verified && (verified as any).sub && (verified as any).instanceId) {
                            profile = { sub: (verified as any).sub, instanceId: (verified as any).instanceId };
                        }
                    } catch {}
                }

                if (!profile) {
                    const sessionToken = cookie.vibe_session.value;
                    if (sessionToken) {
                        try {
                            const session = await sessionJwt.verify(sessionToken);
                            if (session && (session as any).sessionId) {
                                const user = await identityService.findByDid((session as any).sessionId);
                                if (user) {
                                    profile = { sub: user.did, instanceId: user.instanceId };
                                }
                            }
                        } catch {}
                    }
                }

                if (!profile) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }

                if (!isKeyInInstance(storageKey, profile.instanceId)) {
                    set.status = 403;
                    return { error: "forbidden_storageKey" };
                }

                const bucket = STORAGE_BUCKET;

                // Load doc and check ACL
                const existing = await dataService.readOnce("files", { storageKey, limit: 1 }, profile as any);
                const doc = (existing as any)?.docs?.[0];
                if (!doc) {
                    set.status = 404;
                    return { error: "NoSuchKey", storageKey };
                }

                const allowed = await allowRead(profile as any, doc, { services: { identityService, dataService } });
                if (!allowed) {
                    set.status = 403;
                    return { error: "forbidden" };
                }

                // Fetch metadata and stream
                const stat = await storageService.statObject(bucket, storageKey);
                const dl = await storageService.download(bucket, storageKey);

                // Build headers
                const headersOut: Record<string, string> = {};
                if (dl.contentType || stat?.contentType)
                    headersOut["Content-Type"] = dl.contentType || stat?.contentType || "application/octet-stream";
                if (dl.contentLength || stat?.size)
                    headersOut["Content-Length"] = String(dl.contentLength || stat?.size || "");
                headersOut["Accept-Ranges"] = "bytes";

                const isPublic = doc?.acl && typeof doc.acl === "object" && (doc.acl as any).visibility === "public";
                if (isPublic) {
                    headersOut["Cache-Control"] = `public, max-age=${STREAM_PUBLIC_MAX_AGE_SECONDS}`;
                } else {
                    headersOut["Cache-Control"] = `private, max-age=${STREAM_PRIVATE_MAX_AGE_SECONDS}, must-revalidate`;
                }

                return new Response(dl.stream as any, { headers: headersOut });
            } catch (e) {
                console.error("[/storage/stream] error:", e);
                set.status = 500;
                return { error: "Failed to stream object" };
            }
        }
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
            .get(
                "/types",
                async ({ profile, set, query, dataService }) => {
                    if (!profile) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const limit = Math.min(Math.max(Number(query.limit) || 2000, 1), 20000);
                    try {
                        const types = await dataService.listTypes(profile.instanceId, limit);
                        return { types };
                    } catch (e: any) {
                        set.status = 500;
                        return { error: "Failed to list types" };
                    }
                },
                { query: t.Object({ limit: t.Optional(t.String()) }) }
            )
            .post(
                "/types/:type",
                async ({ profile, params, body, set, dataService, request, headers }) => {
                    try {
                        // Extract app origin for scope checking
                        const origin = headers
                            ? headers.origin || headers.referer?.split("/").slice(0, 3).join("/")
                            : "";
                        const result = await dataService.write(params.type, body, profile as JwtPayload, origin);
                        return { success: true, ...result };
                    } catch (error: any) {
                        set.status = 500;
                        return { error: error.message };
                    }
                },
                {
                    params: t.Object({ type: t.String() }),
                    beforeHandle: ({ profile, set }) => {
                        if (!profile) {
                            set.status = 401;
                            return { error: "Unauthorized" };
                        }
                    },
                }
            )
            .post(
                "/types/:type/query",
                async ({ profile, params, body, set, query, dataService, request, headers }) => {
                    try {
                        const fullQuery = {
                            ...(body as any),
                            expand: query.expand ? query.expand.split(",") : undefined,
                            global: query.global === "true",
                        };
                        // Extract app origin for scope checking
                        const origin = headers
                            ? headers.origin || headers.referer?.split("/").slice(0, 3).join("/")
                            : "";
                        const result = await dataService.readOnce(
                            params.type,
                            fullQuery,
                            profile as JwtPayload,
                            origin
                        );
                        return result;
                    } catch (error: any) {
                        set.status = 500;
                        return { error: error.message };
                    }
                },
                {
                    params: t.Object({ type: t.String() }),
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
            .ws("/types/:type", {
                async open(ws) {
                    console.log("WebSocket connection opened (types)");
                },
                async message(ws, message: { action: string; token?: string; query?: any }) {
                    const { type } = ws.data.params;

                    if (message.action === "auth") {
                        try {
                            const profile = await ws.data.jwt.verify(message.token);
                            if (!profile) {
                                ws.close(4001, "Unauthorized");
                                return;
                            }
                            (ws.data as any).profile = profile;
                            console.log(`WebSocket authenticated for type: ${type} by user ${profile.sub}`);

                            const processAndSend = async () => {
                                const result = await dataService.readOnce(
                                    type,
                                    message.query || {},
                                    profile as JwtPayload
                                );
                                ws.send(result);
                            };

                            await processAndSend();

                            const db = dataService.getDb(profile.instanceId);
                            const changes = db.changesReader.start({ since: "now", includeDocs: true });
                            (ws.data as any).changes = changes;

                            changes.on("change", async (change) => {
                                const matches = change.doc && (change.doc as any).type === type;
                                if (matches) {
                                    await processAndSend();
                                }
                            });
                        } catch (e) {
                            ws.send({ action: "error", message: "Token expired" });
                        }
                    }
                },
                close(ws) {
                    const { type } = ws.data.params;
                    const { profile, changes } = ws.data as any;

                    if (changes) {
                        changes.stop();
                    }

                    if (profile) {
                        console.log(`WebSocket closed for type: ${type} by user ${profile.sub}`);
                    } else {
                        console.log(`WebSocket closed for type: ${type}`);
                    }
                },
            })
            .ws("/global", {
                async open(ws) {
                    console.log("Global WebSocket connection opened");
                    (ws.data as any).id = Math.random().toString(36).substring(2);
                },
                async message(ws, message: { action: string; token?: string; query?: any }) {
                    if (message.action === "auth") {
                        const { globalFeedService } = ws.data;
                        const { id } = ws.data as any;

                        const profile = await ws.data.jwt.verify(message.token);
                        if (!profile) {
                            ws.close(4001, "Unauthorized");
                            return;
                        }

                        const { type } = message.query as any;
                        if (!type || typeof type !== "string") {
                            ws.send({ action: "error", message: "Missing 'type' in query. Use /data/types/:type" });
                            ws.close(4002, "Missing type");
                            return;
                        }

                        (ws.data as any).profile = profile;
                        (ws.data as any).type = type;

                        console.log(`Global WebSocket authenticated for type: ${type} by user ${profile.sub}`);

                        // Subscribe this websocket to the type feed
                        globalFeedService.subscribe(type, id, (docRef) => {
                            ws.send({ action: "update", data: docRef });
                        });

                        // Send initial data
                        const result = await dataService.readOnce(
                            type,
                            { ...message.query, global: true },
                            profile as JwtPayload
                        );
                        ws.send(result);
                    }
                },
                close(ws) {
                    const { profile, type, id } = ws.data as any;
                    const { globalFeedService } = ws.data;

                    if (type) {
                        globalFeedService.unsubscribe(type, id);
                    }

                    if (profile) {
                        console.log(`Global WebSocket closed for type: ${type} by user ${profile.sub}`);
                    } else {
                        console.log(`Global WebSocket closed for type: ${type}`);
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
                        // Use DataService.readOnce to ensure an authenticated Couch session and proper access handling
                        const result = await dataService.readOnce("profiles", { _id: ref, limit: 1 }, {
                            sub: user.did,
                            instanceId: user.instanceId,
                        } as JwtPayload);
                        let doc = Array.isArray(result?.docs) ? result.docs[0] : null;
                        // Fallback: Some environments may not store the profile at "profiles/me".
                        // Try to find any profiles doc for this DID.
                        if (!doc) {
                            const byDid = await dataService.readOnce("profiles", { did: user.did, limit: 1 }, {
                                sub: user.did,
                                instanceId: user.instanceId,
                            } as JwtPayload);
                            doc = Array.isArray(byDid?.docs) ? byDid.docs[0] : null;
                        }
                        if (!doc) {
                            set.status = 404;
                            return { error: "Document not found" };
                        }
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
                        const certificate = await certsService.issue(body as Certificate, profile as JwtPayload);
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
            .post(
                "/issue-auto",
                async ({ profile, body, set, certsService }) => {
                    try {
                        const certificate = await certsService.issueAuto(
                            profile as JwtPayload,
                            body.subject,
                            body.certType,
                            body.expires
                        );
                        return { success: true, certificate };
                    } catch (error: any) {
                        set.status = 500;
                        return { error: error.message };
                    }
                },
                {
                    body: t.Object({
                        subject: t.String(),
                        certType: t.Object({
                            did: t.String(),
                            ref: t.String(),
                        }),
                        expires: t.Optional(t.String()),
                    }),
                }
            )
            .post(
                "/types/create",
                async ({ profile, body, set, certsService }) => {
                    try {
                        const certType = await certsService.createCertType(
                            profile as JwtPayload,
                            body.name,
                            body.label,
                            body.description,
                            body.template
                        );
                        return { success: true, certType };
                    } catch (error: any) {
                        set.status = 500;
                        return { error: error.message };
                    }
                },
                {
                    body: t.Object({
                        name: t.String(),
                        label: t.String(),
                        description: t.String(),
                        template: t.Optional(t.Any()),
                    }),
                }
            )
    )
    .group("/hub", (app) =>
        app
            .derive(async ({ cookie, sessionJwt, identityService }) => {
                const sessionToken = cookie.vibe_session.value;
                if (!sessionToken) return { session: null, user: null };
                try {
                    const session = await sessionJwt.verify(sessionToken);
                    if (!session || !session.sessionId) return { session: null, user: null };
                    const user = await identityService.findByDid(session.sessionId);
                    return { session, user };
                } catch (e) {
                    return { session: null, user: null };
                }
            })
            .get(
                "/permissions",
                async ({ query, user, identityService }) => {
                    const { origin } = query;
                    if (!user) {
                        return { scopes: [] }; // No session, no permissions
                    }

                    // Auto-consent for vibe-cloud-ui (main UI app)
                    const vibeCloudUiUrl = process.env.VIBE_CLOUD_UI_URL || "http://localhost:4000";
                    if (origin === vibeCloudUiUrl || origin === "http://localhost:3000") {
                        return { scopes: ["read:*", "write:*", "upload:files", "read:global"] };
                    }

                    const consents = await identityService.listUserConsents(user.did);
                    const consent = consents.find((c) => c.origin === origin || c.clientId === origin);

                    if (consent && consent.scopes) {
                        return { scopes: consent.scopes };
                    }

                    return { scopes: [] };
                },
                {
                    query: t.Object({
                        origin: t.String(),
                    }),
                }
            )
            .guard({
                beforeHandle: ({ user, set }) => {
                    if (!user) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                },
            })
            .get("/session", async ({ user, identityService }) => {
                const dbCreds = await identityService.createDbSession(user!);
                return {
                    ...dbCreds,
                    dbName: getUserDbName(user!.instanceId),
                };
            })
            .get("/api-token", async ({ user, jwt }) => {
                const accessToken = await jwt.sign({
                    sub: user!.did,
                    instanceId: user!.instanceId,
                });
                return { token: accessToken };
            })
    )
    .listen(process.env.PORT || 5050);

export type App = typeof app;

console.log(
    `Vibe Cloud API (${process.env.APP_VERSION}) is running at http://${app.server?.hostname}:${app.server?.port}`
);
