import { Elysia, t, type Context } from "elysia";
import { jwt as jwtPlugin, type JWTPayloadSpec } from "@elysiajs/jwt";
import { websocket, type ElysiaWS } from "@elysiajs/websocket";
import type { UserIdentity, VibeDocument, WsAgentToServerMessage, WsServerToAgentMessage } from "@vibe/shared-types";
import { v4 as uuidv4 } from "uuid";
import Nano, { type MangoQuery, type DocumentScope } from "nano";
import crypto from "node:crypto";
import * as jose from "jose"; // Import jose

// --- Environment Variables ---
const COUCHDB_URL = process.env.COUCHDB_URL || "http://admin:password@localhost:5984";
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key";
const PORT = process.env.PORT || 3000;
const JWT_EXPIRY = process.env.JWT_EXPIRY || "5m"; // Add expiry env var (e.g., "5m", "1h")

if (JWT_SECRET === "default-secret-key" || JWT_SECRET === "your-super-secret-jwt-key") {
    console.warn("⚠️ WARNING: Using default or placeholder JWT_SECRET. Please set a strong secret in production!");
}
// Prepare JWT secret key for jose
const secretKey = new TextEncoder().encode(JWT_SECRET);

// --- CouchDB Setup ---
let nanoInstance: Nano.ServerScope;
let usersDb: Nano.DocumentScope<UserIdentity>;
let dataDb: Nano.DocumentScope<VibeDocument>;

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
} catch (error) {
    console.error("❌ Failed to connect to or initialize CouchDB:", error);
    process.exit(1);
}

// --- Types ---
// Define a type for the JWT payload we expect after verification
interface VerifiedJWTPayload extends JWTPayloadSpec {
    sub: string;
    aud: string;
    scp: string[];
}

// Define a type for the WebSocket context data added during open
// Make user and connectionId optional as they are added within 'open'
interface VibeWSContextData {
    user?: VerifiedJWTPayload; // Store verified user payload here
    connectionId?: string; // Store the connection ID
}

// Define the combined type for our WebSocket instance, including context
// Use generic ElysiaWS and provide the context data type
type VibeWSType = ElysiaWS<any, VibeWSContextData>;

// --- WebSocket Connection Management ---
// Store WebSocket connections mapped by userId
const userConnections = new Map<string, Set<VibeWSType>>();

