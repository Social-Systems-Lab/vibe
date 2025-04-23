// index.ts
import { Elysia, t, NotFoundError, InternalServerError, type Static } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { dataService, type ReadResult } from "./services/data.service";
import { permissionService } from "./services/permission.service";
import { blobService, BlobService } from "./services/blob.service";
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
    BlobDownloadResponseSchema,
    BlobUploadBodySchema,
    CLAIM_CODES_COLLECTION,
    DeleteParamsSchema,
    ErrorResponseSchema,
    GenericDataDocumentSchema,
    JWTPayloadSchema,
    ReadPayloadSchema,
    UpdateDataPayloadSchema,
    WritePayloadSchema,
    type BlobMetadata,
    type ClaimCode,
    type WebSocketAuthContext,
} from "./models/models";
import { SYSTEM_DB, USER_DB_PREFIX } from "./utils/constants";
import { AuthService } from "./services/auth.service";

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
                    await dataService.updateDocument(SYSTEM_DB, "", claimDoc._id, claimDoc._rev!, updatedClaimData);
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
                            // Ensure payload is valid
                            user = payload as { userDid: string };
                        }
                    } catch (error) {
                        logger.debug("JWT verification failed in derive");
                        user = null; // Invalid JWT
                    }
                }
                return { user, appId }; // Return both derived values
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

                // Determine required permission based on action/collection
                let requiredPermission: string | null = null;
                const path = new URL(request.url).pathname;

                // Body might not be parsed/validated yet in onBeforeHandle, safer to parse manually if needed
                // For now, assume body will be validated by the route handler, but we need collection for permission check.
                // This is tricky. A better approach might be to put permission check *after* body validation.
                // Let's try extracting collection from body *if possible* but handle failure.
                let collection: string | null = null;
                try {
                    // Attempt to access collection from body if it's an object
                    if (typeof body === "object" && body !== null && "collection" in body && typeof body.collection === "string") {
                        collection = body.collection;
                    }
                } catch (e) {
                    logger.warn("Could not access collection from body in onBeforeHandle");
                }

                if (!collection) {
                    // If collection isn't available here, we cannot check permission yet.
                    // Let the route handler proceed, validation will fail if collection is missing there.
                    // This means permission check effectively happens *after* validation.
                    // Alternative: Move permission check into the route handler itself.
                    // Let's proceed for now, assuming validation handles missing collection.
                    logger.debug(`Collection not available in onBeforeHandle for user ${user.userDid}, app ${appId}. Deferring permission check.`);
                    return; // Proceed to handler
                }

                // Determine required permission string
                if (path.endsWith("/read")) {
                    requiredPermission = `read:${collection}`;
                } else if (path.endsWith("/write")) {
                    requiredPermission = `write:${collection}`;
                } else {
                    set.status = 400; // Or 404?
                    logger.warn(`Data API access denied for user ${user.userDid}, app ${appId}: Invalid endpoint path ${path}`);
                    return { error: "Invalid data operation endpoint." };
                }

                // *** Perform the App Permission Check ***
                const isAllowed = await permissionService.canAppActForUser(user.userDid, appId, requiredPermission);

                if (!isAllowed) {
                    logger.warn(`Permission denied for app '${appId}' acting for user '${user.userDid}' on action '${requiredPermission}'`);
                    set.status = 403; // Forbidden
                    return { error: `Forbidden: Application does not have permission '${requiredPermission}' for this user.` };
                }

                logger.debug(`Permission granted for app '${appId}' acting for user '${user.userDid}' on action '${requiredPermission}'`);
                // Proceed to the handler
            })
            // POST /api/v1/data/read - Read documents from a collection
            .post(
                "/read",
                async ({ dataService, user, body }) => {
                    // user is guaranteed non-null by onBeforeHandle
                    const { userDid } = user!;
                    const { collection, filter } = body;
                    const userDbName = `${USER_DB_PREFIX}${userDid}`;

                    logger.debug(`Executing readOnce for user ${userDid}, db: ${userDbName}, collection: ${collection}, filter: ${JSON.stringify(filter)}`);

                    // Use dataService.readOnce
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
                async ({ dataService, user, body, set }) => {
                    // user is guaranteed non-null by onBeforeHandle
                    const { userDid } = user!;
                    const { collection, data } = body;
                    const userDbName = `${USER_DB_PREFIX}${userDid}`;

                    logger.debug(
                        `Executing write for user ${userDid}, db: ${userDbName}, collection: ${collection}, data: ${
                            Array.isArray(data) ? `Array[${data.length}]` : "Object"
                        }`
                    );

                    // Use dataService.write
                    const response = await dataService.write(userDbName, collection, data);

                    // Determine status code based on response type (single vs bulk)
                    // Nano bulk response is an array, single insert is an object
                    if (Array.isArray(response)) {
                        // Bulk response - check for errors within the array
                        const hasErrors = response.some((item) => item.error);
                        set.status = hasErrors ? 207 : 200; // 207 Multi-Status if errors, 200 OK otherwise
                    } else {
                        // Single insert response
                        set.status = response.ok ? 200 : 500; // 200 OK or 500 if !ok (should be caught by service)
                    }

                    // Return the raw CouchDB response(s)
                    return response;
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
            const appId = url.searchParams.get("appId");

            if (!token) {
                logger.warn("Fetch WS: No token provided in query string.");
                return new Response("Missing authentication token", { status: 401 });
            }
            if (!appId) {
                logger.warn("Fetch WS: Missing 'appId' query parameter.");
                return new Response("Missing application identifier", { status: 400 });
            }

            // --- MANUAL JWT Verification ---
            try {
                const { payload } = await jose.jwtVerify(token, secretKey);
                if (!payload || typeof payload.userDid !== "string") {
                    logger.warn("Fetch WS: Token payload invalid or missing 'userDid'.");
                    return new Response("Invalid token payload", { status: 401 });
                }

                const userDid = payload.userDid;
                logger.debug(`Fetch WS: Token verified successfully for user: ${userDid}`);

                // --- Attempt Upgrade ---
                const success = server.upgrade(req, {
                    // Attach the verified userDid to the WebSocket context
                    data: { userDid: userDid, appId: appId } satisfies WebSocketAuthContext,
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
