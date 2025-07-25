// Force type regeneration
import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { cors } from "@elysiajs/cors";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { IdentityService } from "./services/identity";
import { DataService, JwtPayload } from "./services/data";
import { CertsService } from "./services/certs";
import { StorageService, MinioStorageProvider, ScalewayStorageProvider, StorageProvider } from "./services/storage";
import { getUserDbName } from "./lib/db";
import { User } from "vibe-core";
import nano from "nano";
import { proxyRequest } from "./lib/proxy";

const startServer = async () => {
    let storageProvider: StorageProvider;
    if (process.env.STORAGE_PROVIDER === "minio") {
        storageProvider = new MinioStorageProvider({
            endPoint: process.env.MINIO_ENDPOINT!,
            port: parseInt(process.env.MINIO_PORT!),
            useSSL: process.env.MINIO_USE_SSL === "true",
            accessKey: process.env.MINIO_ACCESS_KEY!,
            secretKey: process.env.MINIO_SECRET_KEY!,
        });
    } else {
        storageProvider = new ScalewayStorageProvider({
            region: process.env.SCALEWAY_REGION!,
            endpoint: process.env.SCALEWAY_ENDPOINT!,
            credentials: {
                accessKeyId: process.env.SCALEWAY_ACCESS_KEY!,
                secretAccessKey: process.env.SCALEWAY_SECRET_KEY!,
            },
        });
    }

    const storageService = new StorageService(storageProvider);

    const identityService = new IdentityService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
        instanceIdSecret: process.env.INSTANCE_ID_SECRET!,
    });

    const couch = nano(process.env.COUCHDB_URL!);

    const dataService = new DataService(
        {
            url: process.env.COUCHDB_URL!,
            user: process.env.COUCHDB_USER!,
            pass: process.env.COUCHDB_PASSWORD!,
        },
        identityService
    );

    try {
        await identityService.onApplicationBootstrap(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
        await dataService.init();
        await couch.auth(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1); // Exit if cannot connect to DB
    }

    const certsService = new CertsService(identityService, dataService);

    const app = new Elysia()
        .use(
            cors({
                origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : ["http://localhost:3000", "http://localhost:3001"],
                credentials: true,
            })
        )
        .use(cookie())
        .use(html())
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
        .get("/health", () => ({
            status: identityService.isConnected ? "ok" : "error",
            service: "vibe-cloud-api",
            version: process.env.APP_VERSION || "unknown",
            details: identityService.isConnected ? "All systems operational" : "Database connection failed",
        }))
        .decorate("identityService", identityService)
        .decorate("storageService", storageService)
        .group("/auth", (app) =>
            app
                .derive(({ request }) => {
                    return { url: new URL(request.url) };
                })
                .get("/authorize", ({ request }) => {
                    return proxyRequest(request);
                })
                .get("/login", ({ request }) => {
                    return proxyRequest(request);
                })
                .get("/signup", ({ request }) => {
                    return proxyRequest(request);
                })
                .get("/consent", ({ request }) => {
                    return proxyRequest(request);
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
                            displayName: t.Optional(t.String()),
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
                                sameSite: "lax",
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
                .get(
                    "/logout",
                    ({ cookie, set, query }) => {
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
                .get("/api-token", async ({ sessionJwt, cookie, jwt, set, identityService }) => {
                    const sessionToken = cookie.vibe_session.value;
                    if (!sessionToken) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const session = await sessionJwt.verify(sessionToken);
                    if (!session || !session.sessionId) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const user = await identityService.findByDid(session.sessionId);
                    if (!user) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const accessToken = await jwt.sign({
                        sub: user.did,
                        instanceId: user.instanceId,
                    });
                    return { token: accessToken };
                })
                .get("/session", async ({ sessionJwt, cookie, set, identityService }) => {
                    const sessionToken = cookie.vibe_session.value;
                    if (!sessionToken) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const session = await sessionJwt.verify(sessionToken);
                    if (!session || !session.sessionId) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }
                    const user = await identityService.findByDid(session.sessionId);
                    if (!user) {
                        set.status = 401;
                        return { error: "Unauthorized" };
                    }

                    const dbCreds = await identityService.createDbSession(user);

                    return {
                        ...dbCreds,
                        dbName: getUserDbName(user.instanceId),
                    };
                })
                .get(
                    "/permissions",
                    async ({ query, cookie, sessionJwt, set, identityService }) => {
                        const { origin } = query;
                        const sessionToken = cookie.vibe_session.value;
                        if (!sessionToken) {
                            return { scopes: [] }; // No session, no permissions
                        }
                        const session = await sessionJwt.verify(sessionToken);
                        if (!session || !session.sessionId) {
                            return { scopes: [] };
                        }
                        const user = await identityService.findByDid(session.sessionId);
                        if (!user) {
                            return { scopes: [] };
                        }

                        const hasConsented = await identityService.hasUserConsented(user.did, origin);
                        if (hasConsented) {
                            // For now, grant full read/write access if consented.
                            // This will be replaced with a more granular permission system.
                            return { scopes: ["read", "write"] };
                        }

                        return { scopes: [] };
                    },
                    {
                        query: t.Object({
                            origin: t.String(),
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
                            await identityService.revokeConsent(userDid, client_id);
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
                        await identityService.storeUserConsent(userDid, client_id);

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
                    async ({ query, cookie, sessionJwt, html }) => {
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
        )
        .group("/user", (app) =>
            app
                .derive(async ({ cookie, sessionJwt }) => {
                    const sessionToken = cookie.vibe_session.value;
                    if (!sessionToken) return { session: null };
                    const session = await sessionJwt.verify(sessionToken);
                    return { session };
                })
                .guard({
                    beforeHandle: ({ session, set }) => {
                        if (!session) {
                            set.status = 401;
                            return { error: "Unauthorized" };
                        }
                    },
                })
                .get(
                    "/profile",
                    async ({ session, html, identityService, set, query }) => {
                        if (!session) {
                            set.status = 401;
                            return "Unauthorized";
                        }
                        const user = await identityService.findByDid(session.sessionId);
                        const isSignup = query.is_signup === "true";

                        const style = `
                        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; }
                        .container { background-color: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; }
                        img { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 1rem; }
                        input[type="file"] { display: none; }
                        label { cursor: pointer; }
                        button {
                            margin-top: 1rem;
                            padding: 0.75rem;
                            border: none;
                            border-radius: 4px;
                            background-color: #1a73e8;
                            color: white;
                            font-size: 1rem;
                            cursor: pointer;
                            width: 100%;
                        }
                        .skip { font-size: 0.8rem; margin-top: 1rem; }
                    `;

                        return html(`
                        <style>${style}</style>
                        <div class="container">
                            <h1>${isSignup ? "Complete Your Profile" : "Profile Settings"}</h1>
                            <img id="profile-pic" src="${user?.pictureUrl || "https://placehold.co/100x100"}" alt="Profile Picture">
                            <form id="profile-form">
                                <label for="file-upload">${isSignup ? "Upload Picture" : "Change Picture"}</label>
                                <input id="file-upload" type="file" accept="image/*">
                                <input type="text" id="display-name" value="${user?.displayName || ""}" placeholder="Display Name">
                                <button type="submit">${isSignup ? "Continue" : "Save"}</button>
                            </form>
                            ${isSignup ? `<a href="#" id="skip-link" class="skip">Skip for now</a>` : ""}
                        </div>
                        <script>
                            const form = document.getElementById('profile-form');
                            const fileUpload = document.getElementById('file-upload');
                            const profilePic = document.getElementById('profile-pic');
                            const skipLink = document.getElementById('skip-link');
                            let pictureUrl = "${user?.pictureUrl || ""}";
                            const redirectUri = new URLSearchParams(window.location.search).get('redirect_uri');

                            fileUpload.addEventListener('change', async (event) => {
                                const file = event.target.files[0];
                                if (!file) return;

                                const formData = new FormData();
                                formData.append('file', file);

                                const token = await getAccessToken();
                                if (!token) return; // Handle error

                                const response = await fetch('/storage/upload', {
                                    method: 'POST',
                                    body: formData,
                                    headers: { 'Authorization': 'Bearer ' + token }
                                });

                                const data = await response.json();
                                if (data.url) {
                                    pictureUrl = data.url;
                                    profilePic.src = data.url;
                                }
                            });

                            form.addEventListener('submit', async (event) => {
                                event.preventDefault();
                                const displayName = document.getElementById('display-name').value;
                                
                                const token = await getAccessToken();
                                if (!token) return; // Handle error

                                await fetch('/users/me', {
                                    method: 'PATCH',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': 'Bearer ' + token
                                    },
                                    body: JSON.stringify({ displayName, pictureUrl })
                                });

                                if (redirectUri) {
                                    window.location.href = redirectUri;
                                } else {
                                    if (window.opener) {
                                        window.opener.postMessage({ type: "vibe_auth_profile_updated" }, "*");
                                    }
                                    window.close();
                                }
                            });

                            if (skipLink) {
                                skipLink.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    if (redirectUri) {
                                        window.location.href = redirectUri;
                                    }
                                });
                            }

                            async function getAccessToken() {
                                try {
                                    const response = await fetch('/auth/api-token');
                                    if (!response.ok) {
                                        console.error('Failed to get API token');
                                        return null;
                                    }
                                    const data = await response.json();
                                    return data.token;
                                } catch (error) {
                                    console.error('Error fetching API token:', error);
                                    return null;
                                }
                            }
                        </script>
                    `);
                    },
                    {
                        query: t.Object({
                            is_signup: t.Optional(t.String()),
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
                    const user: User = {
                        did: userDoc.did,
                        instanceId: userDoc.instanceId,
                        displayName: userDoc.displayName,
                        pictureUrl: userDoc.pictureUrl || userDoc.profilePictureUrl, // TODO remove profilePictureUrl on deploy
                    };
                    return { user };
                })
                .patch(
                    "/me",
                    async ({ profile, body, set }) => {
                        if (!profile) {
                            set.status = 401;
                            return { error: "Unauthorized" };
                        }
                        const user = await identityService.updateUser(profile.sub, body);

                        // Also update the user's own database
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
                .get("/me/encrypted-key", async ({ profile, set }) => {
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
                    async ({ profile, params, body, set, query }) => {
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

                                const dbName = getUserDbName(profile.instanceId);
                                const db = couch.use(dbName);

                                const processAndSend = async () => {
                                    const result = await dataService.readOnce(collection, message.query || {}, profile as JwtPayload);
                                    ws.send(result.docs);
                                };

                                await processAndSend();

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
                                const db = couch.use(dbName);
                                const changes = db.changesReader.start({ since: "now", includeDocs: true });
                                changes.on("change", async (change) => {
                                    if (change.doc?.collection === collection) {
                                        await processAndSend();
                                    }
                                });
                                changesFeeds.push(changes);
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
                    async ({ query, set }) => {
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
                            const db = couch.use(getUserDbName(user.instanceId));
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
                    async ({ profile, body, set }) => {
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
                    async ({ profile, params, set }) => {
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
        .listen(process.env.PORT || 5000);

    console.log(`Vibe Cloud API (${process.env.APP_VERSION}) is running at http://${app.server?.hostname}:${app.server?.port}`);

    return app;
};

startServer().then((app) => {
    if (app) {
        (global as any).app = app;
    }
});

export type App = Awaited<ReturnType<typeof startServer>>;
