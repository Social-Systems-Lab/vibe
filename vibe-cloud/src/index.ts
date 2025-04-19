import { Elysia, t, NotFoundError } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { dataService } from "./services/data.service";
import { authService } from "./services/auth.service"; // Import AuthService
import { logger } from "./utils/logger";

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

// --- Environment Variable Validation ---
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
    throw new Error("JWT_SECRET environment variable not configured.");
}

// --- App Initialization ---
export const app = new Elysia()
    .decorate("dataService", dataService) // Make services available in handlers
    .decorate("authService", authService)
    .use(
        jwt({
            name: "jwt", // Namespace for jwt functions (e.g., context.jwt.sign)
            secret: process.env.JWT_SECRET!, // Explicitly read env var here
            schema: JWTPayloadSchema, // Validate JWT payload structure
            // Optionally configure expiration (e.g., expiresIn: '7d')
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

        // Removed the `if (code === "UNAUTHORIZED")` block as onBeforeHandle handles JWT verification failures.

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
            // This onBeforeHandle now correctly checks the 'user' property populated by derive
            .onBeforeHandle(({ user, set }) => {
                // Check the derived user property
                if (!user) {
                    set.status = 401;
                    // Match the error message expected by the tests
                    return { error: "Unauthorized: Invalid token." }; // Stop execution
                }
                // If 'user' exists, the request is authorized, proceed to the handler
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
                    // Collection param might be redundant if ID is globally unique within user DB, but keep for structure
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
    );

// Start the server only if the file is run directly
if (import.meta.main) {
    app.listen(3000);
    logger.log(`🦊 Vibe Cloud is running at ${app.server?.hostname}:${app.server?.port}`);
}
