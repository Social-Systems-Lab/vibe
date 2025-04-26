// index.ts
import { Elysia, t, NotFoundError, InternalServerError, type Static } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { dataService, type ReadResult } from "./services/data.service";
import { blobService } from "./services/blob.service";
import { RealtimeService } from "./services/realtime.service";
import { logger } from "./utils/logger";
import { randomUUID } from "crypto";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import type * as nano from "nano";
import * as jose from "jose";
import { ed25519FromDid, getUserDbName } from "./utils/identity.utils";
import { verify } from "@noble/ed25519";
import { Buffer } from "buffer";
import {
    AdminClaimSchema,
    BlobDownloadResponseSchema,
    BLOBS_COLLECTION,
    BlobUploadBodySchema,
    CLAIM_CODES_COLLECTION,
    ErrorResponseSchema,
    JWTPayloadSchema,
    ReadPayloadSchema,
    WritePayloadSchema,
    type BlobMetadata,
    type ClaimCode,
    type WebSocketAuthContext,
    AppManifestSchema,
    AppRegistrationResponseSchema,
    APPS_COLLECTION,
    type App as AppModel,
    SetAppGrantsPayloadSchema, // Import new schema
    type PermissionSetting, // Import type
} from "./models/models";
import { SYSTEM_DB } from "./utils/constants";
import { AuthService } from "./services/auth.service";
import { PermissionService } from "./services/permission.service";

// --- Environment Variable Validation ---
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
    throw new Error("JWT_SECRET environment variable not configured.");
}
const secretKey = new TextEncoder().encode(jwtSecret);

// --- Service Initialization & DB Setup ---
await dataService.connect();
await dataService.ensureDatabaseExists(SYSTEM_DB);
await blobService.initialize();
const permissionService = new PermissionService(dataService);
const authService = new AuthService(dataService, permissionService);
const realtimeService = new RealtimeService(dataService, permissionService);

// --- Initial Admin Claim Code Bootstrap ---
logger.info("Ensuring initial admin claim code exists...");
try {
    await authService.ensureInitialAdminClaimCode();
    logger.info("Initial admin claim code check complete.");
} catch (error) {
    logger.error("CRITICAL: Failed to ensure initial admin claim code:", error);
}
// --- End Initial Admin Claim Code Bootstrap ---

