// index.ts
import { Elysia, t, NotFoundError, InternalServerError, type Static } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { dataService } from "./services/data.service";
import { authService } from "./services/auth.service";
import { permissionService } from "./services/permission.service";
import { RealtimeService, type WebSocketAuthContext } from "./services/realtime.service";
import { logger } from "./utils/logger";
import type { ServerWebSocket } from "bun";

// --- Schemas ---

// Auth Schemas
const AuthCredentialsSchema = t.Object({
    email: t.String({ format: "email", error: "Invalid email format." }),
    password: t.String({ minLength: 8, error: "Password must be at least 8 characters long." }), // Add password validation
});

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
const DataDocumentSchema = t.Object({}, { additionalProperties: true }); // Allow any fields

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

type WSQuery = Static<typeof WebSocketAuthQuerySchema>;
type WSMsg = Static<typeof WebSocketClientMessageSchema>;

// --- Environment Variable Validation ---
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
    throw new Error("JWT_SECRET environment variable not configured.");
}

await dataService.connect();
const realtimeService = new RealtimeService(dataService, permissionService);

// --- App Initialization ---
export const app = new Elysia()
    .ws("/ws", {
        // NO schemas (query, body) defined here
        beforeHandle({ request }) {
            const url = new URL(request.url);
            console.log(`Ultra-Minimal WS: beforeHandle. Path: ${url.pathname}`);
            // Just return a dummy context synchronously
            return { userId: "ultra-minimal-user" };
        },
        open(ws) {
            console.log(`Ultra-Minimal WS: Opened! Context: ${JSON.stringify(ws.data)}`);
            ws.send("Ultra-Minimal Connected!");
        },
        message(ws, message) {
            console.log(`Ultra-Minimal WS: Message: ${message}`);
            ws.send(`Echo: ${message}`);
        },
        close(ws, code, reason) {
            console.log(`Ultra-Minimal WS: Closed. Code: ${code}, Reason: ${reason}`);
        },
    })
    .get("/", () => "Hello");

// export const app = new Elysia()
//     .decorate("dataService", dataService)
//     .decorate("authService", authService)
//     .decorate("permissionService", permissionService)
//     .decorate("realtimeService", realtimeService)
//     .use(
//         jwt({
//             name: "jwt", // Namespace for jwt functions (e.g., context.jwt.sign)
//             secret: process.env.JWT_SECRET!, // Explicitly read env var here
//             schema: JWTPayloadSchema, // Validate JWT payload structure
//             // Optionally configure expiration (e.g., expiresIn: '7d')
//         })
//     )
//     .onError(({ code, error, set }) => {
//         let isHandled = false; // Flag to track if we handled it

//         // --- Handle Specific Auth Errors ---
//         if (error instanceof Error) {
//             if (error.message.includes("Invalid email or password")) {
//                 set.status = 401; // Unauthorized
//                 isHandled = true;
//                 return { error: "Invalid credentials." };
//             }
//             if (error.message.includes("User registration conflict")) {
//                 set.status = 409; // Conflict
//                 isHandled = true;
//                 return { error: "Email already registered." };
//             }
//             // Add other specific auth errors if needed
//         }

//         // --- Handle Specific DataService Errors ---
//         if (error instanceof Error) {
//             if (error.message.includes("not found")) {
//                 // Use NotFoundError for consistency if desired, or keep custom message
//                 // if (error instanceof NotFoundError) { // Example using Elysia's error
//                 if (error.message.includes("not found")) {
//                     set.status = 404;
//                     isHandled = true;
//                     return { error: "Resource not found." };
//                 }
//             }
//             if (error.message.includes("Revision conflict")) {
//                 set.status = 409;
//                 isHandled = true;
//                 return { error: error.message };
//             }
//             if (error.message.includes("Database connection not initialized")) {
//                 // Log this critical error regardless of environment
//                 logger.error(`[${code}] Service Unavailable: ${error.message}`, error.stack);
//                 set.status = 503;
//                 isHandled = true;
//                 return { error: "Database service is not available." };
//             }
//             // Add other specific custom errors from your services here if needed
//         }

//         // --- Handle Specific Elysia Codes ---
//         if (code === "VALIDATION") {
//             set.status = 400;
//             let details = "Invalid request body or parameters.";
//             // Extract specific validation errors if possible (depends on Elysia version/plugins)
//             // Example: if (error.errors) details = error.errors.map(e => e.message).join(', ');
//             if (error instanceof Error && error.message) {
//                 details = error.message; // Use the error message provided by validation
//             }
//             logger.warn(`[VALIDATION] Failed - Details: ${details}`, error); // Log the detailed error
//             isHandled = true;
//             // Return a user-friendly message, potentially including details
//             return { error: "Validation failed", details: details };
//         }

