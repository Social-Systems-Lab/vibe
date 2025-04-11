import { Elysia, t, type Context } from "elysia";
import { jwt as jwtPlugin } from "@elysiajs/jwt";
import { websocket, type ElysiaWS } from "@elysiajs/websocket"; // Re-add websocket import
import type { UserIdentity, VibeDocument, WsAgentToServerMessage, WsServerToAgentMessage } from "@vibe/shared-types"; // Re-add WS types
import { v4 as uuidv4 } from "uuid";
// Use specific types from nano if available, otherwise use 'any' as fallback
import Nano, { type MangoQuery, type DocumentScope, type FollowEmitter, type FollowResponseItem } from "nano";
import crypto from "node:crypto";

// --- Environment Variables ---
const COUCHDB_URL = process.env.COUCHDB_URL || "http://admin:password@localhost:5984";
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key";
const PORT = process.env.PORT || 3000;

if (JWT_SECRET === "default-secret-key" || JWT_SECRET === "your-super-secret-jwt-key") {
    console.warn("⚠️ WARNING: Using default or placeholder JWT_SECRET. Please set a strong secret in production!");
}

// --- CouchDB Setup ---
let nanoInstance: Nano.ServerScope;
let usersDb: Nano.DocumentScope<UserIdentity>;
let dataDb: Nano.DocumentScope<VibeDocument>;
let changesFollower: Nano.FollowEmitter | null = null; // Re-add changes feed variable

try {
    nanoInstance = Nano(COUCHDB_URL);
    usersDb = nanoInstance.use<UserIdentity>("vibe_users");
    dataDb = nanoInstance.use<VibeDocument>("vibe_data");

    // Ensure databases exist
    await nanoInstance.db.get("vibe_users").catch(async (err) => {
        if (err.statusCode === 404) {
            console.log("Creating vibe_users database...");
            await nanoInstance.db.create("vibe_users");
        } else {
            throw err;
        }
    });
    await nanoInstance.db.get("vibe_data").catch(async (err) => {
        if (err.statusCode === 404) {
            console.log("Creating vibe_data database...");
            await nanoInstance.db.create("vibe_data");
            const indexDef = { index: { fields: ["userId", "$collection"] }, name: "user-collection-idx", type: "json" as const };
            await dataDb.createIndex(indexDef);
            console.log("Created user-collection-idx index in vibe_data.");
        } else {
            throw err;
        }
    });

    console.log("✅ Connected to CouchDB and databases ensured.");
    // startChangesFeed call removed
} catch (error) {
    console.error("❌ Failed to connect to or initialize CouchDB:", error);
    process.exit(1);
}

// --- Elysia App Setup ---
const app = new Elysia()
    .decorate("db", { users: usersDb, data: dataDb })
    .decorate("generateId", (collection: string) => `${collection}/${uuidv4()}`)
    // websocket plugin use removed
    .use(
        jwtPlugin({
            name: "jwt",
            secret: JWT_SECRET,
            schema: t.Object({ sub: t.String(), aud: t.String(), scp: t.Array(t.String()) }),
        })
    )
    .onError(({ code, error, set }) => {
        console.error(`Elysia Error [${code}]:`, error);
        let errorMessage = "An unexpected error occurred.";
        let statusCode = 500;
        let errorDetails: any = undefined;
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        switch (code) {
            case "VALIDATION":
                statusCode = 400;
                errorMessage = "Validation failed.";
                errorDetails = (error as any)?.validator ?? undefined;
                break;
            case "NOT_FOUND":
                statusCode = 404;
                errorMessage = "Resource not found.";
                break;
            case "INTERNAL_SERVER_ERROR":
                statusCode = 500;
                errorMessage = "An internal server error occurred.";
                break;
            case "PARSE":
                statusCode = 400;
                errorMessage = "Failed to parse request body or parameters.";
                break;
            case "INVALID_COOKIE_SIGNATURE":
                statusCode = 401;
                errorMessage = "Invalid cookie signature.";
                break;
        }
        if (set.status === 401 && statusCode !== 401) {
            statusCode = 401;
            errorMessage = "Unauthorized.";
        }
        set.status = statusCode;
        const responseBody: { error: string; message: string; details?: any } = { error: String(code === "UNKNOWN" ? "UnknownError" : code), message: errorMessage };
        if (errorDetails) {
            responseBody.details = errorDetails;
        }
        return responseBody;
    });