// --- Elysia App Setup ---
// Must define app before using it in ws handler's jwt call
const app = new Elysia()
    .decorate("db", { users: usersDb, data: dataDb })
    .decorate("generateId", (collection: string) => `${collection}/${uuidv4()}`)
    .use(websocket()) // Add websocket plugin
    .use(
        // Main JWT plugin for REST routes
        jwtPlugin({
            name: "jwt",
            secret: JWT_SECRET,
            schema: t.Object({
                sub: t.String(),
                aud: t.String(),
                scp: t.Array(t.String()),
            }),
            exp: JWT_EXPIRY, // Add default expiry from env/config
        })
    )
    .onError(({ code, error, set }) => {
        console.error(`Elysia Error [${code}]:`, error);
        // ... (keep existing error handling logic) ...
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
const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// --- Routes ---

// 1. Identity Management (Unchanged)
app.post(
    "/identity/register",
    async ({ body, db, set }) => {
        // ... (keep existing logic) ...
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

// 2. Authentication (Add expiresIn)
app.get(
    "/auth/challenge",
    (context) => {
        // ... (keep existing logic) ...
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
            // Sign with default expiry set in plugin config
            const token = await jwt.sign(tokenPayload);
            console.log(`Generated JWT for user ${userId}, origin ${origin} (expires: ${JWT_EXPIRY})`);
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
            origin: t.String({ format: "uri" }), // Ensure origin is a valid URI format
        }),
    }
);

// --- JWT Verification Middleware (Helper) ---
// This helper can be used in REST routes to verify token and audience
const verifyJwtAndAudience = (expectedAudienceSource: (ctx: Context<any>) => string | undefined) => async (context: Context<any> & { jwt: any }) => {
    const { headers, set, jwt } = context;
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { error: "Missing or invalid Authorization header" };
    }
    const token = authHeader.substring(7);
    try {
        const payload = await jwt.verify(token);
        if (!payload) throw new Error("Token verification failed");

        const expectedAudience = expectedAudienceSource(context);
        if (expectedAudience && payload.aud !== expectedAudience) {
            set.status = 403;
            console.warn(`JWT audience mismatch. Expected: ${expectedAudience}, Got: ${payload.aud}`);
            return { error: "Invalid token audience", expected: expectedAudience, actual: payload.aud };
        }
        // Attach payload to context for downstream handlers if needed
        (context as any).verifiedJwtPayload = payload as VerifiedJWTPayload;
    } catch (err: any) {
        set.status = 401;
        // Distinguish between verification errors and audience errors if needed
        if (err.message?.includes("audience")) {
            set.status = 403; // More specific status for audience mismatch
            return { error: "Invalid token audience", details: err.message };
        }
        return { error: "Invalid or expired token", details: err.message };
    }
};

// 3. REST API (Add Audience Check)
app.post(
    "/data/:collection",
    async (context) => {
        // Context now includes verifiedJwtPayload if middleware passed
        const { body, params, db, set, generateId } = context;
        const payload = (context as any).verifiedJwtPayload as VerifiedJWTPayload;

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
        // Apply JWT verification middleware before the handler
        beforeHandle: verifyJwtAndAudience((ctx) => ctx.headers.origin), // Check against Origin header
        params: t.Object({ collection: t.String({ minLength: 1 }) }),
        body: t.Union([t.Object({}, { additionalProperties: true }), t.Array(t.Object({}, { additionalProperties: true }))]),
        headers: t.Object({ authorization: t.String(), origin: t.Optional(t.String()) }), // Make Origin header optional for flexibility
    }
);

app.get(
    "/data/:collection/_once",
    async (context) => {
        const { params, query, db, set } = context;
        const payload = (context as any).verifiedJwtPayload as VerifiedJWTPayload;

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
                // Ensure filter doesn't override userId or $collection
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
    {
        // Apply JWT verification middleware before the handler
        beforeHandle: verifyJwtAndAudience((ctx) => ctx.headers.origin), // Check against Origin header
        params: t.Object({ collection: t.String({ minLength: 1 }) }),
        query: t.Object({ filter: t.Optional(t.String()) }),
        headers: t.Object({ authorization: t.String(), origin: t.Optional(t.String()) }), // Make Origin header optional
    }
);

// 4. WebSocket Endpoint (/ws)
app.ws("/ws", {
    // open handler performs authentication
    async open(ws: VibeWSType) {
        const connectionId = ws.raw.id ?? "unknown"; // Use ws.raw.id if available
        console.log(`WebSocket connection opened: ${connectionId}`);

        // Access query params via ws.data (Elysia provides this)
        const token = ws.data.query.token;

        if (!token) {
            console.log(`WS ${connectionId}: No token provided. Closing connection.`);
            ws.send({ type: "error", payload: { message: "Authentication token required" } });
            ws.close();
            return;
        }

        try {
            // Use jose for manual verification
            const { payload } = await jose.jwtVerify(token, secretKey, {
                // Add expected algorithms, issuer, audience if needed
            });

            // Store verified payload and connection ID in ws.data
            // Initialize ws.data if it doesn't exist (needed for TS)
            ws.data = ws.data || {};
            // Ensure payload structure matches VerifiedJWTPayload (including custom 'scp' claim) before assigning
            if (typeof payload.sub === "string" && typeof payload.aud === "string" && Array.isArray(payload.scp)) {
                // Construct the object explicitly to satisfy the VerifiedJWTPayload type
                ws.data.user = {
                    sub: payload.sub,
                    aud: payload.aud,
                    scp: payload.scp,
                    // Include other standard claims if needed/present, e.g., iat, exp
                    ...(payload.iat && { iat: payload.iat }),
                    ...(payload.exp && { exp: payload.exp }),
                };
                ws.data.connectionId = connectionId;
                const userId = ws.data.user.sub;
                console.log(`WS ${connectionId}: Authenticated successfully for user ${userId}`);

                // Add connection to userConnections map
                if (!userConnections.has(userId)) {
                    userConnections.set(userId, new Set());
                }
                userConnections.get(userId)?.add(ws);

                ws.send({ type: "info", payload: { message: "Authentication successful" } });
            } else {
                throw new Error("JWT payload structure invalid");
            }
        } catch (err: any) {
            console.error(`WS ${connectionId}: Authentication failed:`, err.message);
            ws.send({ type: "error", payload: { message: `Authentication failed: ${err.message}` } });
            ws.close();
        }
    },

    // Message handler
    message(ws: VibeWSType, message: unknown) {
        // Use unknown for message initially
        const connectionId = ws.data?.connectionId ?? "unknown"; // Get ID from context data (check if ws.data exists)
        const userId = ws.data?.user?.sub; // User should be present here (check if ws.data exists)
        if (!userId) {
            console.warn(`WS ${connectionId}: Received message from unauthenticated or improperly initialized connection?`);
            return;
        }

        console.log(`WS ${connectionId} (User ${userId}): Received message:`, message);

        // Manually validate message structure before processing
        const msg = message as WsAgentToServerMessage; // Assert type after basic check
        if (typeof msg !== "object" || msg === null || !msg.action || !msg.payload) {
            console.warn(`WS ${connectionId}: Received invalid message format:`, message);
            ws.send({ type: "error", payload: { message: "Invalid message format" } });
            return;
        }

        switch (msg.action) {
            case "subscribe":
                const subPayload = msg.payload as { subscriptionId: string; collection: string; filter?: object };
                console.log(`-> Received 'subscribe' for collection '${subPayload.collection}' (ID: ${subPayload.subscriptionId})`);
                // In Iteration 2: Start changes feed, send initial data
                ws.send({ type: "info", payload: { subscriptionId: subPayload.subscriptionId, message: "Subscription acknowledged (placeholder)" } });
                break;
            case "unsubscribe":
                const unsubPayload = msg.payload as { subscriptionId: string };
                console.log(`-> Received 'unsubscribe' for ID: ${unsubPayload.subscriptionId}`);
                // In Iteration 2: Stop changes feed
                ws.send({ type: "info", payload: { subscriptionId: unsubPayload.subscriptionId, message: "Unsubscription acknowledged (placeholder)" } });
                break;
            default:
                console.warn(`WS ${connectionId}: Received unknown action:`, (msg as any)?.action);
                ws.send({ type: "error", payload: { message: "Unknown action" } });
        }
    },

    // Close handler
    close(ws) {
        // Access data stored in ws.data during 'open'
        const connectionId = (ws.data as VibeWSContextData)?.connectionId ?? "unknown";
        const userId = (ws.data as VibeWSContextData)?.user?.sub;
        console.log(`WebSocket connection closed: ${connectionId} (User: ${userId ?? "N/A"})`);

        // Clean up userConnections map
        const typedWs = ws as VibeWSType; // Cast for map operations
        if (userId && userConnections.has(userId)) {
            userConnections.get(userId)?.delete(typedWs);
            if (userConnections.get(userId)?.size === 0) {
                userConnections.delete(userId);
                console.log(`Removed user ${userId} from active WS connections.`);
            }
        }
        // In Iteration 2: Ensure any associated changes feeds are stopped
    },

    // Removed top-level error handler
});

// --- Final Setup ---
app.get("/", () => ({ status: "Vibe Cloud is running!" }));
app.listen(PORT);
console.log(`🚀 Vibe Cloud is running at ${app.server?.hostname}:${app.server?.port}`);