//         if (code === "PARSE") {
//             logger.warn(`[PARSE] Failed to parse request body.`, error);
//             set.status = 400;
//             isHandled = true;
//             return { error: "Failed to parse request body." };
//         }

//         // --- Add Handling for InternalServerError ---
//         if (error instanceof InternalServerError) {
//             logger.error(`[${code}] Internal Server Error: ${error.message}`, error.stack);
//             set.status = 500;
//             // Avoid leaking internal details in production
//             return { error: "An internal server error occurred." };
//         }

//         // --- Log ONLY if Error Was Not Handled Above ---
//         if (!isHandled) {
//             // Log truly unexpected errors
//             logger.error(`[${code}] Unhandled Error Occurred:`, error); // Log the full error object
//         }

//         // --- Set Default Status and Return Generic Response for Unhandled ---
//         if (!isHandled) {
//             // Ensure a status code is set if it wasn't handled specifically
//             if (!set.status || Number(set.status) < 400) {
//                 set.status = 500; // Default to Internal Server Error
//             }
//             return { error: "An internal server error occurred." };
//         }
//         // If handled, the specific return above already took place.
//     })
//     .get("/health", () => ({ status: "ok" }))
//     // --- Authentication Routes ---
//     .group("/api/v1/auth", (group) =>
//         group
//             .post(
//                 "/register",
//                 async ({ authService, body, set }) => {
//                     const { email, password } = body;
//                     // AuthService handles hashing and saving, throws on error
//                     const user = await authService.registerUser(email, password);
//                     set.status = 201; // Created
//                     // Return minimal info, not the full user object from service
//                     return { message: "User registered successfully.", userId: user.userId };
//                 },
//                 {
//                     body: AuthCredentialsSchema,
//                     detail: { summary: "Register a new instance administrator" },
//                 }
//             )
//             .post(
//                 "/login",
//                 async ({ authService, jwt, body, set }) => {
//                     const { email, password } = body;
//                     // AuthService handles lookup and password verification, throws on error
//                     const user = await authService.loginUser(email, password);
//                     // Generate JWT
//                     // logger.log(`Secret used for SIGNING: ${process.env.JWT_SECRET?.substring(0, 5)}...`); // Logging removed
//                     const token = await jwt.sign({ userId: user.userId /*, email: user.email */ }); // Add other claims as needed
//                     set.status = 200; // OK
//                     return { message: "Login successful.", token: token };
//                 },
//                 {
//                     body: AuthCredentialsSchema,
//                     detail: { summary: "Log in as instance administrator" },
//                 }
//             )
//     )
//     // --- Protected Data Routes ---
//     .group("/api/v1/data", (group) =>
//         group
//             .derive(async ({ jwt, request: { headers } }) => {
//                 const authHeader = headers.get("authorization");
//                 if (!authHeader || !authHeader.startsWith("Bearer ")) {
//                     // No token provided
//                     return { user: null };
//                 }

//                 const token = authHeader.substring(7); // Extract token after "Bearer "

//                 try {
//                     // Verify the token using the jwt instance
//                     const payload = await jwt.verify(token);
//                     if (!payload) {
//                         // Verification failed (e.g., invalid signature, expired)
//                         return { user: null };
//                     }
//                     // Ensure the payload matches the expected schema (contains userId)
//                     // The jwt plugin already validates against JWTPayloadSchema on verify
//                     // if successful, payload should conform.
//                     return { user: payload as { userId: string } }; // Add payload as 'user' to context
//                 } catch (error) {
//                     // Log the error for debugging if needed
//                     // logger.warn("JWT verification error:", error.message);
//                     // Token verification failed (invalid format, expired, etc.)
//                     return { user: null };
//                 }
//             })
//             // This onBeforeHandle now checks JWT and then permissions
//             .onBeforeHandle(async ({ user, permissionService, request, params, set }) => {
//                 // 1. Check JWT authentication (derived user property)
//                 if (!user) {
//                     set.status = 401;
//                     return { error: "Unauthorized: Invalid token." }; // Stop execution
//                 }