// --- Nonce Store (In-Memory for MVP) ---
const nonceStore = new Map<string, { nonce: string; expires: number }>();
 const NONCE_EXPIRY_MS = 5 * 60 * 1000;
 
+// --- WebSocket Subscription Management ---
+// Store the ElysiaWS object, which includes context data
+const userConnections = new Map<string, Set<ElysiaWS<any, any>>>(); // Use ElysiaWS (adjust types later if needed)
+
+// --- Routes ---

// 1. Identity Management
app.post(
    "/identity/register",
    async ({ body, db, set }) => {
        if (!body.userId || !body.publicKey) {
            set.status = 400;
            return { error: "Missing userId or publicKey" };
        }
        try {
            const identity: UserIdentity = { userId: body.userId, publicKey: body.publicKey };
            const response = await db.users.insert(identity, body.userId);
            if (!response.ok) throw new Error("Failed to insert user identity");
            console.log(`Registered user: ${body.userId}`);
            set.status = 201;
            return { success: true, id: response.id, rev: response.rev };
        } catch (error: any) {
            console.error("Registration error:", error);
            set.status = 500;
            return { error: "Failed to register user", message: error.message };
        }
    },
    { body: t.Object({ userId: t.String({ minLength: 1 }), publicKey: t.String({ minLength: 10 }) }) }
);

// 2. Authentication
app.get(
    "/auth/challenge",
    (context) => {
        const { query } = context;
        const userId = query.userId;
        const nonce = crypto.randomBytes(16).toString("hex");
        const expires = Date.now() + NONCE_EXPIRY_MS;
        nonceStore.set(userId, { nonce, expires });
        console.log(`Generated nonce for user ${userId}`);
        return { nonce };
    },
    { query: t.Object({ userId: t.String({ minLength: 1 }) }) }
);

app.post(
    "/auth/token",
    async (context) => {
        const { body, db, jwt, set } = context;
        const { userId, nonce, signature, scopes, origin } = body;
        let userPublicKey: string;
        try {
            const userDoc = await db.users.get(userId);
            userPublicKey = userDoc.publicKey;
        } catch (error: any) {
            if (error.statusCode === 404) {
                set.status = 404;
                return { error: "User not found" };
            }
            console.error("Error fetching user:", error);
            set.status = 500;
            return { error: "Failed to retrieve user data" };
        }
        const storedNonceData = nonceStore.get(userId);
        if (!storedNonceData || storedNonceData.nonce !== nonce || storedNonceData.expires < Date.now()) {
            nonceStore.delete(userId);
            set.status = 400;
            return { error: "Invalid or expired nonce" };
        }
        try {
            const verify = crypto.createVerify("SHA256");
            verify.update(nonce);
            verify.end();
            const isVerified = verify.verify(userPublicKey, signature, "base64");
            if (!isVerified) {
                set.status = 401;
                return { error: "Invalid signature" };
            }
        } catch (error: any) {
            console.error("Signature verification error:", error);
            set.status = 500;
            return { error: "Failed to verify signature", details: error.message };
        }
        nonceStore.delete(userId);
        try {
            const tokenPayload = { sub: userId, aud: origin, scp: scopes };
            const token = await jwt.sign(tokenPayload); // Removed expiry options for now
            console.log(`Generated JWT for user ${userId}, origin ${origin}`);
            return { token };
        } catch (error: any) {
            console.error("JWT signing error:", error);
            set.status = 500;
            return { error: "Failed to generate token", details: error.message };
        }
    },
    {
        body: t.Object({
            userId: t.String({ minLength: 1 }),
            nonce: t.String({ minLength: 32, maxLength: 32 }),
            signature: t.String({ minLength: 10 }),
            scopes: t.Array(t.String(), { minItems: 1 }),
            origin: t.String({ format: "uri" }),
        }),
    }
);

