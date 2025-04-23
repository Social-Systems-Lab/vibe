// index.ts
import { Elysia, t, NotFoundError, InternalServerError, type Static } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { dataService } from "./services/data.service";
import { authService } from "./services/auth.service";
import { permissionService } from "./services/permission.service";
import { BlobService } from "./services/blob.service";
import { RealtimeService } from "./services/realtime.service";
import { logger } from "./utils/logger";
import { randomUUID } from "crypto";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import type * as nano from "nano";
import * as jose from "jose";
import { ed25519FromDid } from "./utils/did.utils";
import { verify } from "@noble/ed25519";
import { Buffer } from "buffer";
import {
    AdminClaimSchema,
    AuthCredentialsSchema,
    BlobDownloadResponseSchema,
    BlobUploadBodySchema,
    CLAIM_CODES_COLLECTION,
    DeleteParamsSchema,
    ErrorResponseSchema,
    GenericDataDocumentSchema,
    JWTPayloadSchema,
    UpdateDataPayloadSchema,
    type BlobMetadata,
    type ClaimCode,
    type WebSocketAuthContext,
} from "./models/models";
import { SYSTEM_DB, USER_DB_PREFIX } from "./utils/constants";

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
export const app = new Elysia() // Re-export the instance
    .decorate("dataService", dataService)
    .decorate("authService", authService)
    .decorate("permissionService", permissionService)
    .decorate("blobService", BlobService)
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

                // 4. Mark claim code as spent
                const nowISO = new Date().toISOString();
                const updatedClaimData = {
                    ...claimDoc, // Keep existing fields
                    spentAt: nowISO,
                    claimedByDid: did,
                };

                try {
                    logger.debug(`Attempting to mark claim code '${claimDoc._id}' as spent...`);
                    // Use updateDocument - requires _rev. Collection name "" for dedicated DB.
                    await dataService.updateDocument(SYSTEM_DB, "", claimDoc._id, claimDoc._rev, updatedClaimData);
                    logger.info(`Claim code '${claimDoc._id}' successfully marked as spent by DID ${did}.`);
                } catch (error: any) {
                    logger.error(`Failed to mark claim code '${claimDoc._id}' as spent:`, error);
                    // Handle potential conflict if someone else claimed it simultaneously
                    if (error.message?.includes("Revision conflict") || error.statusCode === 409) {
                        set.status = 409; // Conflict
                        return { error: "Claim code was spent by another request. Please try again if you have another code." };
                    }
                    set.status = 500;
                    return { error: "Internal server error while updating claim code status." };
                }

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
                    // Ensure the payload matches the expected schema (contains userDid)
                    // The jwt plugin already validates against JWTPayloadSchema on verify
                    // if successful, payload should conform.
                    return { user: payload as { userDid: string } }; // Add payload as 'user' to context
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
                const { userDid } = user;
                const isAllowed = await permissionService.can(userDid, requiredPermission);

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
                    const { userDid } = user; // Access userDid from derived user
                    const userDbName = `${USER_DB_PREFIX}${userDid}`; // TODO use constant for user DB name
                    const response = await dataService.createDocument(userDbName, collection, body);
                    set.status = 201; // Created
                    return { id: response.id, rev: response.rev, ok: response.ok };
                },
                {
                    params: t.Object({ collection: t.String() }),
                    body: GenericDataDocumentSchema,
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
                    if (!user) throw new Error("User context missing after verification.");
                    const { userDid } = user;
                    const userDbName = `${USER_DB_PREFIX}${userDid}`;
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
                    const { userDid } = user; // Access userDid from derived user
                    const userDbName = `${USER_DB_PREFIX}${userDid}`;
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
                    body: UpdateDataPayloadSchema,
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
                    const { userDid } = user; // Access userDid from derived user
                    const userDbName = `${USER_DB_PREFIX}${userDid}`;
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
                    return { user: payload as { userDid: string } };
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
                // Restore 'body', remove 'request'
                async ({ blobService, dataService, permissionService, user, body, set }) => {
                    if (!user) throw new InternalServerError("User context missing after auth check."); // Should not happen

                    // 1. Permission Check
                    const { userDid } = user;
                    logger.info(`User ${userDid} attempting upload.`);

                    const canWrite = await permissionService.can(userDid, "write:blobs");
                    logger.info(`User ${userDid} write permission: ${canWrite}`);
                    if (!canWrite) {
                        set.status = 403;
                        return { error: "Forbidden: Missing 'write:blobs' permission." };
                    }

                    // 2. Process Upload (using body from schema validation)
                    const { file } = body; // Use file from validated body
                    if (!file || typeof file.arrayBuffer !== "function") {
                        logger.error("File object is missing or invalid in request body.");
                        set.status = 400;
                        return { error: "Invalid file upload." };
                    }
                    logger.info(`Got file: ${file.name}, Size: ${file.size}, Type: ${file.type}`);

                    const objectId = randomUUID(); // Generate unique ID for the blob
                    const bucketName = blobService.defaultBucketName; // Use default bucket from service

                    try {
                        logger.info(`Preparing buffer for ${objectId}...`);
                        // 3. Upload to Minio
                        logger.info(`Uploading blob ${objectId} for user ${userDid}`);
                        // Convert stream to Buffer for Minio compatibility
                        const fileBuffer = Buffer.from(await file.arrayBuffer()); // Use file from body
                        logger.info(`Buffer created for ${objectId}. Size: ${fileBuffer.length}`); // <-- Add

                        logger.info(`Calling blobService.uploadObject for ${objectId}...`);

                        await blobService.uploadObject(
                            objectId,
                            fileBuffer, // Pass the Buffer
                            file.size, // Use file size from body
                            file.type, // Use file type from body
                            bucketName
                        );

                        logger.info(`blobService.uploadObject completed for ${objectId}.`);

                        // 4. Create Metadata Document
                        const metadata: Omit<BlobMetadata, "_rev"> = {
                            _id: objectId, // TODO the object id might need to be defined outside _id
                            originalFilename: file.name || "untitled", // Use file.name from body
                            contentType: file.type, // Use file type from body
                            size: file.size, // Use file size from body
                            ownerDid: userDid,
                            uploadTimestamp: new Date().toISOString(),
                            bucket: bucketName,
                            collection: "$blobs", // TODO use constant for collection name
                        };

                        logger.info(`Calling dataService.createDocument for ${objectId}...`);
                        // 5. Save Metadata to CouchDB
                        await dataService.createDocument(SYSTEM_DB, "", metadata);
                        logger.info(`dataService.createDocument completed for ${objectId}.`);

                        logger.info(`Blob ${objectId} metadata saved for user ${userDid}`);
                        set.status = 201; // Created
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
                    // Restore body schema validation
                    body: BlobUploadBodySchema,
                    detail: { summary: "Upload a blob (requires 'write:blobs' permission)" },
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

                    try {
                        // 1. Fetch Metadata
                        logger.debug(`Attempting to fetch metadata for objectId: ${objectId} from DB: ${SYSTEM_DB}`);
                        const metadata = (await dataService.getDocument(SYSTEM_DB, objectId)) as BlobMetadata; // Cast to expected type
                        logger.debug(`Successfully fetched metadata for objectId: ${objectId}`, metadata); // Log successful fetch

                        // 2. Permission Check (Owner OR 'read:blobs')
                        const isOwner = metadata.ownerDid === userDid;
                        logger.debug(`Permission check: isOwner=${isOwner}, userDid=${userDid}, metadata.ownerId=${metadata.ownerDid}`);
                        const canRead = await permissionService.can(userDid, "read:blobs");
                        logger.debug(`Permission check: canRead=${canRead} for permission 'read:blobs'`);

                        if (!isOwner && !canRead) {
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
                        if (error.message.includes("not found")) {
                            logger.warn(`Download request for non-existent blob ${objectId} by user ${userDid}`);
                            throw new NotFoundError(`Blob metadata not found for ID: ${objectId}`);
                        }
                        if (error.message.includes("Object not found")) {
                            logger.warn(`Download request for blob ${objectId} (metadata found, but object missing in Minio) by user ${userDid}`);
                            throw new NotFoundError(`Blob object not found in storage for ID: ${objectId}`);
                        }
                        logger.error(`Failed to generate download URL for blob ${objectId}, user ${userDid}:`, error);
                        throw new InternalServerError("Failed to generate download URL.");
                    }
                },
                {
                    params: t.Object({ objectId: t.String() }),
                    // Only define the success response schema. Errors are handled by setting status/returning error object or throwing.
                    response: { 200: BlobDownloadResponseSchema, 403: ErrorResponseSchema },
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

                if (!payload || typeof payload.userDid !== "string") {
                    logger.warn("Fetch WS: Token payload invalid or missing 'userDid' string field.");
                    return new Response("Invalid token payload", { status: 401 });
                }

                const userDid = payload.userDid;
                logger.debug(`Fetch WS: Token verified successfully for user: ${userDid}`);

                // --- Attempt Upgrade ---
                const success = server.upgrade(req, {
                    // Attach the verified userDid to the WebSocket context
                    data: { userDid: userDid },
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

export type App = typeof app; // Export the app type for Eden client