//                 // 2. Determine required permission based on method and collection
//                 const { collection } = params as { collection: string }; // Assume collection is always present here
//                 let requiredPermission: string;
//                 switch (request.method.toUpperCase()) {
//                     case "POST":
//                     case "PUT":
//                     case "DELETE":
//                         requiredPermission = `write:${collection}`;
//                         break;
//                     case "GET":
//                         requiredPermission = `read:${collection}`;
//                         break;
//                     default:
//                         // Should not happen with defined routes, but handle defensively
//                         logger.warn(`Permission check encountered unexpected method: ${request.method}`);
//                         set.status = 405; // Method Not Allowed
//                         return { error: "Method Not Allowed" };
//                 }

//                 // 3. Check permission using the service
//                 const { userId } = user;
//                 const isAllowed = await permissionService.can(userId, requiredPermission);

//                 if (!isAllowed) {
//                     set.status = 403; // Forbidden
//                     return { error: "Forbidden" }; // Stop execution
//                 }

//                 // If JWT is valid and permission check passes, proceed to the handler
//             })
//             // POST /api/v1/data/:collection - Create a document
//             .post(
//                 "/:collection",
//                 async ({ dataService, user, params, body, set }) => {
//                     // Access derived user
//                     const { collection } = params;
//                     if (!user) throw new Error("User context missing after verification."); // Should not happen if onBeforeHandle passed
//                     const { userId } = user; // Access userId from derived user
//                     const userDbName = `userdata-${userId}`;
//                     const response = await dataService.createDocument(userDbName, collection, body);
//                     set.status = 201; // Created
//                     return { id: response.id, rev: response.rev, ok: response.ok };
//                 },
//                 {
//                     params: t.Object({ collection: t.String() }),
//                     body: DataDocumentSchema,
//                     detail: { summary: "Create a document in a user's collection" },
//                 }
//             )
//             // GET /api/v1/data/:collection/:id - Get a document by ID
//             .get(
//                 "/:collection/:id",
//                 async ({ dataService, user, params }) => {
//                     // Correctly using 'user' from derive
//                     // Access derived user
//                     const { id } = params;
//                     if (!user) throw new Error("User context missing after verification."); // Check derived user
//                     const { userId } = user; // Access userId from derived user
//                     const userDbName = `userdata-${userId}`;
//                     const doc = await dataService.getDocument(userDbName, id);
//                     return doc;
//                 },
//                 {
//                     params: t.Object({
//                         collection: t.String(), // Keep for route structure consistency
//                         id: t.String(),
//                     }),
//                     detail: { summary: "Get a document by ID from a user's collection" },
//                 }
//             )
//             // PUT /api/v1/data/:collection/:id - Update a document
//             .put(
//                 "/:collection/:id",
//                 async ({ dataService, user, params, body, set }) => {
//                     // Correctly using 'user' from derive
//                     // Access derived user
//                     const { collection, id } = params;
//                     if (!user) throw new Error("User context missing after verification."); // Check derived user
//                     const { userId } = user; // Access userId from derived user
//                     const userDbName = `userdata-${userId}`;
//                     const { _rev, ...dataToUpdate } = body;
//                     const response = await dataService.updateDocument(userDbName, collection, id, _rev, dataToUpdate);
//                     set.status = 200; // OK
//                     return { id: response.id, rev: response.rev, ok: response.ok };
//                 },
//                 {
//                     params: t.Object({
//                         collection: t.String(),
//                         id: t.String(),
//                     }),
//                     body: UpdateDataDocumentSchema,
//                     detail: { summary: "Update a document by ID in a user's collection (requires _rev in body)" },
//                 }
//             )
//             // DELETE /api/v1/data/:collection/:id?_rev=... - Delete a document
//             .delete(
//                 "/:collection/:id",
//                 async ({ dataService, user, params, query, set }) => {
//                     // Correctly using 'user' from derive
//                     // Access derived user
//                     const { id } = params;
//                     if (!user) throw new Error("User context missing after verification."); // Check derived user
//                     const { userId } = user; // Access userId from derived user
//                     const userDbName = `userdata-${userId}`;
//                     const { _rev } = query;
//                     const response = await dataService.deleteDocument(userDbName, id, _rev);
//                     set.status = 200; // OK
//                     return { ok: response.ok };
//                 },
//                 {
//                     params: t.Object({
//                         collection: t.String(),
//                         id: t.String(),
//                     }),
//                     query: DeleteParamsSchema, // Validate query parameter _rev
//                     detail: { summary: "Delete a document by ID (requires _rev query parameter)" },
//                 }
//             )
//     )
//     // TEMPORARY SIMPLE WS TEST  - WebSocket Endpoint
//     .ws("/ws", {
//         query: WebSocketAuthQuerySchema, // Keep schema reference
//         body: WebSocketClientMessageSchema, // Keep schema reference

