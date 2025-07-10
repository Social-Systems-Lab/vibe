// Force type regeneration
import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { cors } from "@elysiajs/cors";
import { html } from "@elysiajs/html";
import { IdentityService } from "./services/identity";
import { DataService, JwtPayload } from "./services/data";
import { StorageService, MinioStorageProvider, ScalewayStorageProvider, StorageProvider } from "./services/storage";
import { getUserDbName } from "./lib/db";
import nano from "nano";

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
        .decorate("identityService", identityService)
        .decorate("storageService", storageService)
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
                .get(
                    "/authorize",
                    async ({ query, cookie, sessionJwt, set, html, url }) => {
                        const { client_id, response_type, scope, form_type = "login", redirect_uri, prompt, app_image_url } = query;

                        const style = `
                            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; }
                            .container { background-color: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; }
                            h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
                            p { margin-bottom: 1.5rem; color: #666; }
                            strong { color: #333; }
                            form { display: flex; flex-direction: column; gap: 1rem; }
                            input { padding: 0.75rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
                            button { padding: 0.75rem; border: none; border-radius: 4px; background-color: #1a73e8; color: white; font-size: 1rem; cursor: pointer; }
                            button[value="deny"] { background-color: #ccc; }
                            hr { border: none; border-top: 1px solid #eee; margin: 1.5rem 0; }
                            a { color: #1a73e8; text-decoration: none; }
                        `;

                        const page = (title: string, content: string) => `
                            <style>${style}</style>
                            <div class="container">
                                <h1>${title}</h1>
                                ${content}
                            </div>
                        `;

                        try {
                            const clientIdOrigin = new URL(client_id).origin;
                            const redirectUriOrigin = new URL(redirect_uri).origin;
                            if (clientIdOrigin !== redirectUriOrigin) {
                                set.status = 400;
                                return "Invalid redirect_uri. Must be on the same domain as the client_id.";
                            }
                        } catch (e) {
                            set.status = 400;
                            return "Invalid client_id or redirect_uri.";
                        }

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
                                return html(
                                    page(
                                        "Sign Up",
                                        `
                                   <p>To authorize <strong>${client_id}</strong></p>
                                   <form method="POST" action="/auth/signup?${signupParams.toString()}">
                                       <input type="email" name="email" placeholder="Email" required />
                                       <input type="password" name="password" placeholder="Password" required />
                                       <button type="submit">Sign Up</button>
                                   </form>
                                   <hr/>
                                   <p>Already have an account? <a href="/auth/authorize?${loginParams.toString()}">Log in</a></p>
                                `
                                    )
                                );
                            }

                            // Show Login form by default
                            return html(
                                page(
                                    "Login",
                                    `
                               <p>To authorize <strong>${client_id}</strong></p>
                               <form method="POST" action="/auth/login?${loginParams.toString()}">
                                   <input type="email" name="email" placeholder="Email" required />
                                   <input type="password" name="password" placeholder="Password" required />
                                   <button type="submit">Login</button>
                               </form>
                               <hr/>
                               <p>Don't have an account? <a href="/auth/authorize?${signupParams.toString()}">Sign up here</a></p>
                           `
                                )
                            );
                        }

                        try {
                            const session = await sessionJwt.verify(sessionToken);
                            if (!session || !session.sessionId) {
                                cookie.vibe_session.set({ value: "", maxAge: -1, path: "/", httpOnly: true });
                                // Session is invalid, show login page again
                                return "Invalid session. Please log in again.";
                            }

                            const userDid = session.sessionId;
                            const user = await identityService.findByDid(userDid);
                            if (!user) {
                                cookie.vibe_session.set({ value: "", maxAge: -1, path: "/", httpOnly: true });
                                return "Invalid session. Please log in again.";
                            }

                            if (!user.displayName) {
                                const profileParams = new URLSearchParams({
                                    ...query,
                                    redirect_uri: url.href,
                                    is_signup: "true",
                                });
                                return new Response(null, {
                                    status: 302,
                                    headers: {
                                        Location: `/user/profile?${profileParams.toString()}`,
                                    },
                                });
                            }

                            const hasConsented = await identityService.hasUserConsented(userDid, client_id);

                            if (hasConsented && prompt !== "consent") {
                                // User has already consented, so we can skip the consent screen
                                const authCode = await identityService.createAuthCode({
                                    userDid,
                                    clientId: client_id,
                                    scope,
                                    redirectUri: query.redirect_uri,
                                    codeChallenge: query.code_challenge,
                                    codeChallengeMethod: query.code_challenge_method || "S256",
                                });

                                const redirectUrl = new URL(query.redirect_uri);
                                redirectUrl.searchParams.set("code", authCode);
                                if (query.state) {
                                    redirectUrl.searchParams.set("state", query.state);
                                }
                                return new Response(null, {
                                    status: 302,
                                    headers: {
                                        Location: redirectUrl.toString(),
                                    },
                                });
                            }

                            // User is logged in, but hasn't consented yet. Show the consent screen.
                            const queryString = new URLSearchParams(query as any).toString();
                            return html(
                                page(
                                    "Authorize Application",
                                    `
                                ${app_image_url ? `<img src="${app_image_url}" alt="App Image" style="max-width: 100px; max-height: 100px; margin-bottom: 1rem; border-radius: 8px;" />` : ""}
                                <p>The application <strong>${client_id}</strong> wants to access your data.</p>
                                <p>Scopes: ${scope}</p>
                                <form method="POST" action="/auth/authorize/decision?${queryString}">
                                    <button type="submit" name="decision" value="allow">Allow</button>
                                    <button type="submit" name="decision" value="deny">Deny</button>
                                </form>
                            `
                                )
                            );
                        } catch (e) {
                            cookie.vibe_session.set({ value: "", maxAge: -1, path: "/", httpOnly: true });
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
                            prompt: t.Optional(t.String()),
                            app_image_url: t.Optional(t.String()),
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
                        button { margin-top: 1rem; }
                        .skip { font-size: 0.8rem; margin-top: 1rem; }
                    `;

                        return html(`
                        <style>${style}</style>
                        <div class="container">
                            <h1>${isSignup ? "Complete Your Profile" : "Profile Settings"}</h1>
                            <img id="profile-pic" src="${user?.profilePictureUrl || "https://placehold.co/100x100"}" alt="Profile Picture">
                            <form id="profile-form">
                                ${isSignup ? "" : `<label for="file-upload">Change Picture</label>`}
                                <input id="file-upload" type="file" accept="image/*">
                                <input type="text" id="display-name" value="${user?.displayName || ""}" placeholder="Display Name" required>
                                <button type="submit">${isSignup ? "Continue" : "Save"}</button>
                            </form>
                            ${isSignup ? `<a href="#" id="skip-link" class="skip">Skip for now</a>` : ""}
                        </div>
                        <script>
                            const form = document.getElementById('profile-form');
                            const fileUpload = document.getElementById('file-upload');
                            const profilePic = document.getElementById('profile-pic');
                            const skipLink = document.getElementById('skip-link');
                            let profilePictureUrl = "${user?.profilePictureUrl || ""}";
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
                                    profilePictureUrl = data.url;
                                    profilePic.src = data.url;
                                }
                            });

                            form.addEventListener('submit', async (event) => {
                                event.preventDefault();
                                const displayName = document.getElementById('display-name').value;
                                if (!displayName) {
                                    alert("Display name is required.");
                                    return;
                                }
                                
                                const token = await getAccessToken();
                                if (!token) return; // Handle error

                                await fetch('/users/me', {
                                    method: 'PATCH',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': 'Bearer ' + token
                                    },
                                    body: JSON.stringify({ displayName, profilePictureUrl })
                                });

                                if (redirectUri) {
                                    window.location.href = redirectUri;
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
                    const user = {
                        did: userDoc.did,
                        instanceId: userDoc.instanceId,
                        displayName: userDoc.displayName,
                        profilePictureUrl: userDoc.profilePictureUrl,
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
                        return { user };
                    },
                    {
                        body: t.Object({
                            displayName: t.Optional(t.String()),
                            profilePictureUrl: t.Optional(t.String()),
                        }),
                    }
                )
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