// --- App Initialization ---
export const app = new Elysia()
    .decorate("dataService", dataService)
    .decorate("authService", authService)
    .decorate("permissionService", permissionService)
    .decorate("blobService", blobService)
    .decorate("realtimeService", realtimeService)
    // --- Add CORS Middleware ---
    .use(
        cors({
            origin: ["http://localhost:5000", "http://127.0.0.1:5000"], // Allow requests from the test app
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allow common methods
            allowedHeaders: ["Content-Type", "Authorization", "X-Vibe-App-ID"], // Allow necessary headers
            credentials: true, // Allow cookies/auth headers
            preflight: true, // Handle preflight requests
        })
    )
    // --- End CORS Middleware ---
    .use(
        jwt({
            name: "jwt",
            secret: jwtSecret,
            schema: JWTPayloadSchema,
        })
    )
    .onError(({ code, error, set }) => {
        let isHandled = false; // Flag to track if we handled it

        // Handle specific errors thrown by services or Elysia
        if (error instanceof NotFoundError) {
            set.status = 404;
            isHandled = true;
            return { error: error.message || "Resource not found." };
        }
        if (error instanceof InternalServerError) {
            logger.error(`[${code}] Internal Server Error: ${error.message}`, error.stack);
            set.status = 500;
            isHandled = true;
            return { error: "An internal server error occurred." };
        }

        if (error instanceof Error) {
            // Specific string matching (keep if useful, but prefer specific error types)
            if (error.message.includes("Invalid credentials")) {
                set.status = 401;
                isHandled = true;
                return { error: "Invalid credentials." };
            }
            if (error.message.includes("Email already registered")) {
                set.status = 409;
                isHandled = true;
                return { error: "Email already registered." };
            }
            if (error.message.includes("User DID already exists")) {
                // From AuthService
                set.status = 409;
                isHandled = true;
                return { error: "User DID already exists." };
            }
            if (error.message.includes("Revision conflict")) {
                set.status = 409;
                isHandled = true;
                return { error: error.message };
            }
            if (error.message.includes("Database connection not initialized")) {
                logger.error(`[${code}] Service Unavailable: ${error.message}`, error.stack);
                set.status = 503;
                isHandled = true;
                return { error: "Database service is not available." };
            }
            if (error.message.includes("Object not found in storage")) {
                // From BlobService
                set.status = 404;
                isHandled = true;
                return { error: "Object not found in storage." };
            }
        }

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

        // Elysia specific codes
        if (code === "VALIDATION") {
            set.status = 400;
            let details = error instanceof Error ? error.message : "Invalid request body or parameters.";
            logger.warn(`[VALIDATION] Failed - Details: ${details}`, error);
            isHandled = true;
            return { error: "Validation failed", details: details };
        }
        if (code === "PARSE") {
            logger.warn(`[PARSE] Failed to parse request body.`, error);
            set.status = 400;
            isHandled = true;
            return { error: "Failed to parse request body." };
        }

        // Fallback for unhandled errors
        if (!isHandled) {
            logger.error(`[${code}] Unhandled Error Occurred:`, error);
            if (!set.status || Number(set.status) < 400) {
                set.status = 500;
            }
            return { error: "An internal server error occurred." };
        }
    })
    .get("/health", () => ({ status: "ok" }))
    // --- Admin Claim Route (Unauthenticated) ---
    .group("/api/v1/admin", (group) =>
        group.post(
            "/claim",
            async ({ dataService, authService, jwt, body, set }) => {
                const { did, claimCode, signature } = body;
                logger.info(`Admin claim attempt received for DID: ${did}`);

                // 1. Find the claim code document
                let claimDoc: ClaimCode | null = null;
                try {
                    const query: nano.MangoQuery = {
                        selector: {
                            collection: CLAIM_CODES_COLLECTION,
                            code: claimCode,
                        },
                        limit: 1, // Expect only one matching code
                    };
                    const response = await dataService.findDocuments<ClaimCode>(SYSTEM_DB, query);

                    if (!response.docs || response.docs.length === 0) {
                        logger.warn(`Claim attempt failed: No claim code found matching '${claimCode}'`);
                        set.status = 400;
                        return { error: "Invalid or unknown claim code." };
                    }
                    if (response.docs.length > 1) {
                        // Should not happen if codes are unique, but handle defensively
                        logger.error(`CRITICAL: Multiple claim documents found for code '${claimCode}'!`);
                        set.status = 500;
                        return { error: "Internal server error: Duplicate claim code detected." };
                    }
                    // Nano's find result includes _id and _rev
                    claimDoc = response.docs[0] as ClaimCode;
                    logger.debug(`Found claim document: ${claimDoc._id}`);
                } catch (error: any) {
                    logger.error(`Error finding claim code '${claimCode}':`, error);
                    // Distinguish between not found and other errors if possible
                    if (error instanceof NotFoundError || error.message?.includes("not found")) {
                        set.status = 400; // Treat DB errors during find as bad request for claim code
                        return { error: "Invalid or unknown claim code." };
                    }
                    set.status = 500;
                    return { error: "Internal server error while verifying claim code." };
                }

                // Ensure claimDoc is not null (should be caught above, but belts and suspenders)
                if (!claimDoc) {
                    set.status = 400;
                    return { error: "Invalid or unknown claim code." };
                }

                // 2. Validate the claim code document
                if (claimDoc.spentAt) {
                    logger.warn(`Claim attempt failed: Claim code '${claimDoc._id}' already spent at ${claimDoc.spentAt}`);
                    set.status = 400;
                    return { error: "Claim code has already been used." };
                }
                if (claimDoc.expiresAt && new Date(claimDoc.expiresAt) < new Date()) {
                    logger.warn(`Claim attempt failed: Claim code '${claimDoc._id}' expired at ${claimDoc.expiresAt}`);
                    set.status = 400;
                    return { error: "Claim code has expired." };
                }
                if (claimDoc.forDid && claimDoc.forDid !== did) {
                    logger.warn(`Claim attempt failed: Claim code '${claimDoc._id}' is locked to DID ${claimDoc.forDid}, but provided DID was ${did}`);
                    set.status = 400;
                    return { error: "Claim code is not valid for the provided DID." };
                }

                // 3. Verify the signature
                try {
                    const publicKeyBytes = ed25519FromDid(did); // Extract public key from DID
                    const signatureBytes = Buffer.from(signature, "base64"); // Decode base64 signature
                    const messageBytes = new TextEncoder().encode(claimCode); // Encode the message (claimCode)

                    const isSignatureValid = await verify(signatureBytes, messageBytes, publicKeyBytes);
                    if (!isSignatureValid) {
                        logger.warn(`Claim attempt failed: Invalid signature for claim code '${claimDoc._id}' and DID ${did}`);
                        set.status = 400;
                        return { error: "Invalid signature." };
                    }
                    logger.debug(`Signature verified successfully for claim code '${claimDoc._id}' and DID ${did}`);
                } catch (error: any) {
                    logger.error(`Error during signature verification for claim code '${claimDoc._id}', DID ${did}:`, error);
                    // Errors could be from ed25519FromDid (invalid DID) or Buffer.from (invalid base64)
                    set.status = 400;
                    return { error: `Signature verification failed: ${error.message}` };
                }

                // 4. Mark claim code as spent (conditionally based on environment)
                const nowISO = new Date().toISOString();
                const updatedClaimData = {
                    ...claimDoc, // Keep existing fields
                    spentAt: nowISO,
                    claimedByDid: did,
                };

                // --- Conditional Claim Spending ---
                if (process.env.NODE_ENV === "production") {
                    logger.info(`Production environment detected. Marking claim code '${claimDoc._id}' as spent.`);
                    try {
                        await dataService.updateDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, claimDoc._id, claimDoc._rev!, updatedClaimData);
                        logger.info(`Claim code '${claimDoc._id}' successfully marked as spent by DID ${did}.`);
                    } catch (error: any) {
                        logger.error(`Failed to mark claim code '${claimDoc._id}' as spent in production:`, error);
                        // Handle potential conflict if someone else claimed it simultaneously
                        if (error.message?.includes("Revision conflict") || error.statusCode === 409) {
                            set.status = 409; // Conflict
                            return { error: "Claim code was spent by another request. Please try again if you have another code." };
                        }
                        set.status = 500;
                        return { error: "Internal server error while updating claim code status." };
                    }
                } else {
                    logger.warn(`NODE_ENV is not 'production' (value: ${process.env.NODE_ENV}). Skipping marking claim code '${claimDoc._id}' as spent.`);
                    // Optionally, update the _rev in memory if needed for subsequent operations, though unlikely here.
                    // updatedClaimData._rev = 'simulated-rev-update'; // Example if needed
                }
                // --- End Conditional Claim Spending ---

                // 5. Create the admin user
                let newUser;
                try {
                    logger.debug(`Creating admin user for DID ${did}...`);
                    newUser = await authService.createAdminUserFromDid(did);
                    logger.info(`Admin user created for DID ${did}, internal userDid: ${newUser.userDid}`);
                } catch (error: any) {
                    logger.error(`Failed to create admin user for DID ${did} after successful claim:`, error);
                    // This is problematic - the claim is spent, but user creation failed.
                    // Manual intervention might be needed. Log critical error.
                    // TODO: Consider a compensation mechanism? (Difficult)
                    set.status = 500;
                    return { error: "Claim successful, but failed to create admin user account. Please contact support." };
                }

                // 6. Generate JWT for the new admin user
                let token;
                try {
                    token = await jwt.sign({ userDid: newUser.userDid });
                    logger.debug(`JWT generated for new admin user ${newUser.userDid}`);
                } catch (error: any) {
                    logger.error(`Failed to sign JWT for new admin user ${newUser.userDid}:`, error);
                    set.status = 500;
                    // User exists, claim spent, but no token. User needs to login via a future mechanism?
                    return { error: "Admin account created, but failed to generate session token. Please try logging in." };
                }

                // 7. Return success response
                set.status = 201; // Created
                return {
                    message: "Admin account claimed successfully.",
                    userDid: newUser.userDid,
                    isAdmin: newUser.isAdmin,
                    token: token,
                };
            },
            {
                body: AdminClaimSchema,
                detail: { summary: "Claim an admin account using a DID, claim code, and signature." },
            }
        )
    )
    // --- Protected Data Routes ---
    .group("/api/v1/data", (group) =>
        group
            // 1. Derive User AND App Context
            .derive(async ({ jwt, request: { headers } }) => {
                const authHeader = headers.get("authorization");
                const appIdHeader = headers.get("x-vibe-app-id"); // Get App ID header

                let user: { userDid: string } | null = null;
                let appId: string | null = appIdHeader || null;

                // Verify JWT
                if (authHeader && authHeader.startsWith("Bearer ")) {
                    const token = authHeader.substring(7);
                    try {
                        // Use the injected jwt instance for verification
                        const payload = await jwt.verify(token);
                        if (payload) {
                            user = payload as { userDid: string };
                        }
                    } catch (error) {
                        logger.debug("JWT verification failed in derive");
                        user = null; // Invalid JWT
                    }
                }
                return { user, appId };
            })
            // 2. Authentication & Permission Check Middleware
            .onBeforeHandle(async ({ user, appId, permissionService, request, body, set }) => {
                // Check User JWT authentication
                if (!user) {
                    set.status = 401;
                    logger.warn("Data API access denied: Missing or invalid user token.");
                    return { error: "Unauthorized: Invalid or missing user token." };
                }

                // Check if App ID was provided (required for data access via Agent)
                if (!appId) {
                    set.status = 400; // Bad Request
                    logger.warn(`Data API access denied for user ${user.userDid}: Missing X-Vibe-App-ID header.`);
                    return { error: "Bad Request: Missing X-Vibe-App-ID header." };
                }
            })
            // POST /api/v1/data/read - Read documents from a collection
            .post(
                "/read",
                async ({ dataService, user, appId, body, set }) => {
                    // user is guaranteed non-null by onBeforeHandle
                    const { userDid } = user!;
                    const { collection, filter } = body;

                    // permission check
                    const requiredPermission = `read:${collection}`;
                    const isAllowed = await permissionService.canAppActForUser(userDid, appId!, requiredPermission);
                    if (!isAllowed) {
                        logger.warn(`Permission denied for app '${appId}' acting for user '${userDid}' on action '${requiredPermission}'`);
                        set.status = 403;
                        return { error: `Forbidden: Application does not have permission '${requiredPermission}' for this user.` };
                    }
                    logger.debug(`Permission granted for app '${appId}' acting for user '${userDid}' on action '${requiredPermission}'`);

                    // call readOnce
                    const userDbName = getUserDbName(userDid);
                    logger.debug(`Executing readOnce for user ${userDid}, db: ${userDbName}, collection: ${collection}, filter: ${JSON.stringify(filter)}`);
                    const results: ReadResult = await dataService.readOnce(userDbName, collection, filter);

                    // Return the ReadResult structure
                    return results;
                },
                {
                    body: ReadPayloadSchema,
                    detail: {
                        summary: "Read documents from a user's collection based on a filter.",
                        description: "Requires 'read:<collection>' permission.",
                    },
                }
            )
            // POST /api/v1/data/write - Write (create/update) documents to a collection
            .post(
                "/write",
                async ({ dataService, user, appId, body, set }) => {
                    // user is guaranteed non-null by onBeforeHandle
                    const { userDid } = user!;
                    const { collection, data } = body;

                    // permission check
                    const requiredPermission = `write:${collection}`;
                    const isAllowed = await permissionService.canAppActForUser(userDid, appId!, requiredPermission);
                    if (!isAllowed) {
                        logger.warn(`Permission denied for app '${appId}' acting for user '${userDid}' on action '${requiredPermission}'`);
                        set.status = 403;
                        return { error: `Forbidden: Application does not have permission '${requiredPermission}' for this user.` };
                    }
                    logger.debug(`Permission granted for app '${appId}' acting for user '${userDid}' on action '${requiredPermission}'`);

                    // call write
                    const userDbName = getUserDbName(userDid);
                    logger.debug(
                        `Executing write for user ${userDid}, db: ${userDbName}, collection: ${collection}, data: ${
                            Array.isArray(data) ? `Array[${data.length}]` : "Object"
                        }`
                    );

                    try {
                        // Call dataService.write
                        const response = await dataService.write(userDbName, collection, data);

                        // *** Inspect Response and Set Status ***
                        if (Array.isArray(response)) {
                            // Bulk response: Check if any item reported an error (including conflicts)
                            const hasErrors = response.some((item) => !!item.error);
                            if (hasErrors) {
                                logger.warn(`Write completed with errors/conflicts for user ${userDid}, collection ${collection}. Returning 207.`);
                                set.status = 207; // Multi-Status
                            } else {
                                logger.debug(`Bulk write successful for user ${userDid}, collection ${collection}. Returning 200.`);
                                set.status = 200; // OK
                            }
                            // Return the detailed array response from CouchDB
                            return response;
                        } else {
                            // Single insert response (guaranteed ok:true if no error thrown)
                            logger.debug(`Single write successful for user ${userDid}, collection ${collection}. Returning 200.`);
                            set.status = 200; // OK
                            // Return the single response object
                            return response;
                        }
                    } catch (error: any) {
                        // *** Catch Specific Errors (now primarily for SINGLE writes) ***
                        if (error.message?.includes("Revision conflict")) {
                            logger.warn(`Conflict detected during single write for user ${userDid}, collection ${collection}. Returning 409.`);
                            set.status = 409; // Conflict
                            return { error: "Revision conflict", details: error.message };
                        } else {
                            // Let other errors fall through to the global onError handler
                            logger.error(`Unexpected error during write for user ${userDid}, collection ${collection}:`, error);
                            throw error;
                        }
                    }
                },
                {
                    body: WritePayloadSchema,
                    detail: {
                        summary: "Write (create or update) one or more documents in a user's collection.",
                        description: "Handles ID generation and updates. Requires 'write:<collection>' permission.",
                    },
                    // Define response type if needed
                    // response: { 200: t.Union([t.Any(), t.Array(t.Any())]), 207: t.Array(t.Any()) }
                }
            )
    )
    // --- Protected App Routes ---
    .group("/api/v1/apps", (group) =>
        group
            // Derive JWT user context (same as data routes)
            .derive(async ({ jwt, request: { headers } }) => {
                const authHeader = headers.get("authorization");
                if (!authHeader || !authHeader.startsWith("Bearer ")) return { user: null };
                const token = authHeader.substring(7);
                try {
                    const payload = await jwt.verify(token);
                    return { user: payload as { userDid: string } };
                } catch (error) {
                    return { user: null };
                }
            })
            // Middleware: Just check User JWT exists
            .onBeforeHandle(({ user, set }) => {
                if (!user) {
                    set.status = 401;
                    return { error: "Unauthorized: Invalid or missing user token." };
                }
            })
            // POST /api/v1/apps/register - Register an application
            .post(
                "/register",
                async ({ dataService, user, body, set }) => {
                    if (!user) throw new InternalServerError("User context missing after auth check."); // Should not happen
                    const { userDid } = user;
                    const manifest = body; // body is validated against AppManifestSchema

                    logger.info(`App registration attempt by user ${userDid} for appId ${manifest.appId}`);

                    // Construct the App document to save
                    const appDocument: Omit<AppModel, "_rev"> = {
                        // Use renamed type AppModel
                        _id: `${APPS_COLLECTION}/${manifest.appId}`, // Use appId as part of the document ID
                        appId: manifest.appId,
                        name: manifest.name,
                        description: manifest.description,
                        pictureUrl: manifest.pictureUrl,
                        permissions: manifest.permissions,
                        ownerDid: userDid,
                        createdAt: new Date().toISOString(),
                        collection: APPS_COLLECTION,
                    };

                    try {
                        // Attempt to create the document in the SYSTEM_DB
                        // Using createDocument which handles potential conflicts (app already registered)
                        await dataService.createDocument(SYSTEM_DB, APPS_COLLECTION, appDocument);
                        logger.info(`App '${manifest.appId}' registered successfully by user ${userDid}.`);
                        set.status = 201; // Created
                        return { message: "Application registered successfully.", appId: manifest.appId };
                    } catch (error: any) {
                        if (error.message?.includes("Document update conflict") || error.statusCode === 409) {
                            logger.warn(`App registration conflict for appId '${manifest.appId}' by user ${userDid}. App might already exist.`);
                            // Check if the existing app belongs to the same user? For now, just return conflict.
                            set.status = 409; // Conflict
                            return { error: `Application with ID '${manifest.appId}' already exists.` };
                        } else {
                            logger.error(`Failed to register app '${manifest.appId}' for user ${userDid}:`, error);
                            throw new InternalServerError("Failed to register application."); // Let global handler catch
                        }
                    }
                },
                {
                    body: AppManifestSchema,
                    response: { 201: AppRegistrationResponseSchema, 409: ErrorResponseSchema },
                    detail: { summary: "Register an application manifest." },
                }
            )
    )
    // --- Protected Permissions Routes ---
    .group("/api/v1/permissions", (group) =>
        group
            // Derive JWT user context
            .derive(async ({ jwt, request: { headers } }) => {
                const authHeader = headers.get("authorization");
                if (!authHeader || !authHeader.startsWith("Bearer ")) return { user: null };
                const token = authHeader.substring(7);
                try {
                    const payload = await jwt.verify(token);
                    return { user: payload as { userDid: string } };
                } catch (error) {
                    return { user: null };
                }
            })
            // Middleware: Check User JWT exists
            .onBeforeHandle(({ user, set }) => {
                if (!user) {
                    set.status = 401;
                    return { error: "Unauthorized: Invalid or missing user token." };
                }
            })
            // POST /api/v1/permissions/grants - Set grants for a specific app
            .post(
                "/grants",
                async ({ permissionService, user, body, set }) => {
                    if (!user) throw new InternalServerError("User context missing after auth check.");
                    const { userDid } = user;
                    const { appId, grants } = body; // Body validated against SetAppGrantsPayloadSchema

                    logger.info(`Setting grants for app '${appId}' for user '${userDid}'`);

                    try {
                        // Use the permission service to set the grants
                        // The service handles creating/updating the user's permission doc
                        const result = await permissionService.setAppGrants(userDid, appId, grants as Record<string, PermissionSetting>); // Cast grants

                        logger.info(`Successfully set grants for app '${appId}' for user '${userDid}'. Rev: ${result.rev}`);
                        set.status = 200; // OK
                        return { ok: true, id: result.id, rev: result.rev }; // Return CouchDB-like success response
                    } catch (error: any) {
                        // Let the centralized error handler deal with conflicts or other errors
                        logger.error(`Error setting grants for app '${appId}' for user '${userDid}':`, error);
                        throw error; // Re-throw for central handling
                    }
                },
                {
                    body: SetAppGrantsPayloadSchema,
                    // Define response schema if needed, e.g., { 200: t.Object({ ok: t.Boolean(), id: t.String(), rev: t.String() }) }
                    detail: { summary: "Set/update the permission grants for a specific application for the authenticated user." },
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
                    // Add appId as null or undefined if needed by other parts,
                    // but it's not used for direct permission checks here.
                    return { user: payload as { userDid: string }, appId: null };
                } catch (error) {
                    return { user: null, appId: null };
                }
            })
            // Middleware: Just check User JWT exists
            .onBeforeHandle(({ user, set }) => {
                if (!user) {
                    set.status = 401;
                    return { error: "Unauthorized: Invalid or missing user token." };
                }
            })
            // POST /api/v1/blob/upload - Upload a file
            .post(
                "/upload",
                async ({ blobService, dataService, permissionService, user, body, set }) => {
                    if (!user) throw new InternalServerError("User context missing");
                    const { userDid } = user;
                    const requiredPermission = `write:${BLOBS_COLLECTION}`;
                    logger.info(`User ${userDid} attempting upload. Checking permission: ${requiredPermission}`);

                    const canWrite = await permissionService.userHasDirectPermission(userDid, requiredPermission);
                    logger.info(`User ${userDid} direct write permission for ${BLOBS_COLLECTION}: ${canWrite}`);
                    if (!canWrite) {
                        set.status = 403;
                        return { error: `Forbidden: Missing '${requiredPermission}' permission.` };
                    }

                    const { file } = body;
                    if (!file || typeof file.arrayBuffer !== "function") {
                        logger.error("File object is missing or invalid in request body.");
                        set.status = 400;
                        return { error: "Invalid file upload." };
                    }
                    const objectId = randomUUID();
                    const bucketName = blobService.defaultBucketName;
                    try {
                        const fileBuffer = Buffer.from(await file.arrayBuffer());
                        await blobService.uploadObject(objectId, fileBuffer, file.size, file.type, bucketName);

                        const metadata: Omit<BlobMetadata, "_rev"> = {
                            _id: `${BLOBS_COLLECTION}/${objectId}`,
                            originalFilename: file.name || "untitled",
                            contentType: file.type,
                            size: file.size,
                            ownerDid: userDid,
                            uploadTimestamp: new Date().toISOString(),
                            bucket: bucketName,
                            collection: BLOBS_COLLECTION,
                        };
                        await dataService.createDocument(SYSTEM_DB, BLOBS_COLLECTION, metadata);
                        logger.info(`Blob ${objectId} metadata saved for user ${userDid}`);
                        set.status = 201;
                        return {
                            message: "File uploaded successfully.",
                            objectId: objectId,
                            filename: metadata.originalFilename,
                            contentType: metadata.contentType,
                            size: metadata.size,
                        };
                    } catch (error: any) {
                        logger.error(`Blob upload failed for user ${userDid}, objectId ${objectId}:`, error);
                        // Attempt to clean up Minio object if metadata saving failed? (Complex)
                        // For now, just return error
                        throw new InternalServerError("Blob upload failed."); // Let generic handler catch
                    }
                },
                {
                    body: BlobUploadBodySchema,
                    detail: { summary: `Upload a blob (requires user direct permission 'write:${BLOBS_COLLECTION}')` },
                }
            )
            // GET /api/v1/blob/download/:objectId - Get pre-signed download URL
            .get(
                "/download/:objectId",
                async ({ blobService, dataService, permissionService, user, params, set }) => {
                    logger.debug(`[GET /download/:objectId] Received params: ${JSON.stringify(params)}`);
                    if (!user) throw new InternalServerError("User context missing after auth check.");

                    const { objectId } = params;
                    const { userDid } = user;
                    const requiredPermission = `read:${BLOBS_COLLECTION}`;

                    try {
                        // 1. Fetch Metadata
                        logger.debug(`Attempting to fetch metadata for objectId: ${objectId} from DB: ${SYSTEM_DB}`);
                        const metadata = (await dataService.getDocument(SYSTEM_DB, `${BLOBS_COLLECTION}/${objectId}`)) as BlobMetadata;
                        logger.debug(`Successfully fetched metadata for objectId: ${objectId}`, metadata); // Log successful fetch

                        // 2. Permission Check (Owner OR 'read:blobs')
                        const isOwner = metadata.ownerDid === userDid;
                        logger.debug(`Permission check: isOwner=${isOwner}, userDid=${userDid}, metadata.ownerId=${metadata.ownerDid}`);
                        const canReadDirectly = await permissionService.userHasDirectPermission(userDid, requiredPermission);
                        logger.debug(`Permission check: isOwner=${isOwner}, userHasDirectRead=${canReadDirectly}`);

                        if (!isOwner && !canReadDirectly) {
                            logger.warn(`Forbidden access attempt for blob ${objectId} by user ${userDid}`);
                            set.status = 403; // Set status before throwing
                            return { error: "Forbidden: You do not have permission to access this blob." };
                        }

                        // 3. Generate Pre-signed URL
                        logger.info(`Generating download URL for blob ${objectId} requested by user ${userDid}`);
                        const url = await blobService.getPresignedDownloadUrl(
                            objectId,
                            metadata.bucket // Use bucket from metadata
                            // Optional: Adjust expiry time if needed
                        );
                        logger.debug(`Successfully generated download URL for objectId: ${objectId}: ${url.substring(0, 100)}...`); // Log success

                        set.status = 200;
                        return { url: url };
                    } catch (error: any) {
                        if (error instanceof NotFoundError) {
                            logger.warn(`Download request for non-existent blob ${objectId} by user ${userDid}`);
                            // Use the error message from NotFoundError
                            set.status = 404;
                            return { error: error.message };
                        }
                        // Keep Minio object not found check
                        if (error.message?.includes("Object not found in storage")) {
                            logger.warn(`Download request for blob ${objectId} (metadata found, but object missing) by user ${userDid}`);
                            set.status = 404;
                            return { error: error.message };
                        }
                        logger.error(`Failed to generate download URL for blob ${objectId}, user ${userDid}:`, error);
                        throw new InternalServerError("Failed to generate download URL.");
                    }
                },
                {
                    params: t.Object({ objectId: t.String() }),
                    // Only define the success response schema. Errors are handled by setting status/returning error object or throwing.
                    response: { 200: BlobDownloadResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema },
                    detail: { summary: "Get a pre-signed URL to download a blob (requires ownership or 'read:blobs')" },
                }
            )
    );