//         // Use the simplified beforeHandle that bypasses auth
//         beforeHandle({ query, set }) {
//             logger.debug(`WS Simplified: beforeHandle executing. Query: ${JSON.stringify(query)}`);
//             const dummyUserId = "debug-user-123";
//             logger.debug(`WS Simplified: beforeHandle returning dummy context for user: ${dummyUserId}`);
//             // Return context synchronously
//             return { userId: dummyUserId } satisfies WebSocketAuthContext;
//         },

//         // Simplified open handler
//         open(ws) {
//             // Access context attached by beforeHandle
//             const context = ws.data as WebSocketAuthContext;
//             logger.info(`WS Simplified: Connection opened! Context UserID: ${context?.userId}`);
//             // Send a confirmation message back to the client
//             ws.send(JSON.stringify({ status: "connected", userId: context?.userId }));
//         },

//         // Simplified message handler
//         message(ws, raw) {
//             const context = ws.data as WebSocketAuthContext;
//             logger.debug(`WS Simplified: Message received from UserID ${context?.userId}. Raw:`, raw);
//             // Echo back the received message
//             try {
//                 const messageString = typeof raw === "string" ? raw : JSON.stringify(raw);
//                 ws.send(JSON.stringify({ status: "echo", received: messageString, from: context?.userId }));
//             } catch (e) {
//                 logger.error("WS Simplified: Failed to stringify received message for echo", e);
//                 ws.send(JSON.stringify({ status: "echo_error", from: context?.userId }));
//             }
//         },

//         // Simplified close handler
//         close(ws, code, reason) {
//             const context = ws.data as WebSocketAuthContext;
//             logger.info(`WS Simplified: Connection closed for UserID ${context?.userId}. Code: ${code}, Reason: ${reason}`);
//         },
//     });

// --- WebSocket Endpoint ---
// .ws("/ws", {
//     query: WebSocketAuthQuerySchema,
//     body: WebSocketClientMessageSchema,

//     // index.ts - TEMPORARY DEBUGGING STEP in .ws("/ws", { ... })
//     beforeHandle({ query, set }) {
//         // Remove async, jwt
//         logger.debug(`WS beforeHandle: Bypassing ALL checks for debugging. Query: ${JSON.stringify(query)}`);
//         const dummyUserId = "debug-user-123";
//         logger.debug(`WS beforeHandle: Returning dummy context for user: ${dummyUserId}`);
//         // Directly return the context object synchronously
//         return { userId: dummyUserId } satisfies WebSocketAuthContext;
//     },

//     // async beforeHandle({ query, jwt, set }) {
//     //     logger.debug(`WS beforeHandle: Attempting auth for token: ${query.token?.substring(0, 10)}...`); // Log received token (truncated)
//     //     const payload = await jwt.verify(query.token).catch((err) => {
//     //         // Log the specific verification error
//     //         logger.warn(`WS beforeHandle: JWT verification failed for token "${query.token?.substring(0, 10)}...". Error: ${err.message}`, err);
//     //         return null;
//     //     });

//     //     if (!payload || !payload.userId) {
//     //         logger.warn(`WS beforeHandle: Unauthorized - Invalid payload or missing userId. Payload: ${JSON.stringify(payload)}. Rejecting connection.`);
//     //         set.status = 401;
//     //         // You can optionally return an error object, though setting status is key
//     //         return { error: "Unauthorized" }; // Or just return;
//     //     }

//     //     logger.debug(`WS beforeHandle: Authorized successfully. User ID: ${payload.userId}`);
//     //     return { userId: payload.userId } satisfies WebSocketAuthContext;
//     // },

//     open(ws) {
//         logger.debug(`WebSocket connection opened.`);
//         realtimeService.handleConnection(ws.raw as ServerWebSocket<WebSocketAuthContext>);
//     },

//     message(ws, raw) {
//         realtimeService.handleMessage(ws.raw as ServerWebSocket<WebSocketAuthContext>, raw as WSMsg);
//     },

//     close(ws, code, reason) {
//         realtimeService.handleDisconnection(ws.raw as ServerWebSocket<WebSocketAuthContext>, code, reason);
//     },
// });

// Start the server only if the file is run directly
if (import.meta.main) {
    app.listen(3000);
    logger.log(`🦊 Vibe Cloud is running at ${app.server?.hostname}:${app.server?.port}`);
}
