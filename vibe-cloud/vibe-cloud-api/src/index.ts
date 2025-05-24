// index.ts
import { Elysia, t, NotFoundError, InternalServerError } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { dataService, type ReadResult } from "./services/data.service";
import { blobService } from "./services/blob.service";
import { RealtimeService } from "./services/realtime.service";
import { logger } from "./utils/logger";
import { randomUUID } from "crypto";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import * as jose from "jose";
import { getUserDbName } from "./utils/identity.utils";
import { Buffer } from "buffer";
import {
    BlobDownloadResponseSchema,
    BLOBS_COLLECTION,
    BlobUploadBodySchema,
    CouchDbDetailsResponseSchema,
    ErrorResponseSchema,
    ReadPayloadSchema,
    WritePayloadSchema,
    type BlobMetadata,
    type JWTPayload,
    type WebSocketAuthContext,
} from "./models/models";
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

// Ensure the user-specific database for this API instance exists
const targetUserDid = process.env.TARGET_USER_DID;
if (targetUserDid) {
    const userSpecificDbName = getUserDbName(targetUserDid);
    logger.info(`Ensuring database exists for this instance's target user DID ${targetUserDid}: ${userSpecificDbName}`);
    await dataService.ensureDatabaseExists(userSpecificDbName);
} else {
    logger.warn("TARGET_USER_DID environment variable is not set. Cannot ensure user-specific database exists.");
    throw new Error("TARGET_USER_DID environment variable is not configured.");
}

