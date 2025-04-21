// index.ts
import { Elysia, t, NotFoundError, InternalServerError, type Static } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { dataService } from "./services/data.service";
import { authService } from "./services/auth.service";
import { permissionService } from "./services/permission.service";
import { BlobService } from "./services/blob.service"; // Import BlobService
import { RealtimeService, type WebSocketAuthContext } from "./services/realtime.service";
import { logger } from "./utils/logger";
import { randomUUID } from "crypto"; // For generating unique object IDs
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import * as jose from "jose"; // For JWT verification

// --- Schemas ---

// Auth Schemas
const AuthCredentialsSchema = t.Object({
    email: t.String({ format: "email", error: "Invalid email format." }),
    password: t.String({ minLength: 8, error: "Password must be at least 8 characters long." }),
});
type AuthCredentials = Static<typeof AuthCredentialsSchema>;

// JWT Payload Schema
const JWTPayloadSchema = t.Object({
    userId: t.String(),
    // Add other non-sensitive claims if needed (e.g., email, roles)
    // email: t.String({ format: 'email' }) // Example
});

// WebSocket Schemas
const WebSocketClientMessageSchema = t.Object({
    action: t.Union([t.Literal("subscribe"), t.Literal("unsubscribe")]),
    collection: t.String({ minLength: 1 }),
});

// Schema for query parameter authentication (less secure, but common for WS)
const WebSocketAuthQuerySchema = t.Object({
    token: t.String({ minLength: 10, error: "Missing or invalid auth token in query." }),
});

// Data Schemas
const DataDocumentSchema = t.Object({}, { additionalProperties: true }); // Allow any fields for general data
type DataDocument = Static<typeof DataDocumentSchema>;

// Define schema for update payload, requiring _rev
const UpdateDataDocumentSchema = t.Intersect([
    t.Object({
        _rev: t.String({ error: "Missing required field: _rev" }),
    }),
    DataDocumentSchema,
]);

// Define schema for delete query parameters, requiring _rev
const DeleteParamsSchema = t.Object({
    _rev: t.String({ error: "Missing required query parameter: _rev" }),
});

// Blob Schemas
const BlobUploadBodySchema = t.Object({
    file: t.File({
        // Expect a single file named 'file'
        // Optional: Add size/type validation if needed
        // maxSize: '5m', // Example: 5MB limit
        // types: ['image/jpeg', 'image/png', 'application/pdf'] // Example: Allowed types
        error: "File upload is required.",
    }),
    // Add other metadata fields if needed, e.g., description: t.Optional(t.String())
});
type BlobUploadBody = Static<typeof BlobUploadBodySchema>;

const BlobMetadataSchema = t.Object({
    _id: t.String(), // objectId
    _rev: t.Optional(t.String()), // CouchDB revision
    originalFilename: t.String(),
    contentType: t.String(),
    size: t.Number(),
    ownerId: t.String(), // userId of the uploader
    uploadTimestamp: t.String({ format: "date-time" }),
    bucket: t.String(),
});
type BlobMetadata = Static<typeof BlobMetadataSchema>;

const BlobDownloadResponseSchema = t.Object({
    url: t.String({ format: "uri", error: "Invalid URL format." }),
});

// --- Constants ---
export const BLOB_METADATA_DB = "blob_metadata"; // Dedicated DB for blob metadata (Exported)

// --- Environment Variable Validation ---
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
    throw new Error("JWT_SECRET environment variable not configured.");
}

const secretKey = new TextEncoder().encode(jwtSecret);

// --- Service Initialization & DB Setup ---
await dataService.connect();
await dataService.ensureDatabaseExists(BLOB_METADATA_DB); // Ensure metadata DB exists
const realtimeService = new RealtimeService(dataService, permissionService);