// --- Export Singletons for Tests ---
export { dataService, authService, permissionService, blobService, realtimeService };

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

// --- Define the Fetch Handler (including WS Upgrade) ---
// This uses the initialized app singleton for HTTP requests
async function fetchHandler(req: Request, server: Server): Promise<Response | undefined> {
    const url = new URL(req.url);

    // WebSocket Upgrade Handling
    if (url.pathname === "/ws") {
        // ... (WS upgrade logic remains the same, using secretKey) ...
        logger.debug("Request received for /ws path");
        const token = url.searchParams.get("token");
        const appId = url.searchParams.get("appId");
        if (!token) return new Response("Missing authentication token", { status: 401 });
        if (!appId) return new Response("Missing application identifier", { status: 400 });
        try {
            const { payload } = await jose.jwtVerify(token, secretKey);
            if (!payload || typeof payload.userDid !== "string") return new Response("Invalid token payload", { status: 401 });
            const userDid = payload.userDid;
            const success = server.upgrade(req, { data: { userDid, appId } });
            if (success) return undefined;
            else return new Response("WebSocket upgrade failed", { status: 400 });
        } catch (err: any) {
            /* ... JWT error handling ... */
            logger.warn(`Fetch WS: Token verification failed: ${err.message}`);
            let status = 401;
            let message = "Authentication failed";
            if (err.code === "ERR_JWT_EXPIRED") message = "Token expired";
            else if (err.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") message = "Invalid token signature";
            else if (err.code === "ERR_JWS_INVALID" || err.code === "ERR_JWT_MALFORMED") message = "Malformed token";
            return new Response(message, { status: status });
        }
    }

    // Fallback to Elysia for HTTP requests
    try {
        return await app.fetch(req); // Use the exported app instance
    } catch (e: any) {
        logger.error(`Fetch: Error during Elysia fetch delegation for ${url.pathname}:`, e);
        return new Response("Internal Server Error during request delegation", { status: 500 });
    }
}

// --- Exportable Server Start Function ---
// This function encapsulates the Bun.serve call
export function startServer(port: number = 3000): Server {
    logger.info(`Attempting to start Vibe Cloud server on port ${port}...`);
    try {
        const server = Bun.serve({
            port: port,
            websocket: bunWsHandler, // Use the defined WS handler
            fetch: fetchHandler, // Use the defined fetch handler
        });
        logger.info(`🚀 Vibe Cloud server started at http://${server.hostname}:${server.port}`);
        return server;
    } catch (error) {
        logger.error(`Failed to start server on port ${port}:`, error);
        throw error; // Re-throw to indicate failure
    }
}

// Start the server combining Elysia fetch and Bun WS
if (import.meta.main) {
    startServer(Number(process.env.PORT) || 3000);
}

export type App = typeof app; // Export the app type for Eden client