// 3. REST API
app.post(
    "/data/:collection",
    async (context) => {
        const { body, params, jwt, db, set, headers, generateId } = context;
        const authHeader = headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            set.status = 401;
            return { error: "Missing or invalid Authorization header" };
        }
        const token = authHeader.substring(7);
        let payload: { sub: string; aud: string; scp: string[] };
        try {
            const verified = await jwt.verify(token);
            if (!verified) throw new Error("Token verification failed");
            payload = verified as any;
        } catch (err: any) {
            set.status = 401;
            return { error: "Invalid or expired token", details: err.message };
        }
        const collection = params.collection;
        const requiredScope = `write:${collection}`;
        if (!payload.scp || !payload.scp.includes(requiredScope)) {
            set.status = 403;
            return { error: "Insufficient scope", required: requiredScope, granted: payload.scp };
        }
        const userId = payload.sub;
        const now = new Date().toISOString();
        const docsToInsert: VibeDocument<any>[] = [];
        const dataArray = Array.isArray(body) ? body : [body];
        for (const docData of dataArray) {
            if (typeof docData !== "object" || docData === null) {
                set.status = 400;
                return { error: "Invalid document format in request body" };
            }
            const newDoc: VibeDocument<any> = {
                ...docData,
                _id: docData._id || generateId(collection),
                userId: userId,
                $collection: collection,
                ...(docData._rev && { _rev: docData._rev }),
                ...(!docData._rev && { createdAt: now }),
                updatedAt: now,
            };
            docsToInsert.push(newDoc);
        }
        try {
            const response = await db.data.bulk({ docs: docsToInsert });
            const errors = response.filter((r: any) => "error" in r);
            if (errors.length > 0) {
                console.error("CouchDB bulk write errors:", errors);
                set.status = 409;
                return { error: "Failed to write some documents", details: errors };
            }
            console.log(`Wrote ${docsToInsert.length} docs to collection ${collection} for user ${userId}`);
            set.status = docsToInsert.some((d) => !d._rev) ? 201 : 200;
            return response;
        } catch (error: any) {
            console.error("CouchDB write error:", error);
            set.status = 500;
            return { error: "Failed to write data to database", details: error.message };
        }
    },
    {
        params: t.Object({ collection: t.String({ minLength: 1 }) }),
        body: t.Union([t.Object({}, { additionalProperties: true }), t.Array(t.Object({}, { additionalProperties: true }))]),
        headers: t.Object({ authorization: t.String() }),
    }
);

app.get(
    "/data/:collection/_once",
    async (context) => {
        const { params, query, jwt, db, set, headers } = context;
        const authHeader = headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            set.status = 401;
            return { error: "Missing or invalid Authorization header" };
        }
        const token = authHeader.substring(7);
        let payload: { sub: string; aud: string; scp: string[] };
        try {
            const verified = await jwt.verify(token);
            if (!verified) throw new Error("Token verification failed");
            payload = verified as any;
        } catch (err: any) {
            set.status = 401;
            return { error: "Invalid or expired token", details: err.message };
        }
        const collection = params.collection;
        const requiredScope = `read:${collection}`;
        if (!payload.scp || !payload.scp.includes(requiredScope)) {
            set.status = 403;
            return { error: "Insufficient scope", required: requiredScope, granted: payload.scp };
        }
        const userId = payload.sub;
        let selector: MangoQuery = { selector: { userId: userId, $collection: collection } };
        if (query.filter && typeof query.filter === "string") {
            try {
                const filterQuery = JSON.parse(query.filter);
                selector.selector = { ...filterQuery, userId: userId, $collection: collection };
            } catch (e) {
                set.status = 400;
                return { error: "Invalid JSON in filter query parameter" };
            }
        }
        try {
            const response = await db.data.find(selector);
            return response.docs;
        } catch (error: any) {
            console.error("CouchDB find error:", error);
            set.status = 500;
            return { error: "Failed to read data from database", details: error.message };
        }
    },
    { params: t.Object({ collection: t.String({ minLength: 1 }) }), query: t.Object({ filter: t.Optional(t.String()) }), headers: t.Object({ authorization: t.String() }) }
);

// 4. WebSocket Endpoint (/ws) - Placeholder
// TODO: Re-implement WebSocket logic carefully

// --- Final Setup ---
app.get("/", () => ({ status: "Vibe Cloud is running!" }));
app.listen(PORT);
console.log(`🚀 Vibe Cloud is running at ${app.server?.hostname}:${app.server?.port}`);