await blobService.initialize();
const permissionService = new PermissionService(dataService);
const authService = new AuthService(dataService, permissionService, blobService); // Pass blobService here
const realtimeService = new RealtimeService(dataService, permissionService);

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
            origin: "*",
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization", "X-Vibe-App-ID"],
            credentials: true,
            preflight: true,
        })
    )
    // --- End CORS Middleware ---
    .use(
        jwt({
            name: "jwt",
            secret: jwtSecret,
            alg: "HS256",
            iss: process.env.JWT_ISSUER || "vibe-cloud-control-plane",
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
    .get("/health", () => {
        return {
            status: "ok",
            service: "vibe-cloud-api",
            version: process.env.APP_VERSION || "unknown",
        };
    })
    // --- Protected Data Routes ---
    .group("/api/v1/data", (group) =>
        group
            // 1. Derive User AND App Context
            .derive(async ({ jwt, request: { headers } }) => {
                const authHeader = headers.get("authorization");
                const appIdHeader = headers.get("x-vibe-app-id"); // Get App ID header

                let user: { identityDid: string; isAdmin?: boolean; type?: string } | null = null;
                let appId: string | null = appIdHeader || null;

                // Verify JWT
                if (authHeader && authHeader.startsWith("Bearer ")) {
                    const token = authHeader.substring(7);
                    try {
                        // Use the injected jwt instance for verification
                        const rawPayload = await jwt.verify(token);
                        if (rawPayload && typeof rawPayload.identityDid === "string") {
                            user = rawPayload as { identityDid: string; isAdmin?: boolean; type?: string };
                        } else {
                            logger.warn("JWT payload verification in /data derive: payload is invalid or missing identityDid.", rawPayload);
                            user = null;
                        }
                    } catch (error) {
                        logger.debug("JWT verification failed in /data derive");
                        user = null; // Invalid JWT
                    }
                }
                return { user, appId };
            })
            // 2. Authentication, Instance DID Validation & Permission Check Middleware
            .onBeforeHandle(async ({ user, appId, permissionService, request, body, set }) => {
                // Check User JWT authentication
                if (!user) {
                    set.status = 401;
                    logger.warn("Data API access denied: Missing or invalid user token.");
                    return { error: "Unauthorized: Invalid or missing user token." };
                }

                // Validate that the token's identityDid matches the instance's TARGET_USER_DID
                const instanceTargetDid = process.env.TARGET_USER_DID;
                if (instanceTargetDid && user.identityDid !== instanceTargetDid) {
                    set.status = 403;
                    logger.warn(`Forbidden: Token identityDid (${user.identityDid}) does not match instance target DID (${instanceTargetDid}).`);
                    return { error: "Forbidden: Token identity does not match this instance." };
                }
                if (!instanceTargetDid) {
                    logger.error("CRITICAL: TARGET_USER_DID is not set for this API instance. Cannot validate token scope.");
                    set.status = 503; // Service Unavailable or Internal Server Error
                    return { error: "Instance configuration error: Target user DID not set." };
                }

                // Check if App ID was provided (required for data access via Agent)
                if (!appId) {
                    set.status = 400; // Bad Request
                    logger.warn(`Data API access denied for user ${user.identityDid}: Missing X-Vibe-App-ID header.`);
                    return { error: "Bad Request: Missing X-Vibe-App-ID header." };
                }
            })
            // POST /api/v1/data/read - Read documents from a collection
            .post(
                "/read",
                async ({ dataService, user, appId, body, set }) => {
                    // user is guaranteed non-null by onBeforeHandle
                    const { identityDid } = user!;
                    const { collection, filter } = body;

                    // permission check
                    const requiredPermission = `read:${collection}`;
                    const isAllowed = await permissionService.canAppActForUser(identityDid, appId!, requiredPermission);
                    if (!isAllowed) {
                        logger.warn(`Permission denied for app '${appId}' acting for user '${identityDid}' on action '${requiredPermission}'`);
                        set.status = 403;
                        return { error: `Forbidden: Application does not have permission '${requiredPermission}' for this user.` };
                    }
                    logger.debug(`Permission granted for app '${appId}' acting for user '${identityDid}' on action '${requiredPermission}'`);

                    // call readOnce
                    const userDbName = getUserDbName(identityDid);
                    logger.debug(`Executing readOnce for user ${identityDid}, db: ${userDbName}, collection: ${collection}, filter: ${JSON.stringify(filter)}`);
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
                    const { identityDid } = user!;
                    const { collection, data } = body;

                    // permission check
                    const requiredPermission = `write:${collection}`;
                    const isAllowed = await permissionService.canAppActForUser(identityDid, appId!, requiredPermission);
                    if (!isAllowed) {
                        logger.warn(`Permission denied for app '${appId}' acting for user '${identityDid}' on action '${requiredPermission}'`);
                        set.status = 403;
                        return { error: `Forbidden: Application does not have permission '${requiredPermission}' for this user.` };
                    }
                    logger.debug(`Permission granted for app '${appId}' acting for user '${identityDid}' on action '${requiredPermission}'`);

                    // call write
                    const userDbName = getUserDbName(identityDid);
                    logger.debug(
                        `Executing write for user ${identityDid}, db: ${userDbName}, collection: ${collection}, data: ${
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
                                logger.warn(`Write completed with errors/conflicts for user ${identityDid}, collection ${collection}. Returning 207.`);
                                set.status = 207; // Multi-Status
                            } else {
                                logger.debug(`Bulk write successful for user ${identityDid}, collection ${collection}. Returning 200.`);
                                set.status = 200; // OK
                            }
                            // Return the detailed array response from CouchDB
                            return response;
                        } else {
                            // Single insert response (guaranteed ok:true if no error thrown)
                            logger.debug(`Single write successful for user ${identityDid}, collection ${collection}. Returning 200.`);
                            set.status = 200; // OK
                            // Return the single response object
                            return response;
                        }
                    } catch (error: any) {
                        // *** Catch Specific Errors (now primarily for SINGLE writes) ***
                        if (error.message?.includes("Revision conflict")) {
                            logger.warn(`Conflict detected during single write for user ${identityDid}, collection ${collection}. Returning 409.`);
                            set.status = 409; // Conflict
                            return { error: "Revision conflict", details: error.message };
                        } else {
                            // Let other errors fall through to the global onError handler
                            logger.error(`Unexpected error during write for user ${identityDid}, collection ${collection}:`, error);
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
    // --- Protected Blob Routes ---
    .group("/api/v1/blob", (group) =>
        group
            // Derive JWT user context (same as data routes)
            .derive(async ({ jwt, request: { headers } }) => {
                const authHeader = headers.get("authorization");
                if (!authHeader || !authHeader.startsWith("Bearer ")) return { user: null };
                const token = authHeader.substring(7);
                try {
                    const rawPayload = await jwt.verify(token);
                    if (rawPayload && typeof rawPayload.identityDid === "string") {
                        // Add appId as null or undefined if needed by other parts,
                        // but it's not used for direct permission checks here.
                        return { user: rawPayload as { identityDid: string; isAdmin?: boolean; type?: string }, appId: null };
                    } else {
                        logger.warn("JWT payload verification in /blob derive: payload is invalid or missing identityDid.", rawPayload);
                        return { user: null, appId: null };
                    }
                } catch (error) {
                    logger.debug("JWT verification failed in /blob derive");
                    return { user: null, appId: null };
                }
            })
            // Middleware: User JWT check and Instance DID Validation
            .onBeforeHandle(({ user, set }) => {
                if (!user) {
                    set.status = 401;
                    logger.warn("Access to /api/v1/blob denied: Missing or invalid user token.");
                    return { error: "Unauthorized: Invalid or missing user token." };
                }
                // Validate that the token's identityDid matches the instance's TARGET_USER_DID
                const instanceTargetDid = process.env.TARGET_USER_DID;
                if (instanceTargetDid && user.identityDid !== instanceTargetDid) {
                    set.status = 403;
                    logger.warn(
                        `Forbidden: Token identityDid (${user.identityDid}) does not match instance target DID (${instanceTargetDid}) for blob routes.`
                    );
                    return { error: "Forbidden: Token identity does not match this instance." };
                }
                if (!instanceTargetDid) {
                    logger.error("CRITICAL: TARGET_USER_DID is not set for this API instance. Cannot validate token scope for blob routes.");
                    set.status = 503;
                    return { error: "Instance configuration error: Target user DID not set." };
                }
            })
            // POST /api/v1/blob/upload - Upload a file
            .post(
                "/upload",
                async ({ blobService, dataService, permissionService, user, body, set }) => {
                    if (!user) throw new InternalServerError("User context missing");
                    const { identityDid } = user;
                    // TODO: Re-evaluate blob write permissions. For now, allow any authenticated user.
                    // const requiredPermission = `write:${BLOBS_COLLECTION}`;
                    // logger.info(`User ${identityDid} attempting upload. Checking permission: ${requiredPermission}`);
                    // const canWrite = await permissionService.userHasDirectPermission(identityDid, requiredPermission); // Method removed/commented out
                    // logger.info(`User ${identityDid} direct write permission for ${BLOBS_COLLECTION}: ${canWrite}`);
                    // if (!canWrite) {
                    //     set.status = 403;
                    //     return { error: `Forbidden: Missing '${requiredPermission}' permission.` };
                    // }
                    logger.info(`User ${identityDid} attempting upload. Bypassing direct permission check for now.`);

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
                            ownerDid: identityDid, // Use identityDid
                            uploadTimestamp: new Date().toISOString(),
                            bucket: bucketName,
                            collection: BLOBS_COLLECTION,
                        };
                        await dataService.createDocument(SYSTEM_DB, BLOBS_COLLECTION, metadata);
                        logger.info(`Blob ${objectId} metadata saved for user ${identityDid}`);
                        set.status = 201;
                        return {
                            message: "File uploaded successfully.",
                            objectId: objectId,
                            filename: metadata.originalFilename,
                            contentType: metadata.contentType,
                            size: metadata.size,
                        };
                    } catch (error: any) {
                        logger.error(`Blob upload failed for user ${identityDid}, objectId ${objectId}:`, error);
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
                    const { identityDid } = user;

                    try {
                        // 1. Fetch Metadata
                        logger.debug(`Attempting to fetch metadata for objectId: ${objectId} from DB: ${SYSTEM_DB}`);
                        const metadata = (await dataService.getDocument(SYSTEM_DB, `${BLOBS_COLLECTION}/${objectId}`)) as BlobMetadata;
                        logger.debug(`Successfully fetched metadata for objectId: ${objectId}`, metadata); // Log successful fetch

                        // 2. Permission Check (Owner only for now)
                        // TODO: Re-evaluate blob read permissions. Maybe check for a specific direct permission if needed later.
                        const isOwner = metadata.ownerDid === identityDid;
                        logger.debug(`Permission check: isOwner=${isOwner}, identityDid=${identityDid}, metadata.ownerDid=${metadata.ownerDid}`);
                        // const canReadDirectly = await permissionService.userHasDirectPermission(identityDid, requiredPermission); // Method removed/commented out
                        // logger.debug(`Permission check: isOwner=${isOwner}, userHasDirectRead=${canReadDirectly}`);

                        if (!isOwner /* && !canReadDirectly */) {
                            // Only check ownership for now
                            logger.warn(`Forbidden access attempt for blob ${objectId} by user ${identityDid} (not owner).`);
                            set.status = 403; // Set status before throwing
                            return { error: "Forbidden: You do not have permission to access this blob." };
                        }

                        // 3. Generate Pre-signed URL
                        logger.info(`Generating download URL for blob ${objectId} requested by user ${identityDid}`);
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
                            logger.warn(`Download request for non-existent blob ${objectId} by user ${identityDid}`);
                            // Use the error message from NotFoundError
                            set.status = 404;
                            return { error: error.message };
                        }
                        // Keep Minio object not found check
                        if (error.message?.includes("Object not found in storage")) {
                            logger.warn(`Download request for blob ${objectId} (metadata found, but object missing) by user ${identityDid}`);
                            set.status = 404;
                            return { error: error.message };
                        }
                        logger.error(`Failed to generate download URL for blob ${objectId}, user ${identityDid}:`, error);
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
    )
    // --- New Route ---
    .group("/api/v1", (group) =>
        group
            // JWT derivation and authentication middleware
            .derive(async ({ jwt, request: { headers } }) => {
                const authHeader = headers.get("authorization");
                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    logger.debug("Unauthorized: No auth header or not Bearer.");
                    return { currentIdentity: null as JWTPayload | null };
                }
                const token = authHeader.substring(7);
                try {
                    const payload = (await jwt.verify(token)) as JWTPayload | false;
                    if (!payload || typeof payload === "boolean" || !payload.identityDid) {
                        logger.warn("JWT verification returned invalid payload or missing identityDid.", { tokenString: token, rawPayload: payload });
                        return { currentIdentity: null as JWTPayload | null };
                    }
                    return { currentIdentity: payload as JWTPayload };
                } catch (error) {
                    logger.warn("JWT verification failed with error:", { error, tokenString: token }); // Avoid logging full token object if it's sensitive
                    return { currentIdentity: null as JWTPayload | null };
                }
            })
            .onBeforeHandle(({ currentIdentity, set }) => {
                if (!currentIdentity) {
                    set.status = 401;
                    logger.warn("Access to /api/v1/authdb denied: Missing or invalid user token.");
                    return { error: "Unauthorized: Invalid or missing user token." };
                }
                // Validate that the token's identityDid matches the instance's TARGET_USER_DID
                const instanceTargetDid = process.env.TARGET_USER_DID;
                if (instanceTargetDid && currentIdentity.identityDid !== instanceTargetDid) {
                    set.status = 403;
                    logger.warn(
                        `Forbidden: Token identityDid (${currentIdentity.identityDid}) does not match instance target DID (${instanceTargetDid}) for authdb.`
                    );
                    return { error: "Forbidden: Token identity does not match this instance." };
                }
                if (!instanceTargetDid) {
                    logger.error("CRITICAL: TARGET_USER_DID is not set for this API instance. Cannot validate token scope for authdb.");
                    set.status = 503;
                    return { error: "Instance configuration error: Target user DID not set." };
                }
            })
            .get(
                "/authdb",
                async ({ currentIdentity, set }) => {
                    // user is populated by the .derive middleware
                    const { identityDid } = currentIdentity!; // user is guaranteed non-null due to onBeforeHandle

                    logger.info(`Processing /api/v1/authdb request for user: ${identityDid}`);

                    const publicInstanceUrl = process.env.PUBLIC_INSTANCE_URL;
                    const couchDbUsername = process.env.COUCHDB_USER; // This should be the generated user for the instance's CouchDB
                    const couchDbPassword = process.env.COUCHDB_PASSWORD; // This should be the generated password

                    if (!publicInstanceUrl) {
                        logger.error(
                            `CRITICAL: PUBLIC_INSTANCE_URL is not configured in the environment for the API instance serving user ${identityDid}. Cannot construct public CouchDB URL.`
                        );
                        set.status = 503; // Service Unavailable
                        return { error: "API instance public URL is not configured." };
                    }

                    if (!couchDbUsername || !couchDbPassword) {
                        logger.error(
                            `CRITICAL: CouchDB credentials (COUCHDB_USER or COUCHDB_PASSWORD) are not available (likely not sourced from secret correctly) for API instance serving user ${identityDid}.`
                        );
                        set.status = 503; // Service Unavailable
                        return { error: "CouchDB credentials are not configured for this instance." };
                    }

                    // Construct the publicly accessible CouchDB URL
                    // Assuming CouchDB is exposed at the /couchdb path on the same host as the API instance
                    const publicCouchDbUrl = `${publicInstanceUrl.replace(/\/$/, "")}/couchdb`;

                    logger.info(`Providing CouchDB details for user ${identityDid}. Public URL: ${publicCouchDbUrl}`);

                    set.status = 200;
                    return {
                        url: publicCouchDbUrl,
                        username: couchDbUsername,
                        password: couchDbPassword,
                    };
                },
                {
                    response: {
                        // Define expected responses
                        200: CouchDbDetailsResponseSchema,
                        401: ErrorResponseSchema, // For unauthorized
                        503: ErrorResponseSchema, // For service configuration issues
                    },
                    detail: {
                        // OpenAPI documentation details
                        summary: "Get CouchDB connection details for the authenticated user.",
                        description:
                            "Provides the externally accessible URL, username, and password for the user's CouchDB instance. Requires JWT authentication. These details are read from the API instance's environment variables.",
                    },
                }
            )
    );

// --- WebSocket Handler Definition ---
// Define the pure Bun WebSocket handler logic BEFORE startServer uses it
const bunWsHandler: WebSocketHandler<WebSocketAuthContext> = {
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

// --- Fetch Handler Definition ---
// Define the fetch handler BEFORE startServer uses it
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
            if (!payload || typeof payload.identityDid !== "string") return new Response("Invalid token payload", { status: 401 }); // Check identityDid
            const identityDid = payload.identityDid as string; // Use identityDid
            // Pass identityDid as userDid in WebSocketAuthContext for now, or update WebSocketAuthContext
            const success = server.upgrade(req, { data: { userDid: identityDid, appId } });
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
// Define startServer function
export function startServer(port: number = 3000): Server {
    logger.info(`Attempting to start Vibe Cloud server on port ${port}...`);
    try {
        const server = Bun.serve({
            hostname: "0.0.0.0",
            port: port,
            websocket: bunWsHandler, // Use the defined WS handler
            fetch: fetchHandler, // Use the defined fetch handler
        });
        logger.info(`🚀 Vibe Cloud API (Version: ${process.env.APP_VERSION || "unknown"}) started at http://${server.hostname}:${server.port}`);
        return server;
    } catch (error) {
        logger.error(`Failed to start Vibe Cloud API server on port ${port}:`, error);
        throw error; // Re-throw to indicate failure
    }
}

// Start the server combining Elysia fetch and Bun WS
if (import.meta.main) {
    startServer(Number(process.env.PORT) || 3000);
}

// --- Exports ---
// Export singletons and types AFTER they are fully defined
export { dataService, authService, permissionService, blobService, realtimeService };
export type App = typeof app; // Export the app type for Eden client