// --- App Initialization ---
export const app = new Elysia()
    .decorate("dataService", dataService)
    .decorate("authService", authService)
    .decorate("permissionService", permissionService)
    .decorate("blobService", BlobService) // Decorate with BlobService
    .decorate("realtimeService", realtimeService)
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!,
            schema: JWTPayloadSchema,
        })
    )
    .onError(({ code, error, set }) => {
        let isHandled = false; // Flag to track if we handled it

        // --- Handle Specific Auth Errors ---
        if (error instanceof Error) {
            if (error.message.includes("Invalid email or password")) {
                set.status = 401; // Unauthorized
                isHandled = true;
                return { error: "Invalid credentials." };
            }
            if (error.message.includes("User registration conflict")) {
                set.status = 409; // Conflict
                isHandled = true;
                return { error: "Email already registered." };
            }
            // Add other specific auth errors if needed
        }

        // --- Handle Specific DataService Errors ---
        if (error instanceof Error) {
            if (error.message.includes("not found")) {
                // Use NotFoundError for consistency if desired, or keep custom message
                // if (error instanceof NotFoundError) { // Example using Elysia's error
                if (error.message.includes("not found")) {
                    set.status = 404;
                    isHandled = true;
                    return { error: "Resource not found." };
                }
            }
            if (error.message.includes("Revision conflict")) {
                set.status = 409;
                isHandled = true;
                return { error: error.message };
            }
            if (error.message.includes("Database connection not initialized")) {
                // Log this critical error regardless of environment
                logger.error(`[${code}] Service Unavailable: ${error.message}`, error.stack);
                set.status = 503;
                isHandled = true;
                return { error: "Database service is not available." };
            }
            // Add other specific custom errors from your services here if needed
        }

        // --- Handle Specific Elysia Codes ---
        if (code === "VALIDATION") {
            set.status = 400;
            let details = "Invalid request body or parameters.";
            // Extract specific validation errors if possible (depends on Elysia version/plugins)
            // Example: if (error.errors) details = error.errors.map(e => e.message).join(', ');
            if (error instanceof Error && error.message) {
                details = error.message; // Use the error message provided by validation
            }
            logger.warn(`[VALIDATION] Failed - Details: ${details}`, error); // Log the detailed error
            isHandled = true;
            // Return a user-friendly message, potentially including details
            return { error: "Validation failed", details: details };
        }

        if (code === "PARSE") {
            logger.warn(`[PARSE] Failed to parse request body.`, error);
            set.status = 400;
            isHandled = true;
            return { error: "Failed to parse request body." };
        }

        // --- Add Handling for InternalServerError ---
        if (error instanceof InternalServerError) {
            logger.error(`[${code}] Internal Server Error: ${error.message}`, error.stack);
            set.status = 500;
            // Avoid leaking internal details in production
            return { error: "An internal server error occurred." };
        }

        // --- Log ONLY if Error Was Not Handled Above ---
        if (!isHandled) {
            // Log truly unexpected errors
            logger.error(`[${code}] Unhandled Error Occurred:`, error); // Log the full error object
        }

        // --- Set Default Status and Return Generic Response for Unhandled ---
        if (!isHandled) {
            // Ensure a status code is set if it wasn't handled specifically
            if (!set.status || Number(set.status) < 400) {
                set.status = 500; // Default to Internal Server Error
            }
            return { error: "An internal server error occurred." };
        }
        // If handled, the specific return above already took place.
    })
    .get("/health", () => ({ status: "ok" }))
    // --- Authentication Routes ---
    .group("/api/v1/auth", (group) =>
        group
            .post(
                "/register",
                async ({ authService, body, set }) => {
                    const { email, password } = body;
                    // AuthService handles hashing and saving, throws on error
                    const user = await authService.registerUser(email, password);
                    set.status = 201; // Created
                    // Return minimal info, not the full user object from service
                    return { message: "User registered successfully.", userId: user.userId };
                },
                {
                    body: AuthCredentialsSchema,
                    detail: { summary: "Register a new instance administrator" },
                }
            )
            .post(
                "/login",
                async ({ authService, jwt, body, set }) => {
                    const { email, password } = body;
                    // AuthService handles lookup and password verification, throws on error
                    const user = await authService.loginUser(email, password);
                    // Generate JWT
                    // logger.log(`Secret used for SIGNING: ${process.env.JWT_SECRET?.substring(0, 5)}...`); // Logging removed
                    const token = await jwt.sign({ userId: user.userId /*, email: user.email */ }); // Add other claims as needed
                    set.status = 200; // OK
                    return { message: "Login successful.", token: token };
                },
                {
                    body: AuthCredentialsSchema,
                    detail: { summary: "Log in as instance administrator" },
                }
            )
    )
    // --- Protected Data Routes ---
    .group("/api/v1/data", (group) =>
        group
            .derive(async ({ jwt, request: { headers } }) => {
                const authHeader = headers.get("authorization");
                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    // No token provided
                    return { user: null };
                }

                const token = authHeader.substring(7); // Extract token after "Bearer "

                try {
                    // Verify the token using the jwt instance
                    const payload = await jwt.verify(token);
                    if (!payload) {
                        // Verification failed (e.g., invalid signature, expired)
                        return { user: null };
                    }
                    // Ensure the payload matches the expected schema (contains userId)
                    // The jwt plugin already validates against JWTPayloadSchema on verify
                    // if successful, payload should conform.
                    return { user: payload as { userId: string } }; // Add payload as 'user' to context
                } catch (error) {
                    // Log the error for debugging if needed
                    // logger.warn("JWT verification error:", error.message);
                    // Token verification failed (invalid format, expired, etc.)
                    return { user: null };
                }
            })
            // This onBeforeHandle now checks JWT and then permissions
            .onBeforeHandle(async ({ user, permissionService, request, params, set }) => {
                // 1. Check JWT authentication (derived user property)
                if (!user) {
                    set.status = 401;
                    return { error: "Unauthorized: Invalid token." }; // Stop execution
                }

                // 2. Determine required permission based on method and collection
                const { collection } = params as { collection: string }; // Assume collection is always present here
                let requiredPermission: string;
                switch (request.method.toUpperCase()) {
                    case "POST":
                    case "PUT":
                    case "DELETE":
                        requiredPermission = `write:${collection}`;
                        break;
                    case "GET":
                        requiredPermission = `read:${collection}`;
                        break;
                    default:
                        // Should not happen with defined routes, but handle defensively
                        logger.warn(`Permission check encountered unexpected method: ${request.method}`);
                        set.status = 405; // Method Not Allowed
                        return { error: "Method Not Allowed" };
                }

                // 3. Check permission using the service
                const { userId } = user;
                const isAllowed = await permissionService.can(userId, requiredPermission);

                if (!isAllowed) {
                    set.status = 403; // Forbidden
                    return { error: "Forbidden" }; // Stop execution
                }

                // If JWT is valid and permission check passes, proceed to the handler
            })
            // POST /api/v1/data/:collection - Create a document
            .post(
                "/:collection",
                async ({ dataService, user, params, body, set }) => {
                    // Access derived user
                    const { collection } = params;
                    if (!user) throw new Error("User context missing after verification."); // Should not happen if onBeforeHandle passed
                    const { userId } = user; // Access userId from derived user
                    const userDbName = `userdata-${userId}`;
                    const response = await dataService.createDocument(userDbName, collection, body);
                    set.status = 201; // Created
                    return { id: response.id, rev: response.rev, ok: response.ok };
                },
                {
                    params: t.Object({ collection: t.String() }),
                    body: DataDocumentSchema,
                    detail: { summary: "Create a document in a user's collection" },
                }
            )
            // GET /api/v1/data/:collection/:id - Get a document by ID
            .get(
                "/:collection/:id",
                async ({ dataService, user, params }) => {
                    // Correctly using 'user' from derive
                    // Access derived user
                    const { id } = params;
                    if (!user) throw new Error("User context missing after verification."); // Check derived user
                    const { userId } = user; // Access userId from derived user
                    const userDbName = `userdata-${userId}`;
                    const doc = await dataService.getDocument(userDbName, id);
                    return doc;
                },
                {
                    params: t.Object({
                        collection: t.String(), // Keep for route structure consistency
                        id: t.String(),
                    }),
                    detail: { summary: "Get a document by ID from a user's collection" },
                }
            )
            // PUT /api/v1/data/:collection/:id - Update a document
            .put(
                "/:collection/:id",
                async ({ dataService, user, params, body, set }) => {
                    // Correctly using 'user' from derive
                    // Access derived user
                    const { collection, id } = params;
                    if (!user) throw new Error("User context missing after verification."); // Check derived user
                    const { userId } = user; // Access userId from derived user
                    const userDbName = `userdata-${userId}`;
                    const { _rev, ...dataToUpdate } = body;
                    const response = await dataService.updateDocument(userDbName, collection, id, _rev, dataToUpdate);
                    set.status = 200; // OK
                    return { id: response.id, rev: response.rev, ok: response.ok };
                },
                {
                    params: t.Object({
                        collection: t.String(),
                        id: t.String(),
                    }),
                    body: UpdateDataDocumentSchema,
                    detail: { summary: "Update a document by ID in a user's collection (requires _rev in body)" },
                }
            )
            // DELETE /api/v1/data/:collection/:id?_rev=... - Delete a document
            .delete(
                "/:collection/:id",
                async ({ dataService, user, params, query, set }) => {
                    // Correctly using 'user' from derive
                    // Access derived user
                    const { id } = params;
                    if (!user) throw new Error("User context missing after verification."); // Check derived user
                    const { userId } = user; // Access userId from derived user
                    const userDbName = `userdata-${userId}`;
                    const { _rev } = query;
                    const response = await dataService.deleteDocument(userDbName, id, _rev);
                    set.status = 200; // OK
                    return { ok: response.ok };
                },
                {
                    params: t.Object({
                        collection: t.String(),
                        id: t.String(),
                    }),
                    query: DeleteParamsSchema, // Validate query parameter _rev
                    detail: { summary: "Delete a document by ID (requires _rev query parameter)" },
                }
            )
    )
    // --- Protected Blob Routes ---
    .group("/api/v1/blob", (group) =>
        group
            // Derive JWT user context (same as data routes)
            .derive(async ({ jwt, request: { headers } }) => {
                const authHeader = headers.get("authorization");
                if (!authHeader || !authHeader.startsWith("Bearer ")) return { user: null };
                const token = authHeader.substring(7);
                try {
                    const payload = await jwt.verify(token);
                    return { user: payload as { userId: string } };
                } catch (error) {
                    return { user: null };
                }
            })
            // Generic Auth Check - Specific permissions checked in handlers
            .onBeforeHandle(({ user, set }) => {
                if (!user) {
                    set.status = 401;
                    return { error: "Unauthorized: Invalid token." };
                }
            })
            // POST /api/v1/blob/upload - Upload a file
            .post(
                "/upload",
                async ({ blobService, dataService, permissionService, user, body, set }) => {
                    if (!user) throw new InternalServerError("User context missing after auth check."); // Should not happen

                    // 1. Permission Check
                    const { userId } = user;
                    const canWrite = await permissionService.can(userId, "write:blobs");
                    if (!canWrite) {
                        set.status = 403;
                        return { error: "Forbidden: Missing 'write:blobs' permission." };
                    }

                    // 2. Process Upload
                    const { file } = body;
                    const objectId = randomUUID(); // Generate unique ID for the blob
                    const bucketName = blobService.defaultBucketName; // Use default bucket from service

                    try {
                        // 3. Upload to Minio
                        logger.info(`Uploading blob ${objectId} for user ${userId}`);
                        // Convert stream to Buffer for Minio compatibility
                        const fileBuffer = Buffer.from(await file.arrayBuffer());
                        await blobService.uploadObject(
                            objectId,
                            fileBuffer, // Pass the Buffer
                            file.size,
                            file.type,
                            bucketName
                        );

                        // 4. Create Metadata Document
                        const metadata: Omit<BlobMetadata, "_rev"> = {
                            _id: objectId,
                            originalFilename: file.name || "untitled", // Use file.name
                            contentType: file.type,
                            size: file.size,
                            ownerId: userId,
                            uploadTimestamp: new Date().toISOString(),
                            bucket: bucketName,
                        };

                        // 5. Save Metadata to CouchDB
                        // Pass "" as collection name when using a dedicated DB like blob_metadata
                        await dataService.createDocument(BLOB_METADATA_DB, "", metadata);

                        logger.info(`Blob ${objectId} metadata saved for user ${userId}`);
                        set.status = 201; // Created
                        return {
                            message: "File uploaded successfully.",
                            objectId: objectId,
                            filename: metadata.originalFilename,
                            contentType: metadata.contentType,
                            size: metadata.size,
                        };
                    } catch (error: any) {
                        logger.error(`Blob upload failed for user ${userId}, objectId ${objectId}:`, error);
                        // Attempt to clean up Minio object if metadata saving failed? (Complex)
                        // For now, just return error
                        throw new InternalServerError("Blob upload failed."); // Let generic handler catch
                    }
                },
                {
                    body: BlobUploadBodySchema,
                    detail: { summary: "Upload a blob (requires 'write:blobs' permission)" },
                }
            )
            // GET /api/v1/blob/download/:objectId - Get pre-signed download URL
            .get(
                "/download/:objectId",
                async ({ blobService, dataService, permissionService, user, params, set }) => {
                    if (!user) throw new InternalServerError("User context missing after auth check.");

                    const { objectId } = params;
                    const { userId } = user;

                    try {
                        // 1. Fetch Metadata
                        const metadata = (await dataService.getDocument(BLOB_METADATA_DB, objectId)) as BlobMetadata; // Cast to expected type

                        // 2. Permission Check (Owner OR 'read:blobs')
                        const isOwner = metadata.ownerId === userId;
                        const canRead = await permissionService.can(userId, "read:blobs");

                        if (!isOwner && !canRead) {
                            logger.warn(`Forbidden access attempt for blob ${objectId} by user ${userId}`);
                            set.status = 403; // Set status before throwing
                            throw new Error("Forbidden: You do not have permission to access this blob."); // Throw error
                        }

                        // 3. Generate Pre-signed URL
                        logger.info(`Generating download URL for blob ${objectId} requested by user ${userId}`);
                        const url = await blobService.getPresignedDownloadUrl(
                            objectId,
                            metadata.bucket // Use bucket from metadata
                            // Optional: Adjust expiry time if needed
                        );

                        set.status = 200;
                        return { url: url };
                    } catch (error: any) {
                        if (error.message.includes("not found")) {
                            logger.warn(`Download request for non-existent blob ${objectId} by user ${userId}`);
                            throw new NotFoundError(`Blob metadata not found for ID: ${objectId}`);
                        }
                        if (error.message.includes("Object not found")) {
                            logger.warn(`Download request for blob ${objectId} (metadata found, but object missing in Minio) by user ${userId}`);
                            throw new NotFoundError(`Blob object not found in storage for ID: ${objectId}`);
                        }
                        logger.error(`Failed to generate download URL for blob ${objectId}, user ${userId}:`, error);
                        throw new InternalServerError("Failed to generate download URL.");
                    }
                },
                {
                    params: t.Object({ objectId: t.String() }),
                    // Only define the success response schema. Errors are handled by setting status/returning error object or throwing.
                    response: { 200: BlobDownloadResponseSchema },
                    detail: { summary: "Get a pre-signed URL to download a blob (requires ownership or 'read:blobs')" },
                }
            )
    );

