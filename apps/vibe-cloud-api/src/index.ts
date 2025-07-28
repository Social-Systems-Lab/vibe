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
import { onetapAuth } from "./auth/onetap";
import { defaultAuth } from "./auth/default";

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

const app = new Elysia()
    .use(
        cors({
            origin: process.env.CORS_ORIGIN
                ? process.env.CORS_ORIGIN.split(",")
                : ["http://localhost:3000", "http://localhost:3001", "http://localhost:4000", "http://localhost:5000"],
            credentials: true,
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
    .ws("/auth/_next/webpack-hmr", {
        open(ws) {
            console.log("[WS] HMR client connected");
            const serverWs = new WebSocket("ws://127.0.0.1:4000/auth/_next/webpack-hmr");
            (ws.data as any).serverWs = serverWs;

            serverWs.onmessage = ({ data }) => ws.send(data);
            serverWs.onclose = (e) => ws.close(e.code, e.reason);
        },
        message(ws, message) {
            const { serverWs } = ws.data as any;
            serverWs.send(message);
        },
        close(ws) {
            const { serverWs } = ws.data as any;
            serverWs.close();
        },
    })
    .get("/auth/_next/*", ({ request }) => {
        return proxyRequest(request);
    })
    .group("/auth", (authGroup) =>
        authGroup
            .use(onetapAuth)
            .use(defaultAuth)
            .all("/*", ({ request }) => {
                return proxyRequest(request);
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

                            const dbName = getUserDbName(profile.instanceId);
                            const db = nano(process.env.COUCHDB_URL!).use(dbName);

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
                            const db = nano(process.env.COUCHDB_URL!).use(dbName);
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
                        const db = nano(process.env.COUCHDB_URL!).use(getUserDbName(user.instanceId));
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
    .listen(process.env.PORT || 5000);

export type App = typeof app;

console.log(`Vibe Cloud API (${process.env.APP_VERSION}) is running at http://${app.server?.hostname}:${app.server?.port}`);