// Define the pure Bun WebSocket handler logic
const bunWsHandler: WebSocketHandler<WebSocketAuthContext> = {
    // Use updated type
    open(ws: ServerWebSocket<WebSocketAuthContext>) {
        // Add type hint
        realtimeService.handleConnection(ws);
    },
    async message(ws: ServerWebSocket<WebSocketAuthContext>, message) {
        // Add type hint
        await realtimeService.handleMessage(ws, message);
    },
    close(ws: ServerWebSocket<WebSocketAuthContext>, code, reason) {
        // Add type hint
        realtimeService.handleDisconnection(ws, code, reason);
    },
};

// Start the server combining Elysia fetch and Bun WS
const server = Bun.serve({
    port: 3000, // Or process.env.PORT
    websocket: bunWsHandler, // Required by type definition even though we handle upgrade manually
    async fetch(req: Request, server: Server) {
        const url = new URL(req.url);

        // --- WebSocket Upgrade Handling ---
        if (url.pathname === "/ws") {
            logger.debug("Request received for /ws path");
            const token = url.searchParams.get("token");
            let userId: string | null = null;

            if (!token) {
                logger.warn("Fetch WS: No token provided in query string.");
                // Reject the request before attempting upgrade
                return new Response("Missing authentication token", { status: 401 });
            }
            // --- MANUAL JWT Verification ---
            try {
                const { payload } = await jose.jwtVerify(token, secretKey, {
                    // Specify expected algorithms if needed, e.g., algorithms: ['HS256']
                });

                if (!payload || typeof payload.userId !== "string") {
                    logger.warn("Fetch WS: Token payload invalid or missing 'userId' string field.");
                    return new Response("Invalid token payload", { status: 401 });
                }

                const userId = payload.userId;
                logger.debug(`Fetch WS: Token verified successfully for user: ${userId}`);

                // --- Attempt Upgrade ---
                const success = server.upgrade(req, {
                    // Attach the verified userId to the WebSocket context
                    data: { userId: userId },
                    // headers: {} // Optional: Add custom headers to the 101 response
                });

                if (success) {
                    logger.debug("Fetch WS: server.upgrade call successful.");
                    // Return undefined signifies successful upgrade handled by Bun
                    return undefined;
                } else {
                    // This usually means the request wasn't a valid WebSocket upgrade request
                    logger.error("Fetch WS: server.upgrade call failed (invalid WS request headers?).");
                    return new Response("WebSocket upgrade failed", { status: 400 }); // Bad Request
                }
            } catch (err: any) {
                // Handle jose verification errors (expired, invalid signature, malformed)
                logger.warn(`Fetch WS: Token verification failed: ${err.message}`);
                let status = 401;
                let message = "Authentication failed";
                if (err.code === "ERR_JWT_EXPIRED") {
                    message = "Token expired";
                } else if (err.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
                    message = "Invalid token signature";
                } else if (err.code === "ERR_JWS_INVALID" || err.code === "ERR_JWT_MALFORMED") {
                    message = "Malformed token";
                }
                return new Response(message, { status: status });
            }
        }

        // --- Fallback to Elysia for all other HTTP requests ---
        try {
            return await app.fetch(req);
        } catch (e: any) {
            logger.error(`Fetch: Error during Elysia fetch delegation for ${url.pathname}:`, e);
            return new Response("Internal Server Error during request delegation", { status: 500 });
        }
    },
    // Note: The top-level 'websocket' property is NOT used here
    // because we handle the upgrade manually in fetch()
    // websocket: bunWsHandler // <-- DO NOT PUT THIS HERE
});

logger.log(`🦊 Vibe Cloud is running at ${server.hostname}:${server.port}`);

// // Start the server only if the file is run directly
// if (import.meta.main) {
//     app.listen(3000);
//     logger.log(`🦊 Vibe Cloud is running at ${app.server?.hostname}:${app.server?.port}`);
// }
