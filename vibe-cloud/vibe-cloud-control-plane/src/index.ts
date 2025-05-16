import { Elysia, t, NotFoundError, InternalServerError, type Static } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { dataService, DataService } from "./services/data.service"; // Import service instance and type
import { AuthService } from "./services/auth.service";
import { PermissionService } from "./services/permission.service";
import { logger } from "./utils/logger";
import { spawn } from "child_process";
import path from "path";
import { Buffer } from "buffer";
import type { Server } from "bun";
import type * as nano from "nano";
import * as jose from "jose";
import { ed25519FromDid } from "./utils/identity.utils";
import { verify } from "@noble/ed25519";
import {
    AdminClaimSchema,
    CLAIM_CODES_COLLECTION,
    ErrorResponseSchema,
    JWTPayloadSchema,
    // ProvisionRequestSchema, // Old admin-only schema, removed from models
    ProvisionInstanceRequestSchema, // New user-driven schema
    ProvisionInstanceResponseSchema,
    InstanceStatusResponseSchema,
    InternalProvisionUpdateRequestSchema,
    IdentityStatusResponseSchema, // Added for identity recovery
    IdentityMetadataResponseSchema, // Added for identity recovery
    UpdateProfileRequestSchema, // Added for profile updates
    INSTANCES_COLLECTION, // For the new collection
    type ClaimCode,
    type UpdateProfileRequest, // Added for profile updates
    type User,
    type Instance,
    type IdentityStatusResponse, // Added for identity recovery
    type IdentityMetadataResponse, // Added for identity recovery
    UserSchema, // For response of profile update
} from "./models/models";
import { SYSTEM_DB, USERS_COLLECTION } from "./utils/constants";
import { randomUUID } from "crypto"; // For generating instanceIdentifier

// Environment Variable Validation
const jwtSecret = process.env.JWT_SECRET;
// if (!jwtSecret) {
//     logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
//     throw new Error("JWT_SECRET environment variable not configured.");
if (!jwtSecret) {
    logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
    throw new Error("JWT_SECRET environment variable not configured.");
}
const secretKey = new TextEncoder().encode(jwtSecret);

// Service Initialization & DB Setup
await dataService.connect();
await dataService.ensureDatabaseExists(SYSTEM_DB);
const permissionService = new PermissionService(dataService);
// Note: AuthService in control plane doesn't need blobService
const authService = new AuthService(dataService, permissionService);

// Initial Admin Claim Code Bootstrap
try {
    await authService.ensureInitialAdminClaimCode();
} catch (error) {
    logger.error("CRITICAL: Failed to ensure initial admin claim code:", error);
}
// --- End Initial Admin Claim Code Bootstrap ---

export const app = new Elysia()
    .decorate("dataService", dataService)
    .decorate("authService", authService)
    .decorate("permissionService", permissionService)
    // Add CORS Middleware (adjust origin as needed for control plane access)
    .use(
        cors({
            origin: "*", // Allow all for now, restrict in production
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization"],
            credentials: true,
            preflight: true,
        })
    )
    // Add JWT Middleware
    .use(
        jwt({
            name: "jwt",
            secret: jwtSecret,
            schema: JWTPayloadSchema, // Use schema for validation
        })
    )
    .onError(({ code, error, set }) => {
        // Basic error handling - check if it's an actual Error object
        if (error instanceof Error) {
            logger.error(`[${code}] Error: ${error.message}`, error.stack);
        } else {
            // Log the raw error object if it's not an Error instance
            logger.error(`[${code}] Non-Error thrown:`, error);
        }
        // Handle specific errors like NotFoundError, InternalServerError if needed
        if (error instanceof NotFoundError) {
            set.status = 404;
            return { error: error.message || "Resource not found." };
        }
        if (error instanceof InternalServerError) {
            logger.error(`[${code}] Internal Server Error: ${error.message}`, error.stack);
            set.status = 500;
            return { error: "An internal server error occurred." };
        }
        // Add more specific error handling based on control plane needs

        set.status = 500;
        return { error: "An internal server error occurred." };
    })
    .get("/health", () => ({
        status: "ok",
        service: "control-plane",
        version: process.env.APP_VERSION || "unknown",
    }))
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
                        limit: 1,
                    };
                    const response = await dataService.findDocuments<ClaimCode>(SYSTEM_DB, query);

                    if (!response.docs || response.docs.length === 0) {
                        logger.warn(`Claim attempt failed: No claim code found matching '${claimCode}'`);
                        set.status = 400;
                        return { error: "Invalid or unknown claim code." };
                    }
                    if (response.docs.length > 1) {
                        logger.error(`CRITICAL: Multiple claim documents found for code '${claimCode}'!`);
                        set.status = 500;
                        return { error: "Internal server error: Duplicate claim code detected." };
                    }
                    claimDoc = response.docs[0] as ClaimCode;
                    logger.debug(`Found claim document: ${claimDoc._id}`);
                } catch (error: any) {
                    logger.error(`Error finding claim code '${claimCode}':`, error);
                    if (error instanceof NotFoundError || error.message?.includes("not found")) {
                        set.status = 400;
                        return { error: "Invalid or unknown claim code." };
                    }
                    set.status = 500;
                    return { error: "Internal server error while verifying claim code." };
                }

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
                    const publicKeyBytes = ed25519FromDid(did);
                    const signatureBytes = Buffer.from(signature, "base64");
                    const messageBytes = new TextEncoder().encode(claimCode);

                    const isSignatureValid = await verify(signatureBytes, messageBytes, publicKeyBytes);
                    if (!isSignatureValid) {
                        logger.warn(`Claim attempt failed: Invalid signature for claim code '${claimDoc._id}' and DID ${did}`);
                        set.status = 400;
                        return { error: "Invalid signature." };
                    }
                    logger.debug(`Signature verified successfully for claim code '${claimDoc._id}' and DID ${did}`);
                } catch (error: any) {
                    logger.error(`Error during signature verification for claim code '${claimDoc._id}', DID ${did}:`, error);
                    set.status = 400;
                    return { error: `Signature verification failed: ${error.message}` };
                }

                // 4. Mark claim code as spent (conditionally based on environment)
                const nowISO = new Date().toISOString();
                const updatedClaimData = {
                    ...claimDoc,
                    spentAt: nowISO,
                    claimedByDid: did,
                };

                if (process.env.NODE_ENV === "production" || claimCode !== process.env.ADMIN_CLAIM_CODE) {
                    logger.info(`Production environment or non-default code. Marking claim code '${claimDoc._id}' as spent.`);
                    try {
                        await dataService.updateDocument(SYSTEM_DB, CLAIM_CODES_COLLECTION, claimDoc._id!, claimDoc._rev!, updatedClaimData);
                        logger.info(`Claim code '${claimDoc._id}' successfully marked as spent by DID ${did}.`);
                    } catch (error: any) {
                        logger.error(`Failed to mark claim code '${claimDoc._id}' as spent:`, error);
                        if (error.message?.includes("Revision conflict") || error.statusCode === 409) {
                            set.status = 409;
                            return { error: "Claim code was spent by another request. Please try again if you have another code." };
                        }
                        set.status = 500;
                        return { error: "Internal server error while updating claim code status." };
                    }
                } else {
                    logger.warn(`NODE_ENV is not 'production'. Skipping marking default claim code '${claimDoc._id}' as spent.`);
                }

                // 5. Ensure Admin User Exists (Create if necessary)
                const userDid = did;
                let user: User | null = null;
                try {
                    user = await dataService.getDocument<User>(SYSTEM_DB, `${USERS_COLLECTION}/${userDid}`);
                    logger.info(`Admin user ${userDid} already exists.`);
                } catch (fetchError: any) {
                    if (fetchError instanceof NotFoundError) {
                        logger.info(`Admin user ${userDid} not found. Creating user via AuthService...`);
                        try {
                            user = await authService.createAdminUserFromDid(userDid);
                            logger.info(`Admin user ${userDid} created successfully via claim.`);
                        } catch (createError: any) {
                            logger.error(`Failed to create admin user ${userDid} after successful claim:`, createError);
                            set.status = 500;
                            return { error: "Claim successful, but failed to create admin user account. Please contact support." };
                        }
                    } else {
                        logger.error(`Error checking for existing admin user ${userDid}:`, fetchError);
                        set.status = 500;
                        return { error: "Internal server error while checking user status." };
                    }
                }

                if (!user) {
                    logger.error(`User object for ${userDid} is null after creation/fetch attempt.`);
                    set.status = 500;
                    return { error: "Internal server error processing user account." };
                }

                // 6. Generate JWT for the claimed user DID
                let token;
                try {
                    token = await jwt.sign({ userDid: userDid });
                    logger.debug(`JWT generated for claimed admin user ${userDid}`);
                } catch (error: any) {
                    logger.error(`Failed to sign JWT for claimed admin user ${userDid}:`, error);
                    set.status = 500;
                    return { error: "Claim successful, but failed to generate session token. Please try logging in." };
                }

                // 7. Return success response
                set.status = 201;
                return {
                    message: "Admin account claimed successfully.",
                    userDid: userDid,
                    isAdmin: true,
                    token: token,
                };
            },
            {
                body: AdminClaimSchema,
                detail: { summary: "Claim an admin account using a DID, claim code, and signature." },
            }
        )
    )
    // --- New User-Driven Provisioning Routes ---
    .group("/api/v1/provision", (group) =>
        group
            // POST /api/v1/provision/instance - User requests a new instance
            .post(
                "/instance",
                async ({ authService, dataService, body, set }) => {
                    const { did, nonce, timestamp, signature, profileName, profilePictureUrl } = body; // Extract profile fields
                    logger.info(`Instance provisioning request received for DID: ${did}, Nonce: ${nonce}, ProfileName: ${profileName}`);

                    // 1. Verify Signature
                    const isSignatureValid = await authService.verifyDidSignature(did, nonce, timestamp, signature);
                    if (!isSignatureValid) {
                        set.status = 401;
                        return { error: "Invalid signature or authentication failed." };
                    }

                    // 2. Check Timestamp Window (e.g., +/- 5 minutes)
                    const requestTime = new Date(timestamp);
                    const now = new Date();
                    const fiveMinutes = 5 * 60 * 1000;
                    if (Math.abs(now.getTime() - requestTime.getTime()) > fiveMinutes) {
                        logger.warn(`Request timestamp ${timestamp} for DID ${did} is outside the valid window.`);
                        set.status = 400;
                        return { error: "Request timestamp is invalid or expired." };
                    }

                    // 3. Generate Instance Identifier (e.g., based on DID hash or UUID)
                    // For simplicity, using a UUID for now. Ensure it's K8s/DNS compliant if used directly.
                    // A more stable identifier might be `vibe-u-${did.substring(did.lastIndexOf(':') + 1).slice(0, 12)}`
                    const instanceIdentifier = `vibe-${randomUUID().substring(0, 18)}`; // Example: vibe-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed (shortened)

                    // 4. Check for existing instance request with this DID and Nonce to prevent replay
                    try {
                        const existingInstanceQuery: nano.MangoQuery = {
                            selector: {
                                collection: INSTANCES_COLLECTION,
                                userDid: did,
                                "requestDetails.nonce": nonce,
                            },
                            limit: 1,
                        };
                        const existingRequests = await dataService.findDocuments<Instance>(SYSTEM_DB, existingInstanceQuery);
                        if (existingRequests.docs && existingRequests.docs.length > 0) {
                            logger.warn(`Replay attempt for DID ${did} with nonce ${nonce}. Instance already processed: ${existingRequests.docs[0]._id}`);
                            set.status = 409; // Conflict
                            return { error: "This provisioning request (nonce) has already been processed." };
                        }
                    } catch (error: any) {
                        logger.error(`Error checking for existing instance request for DID ${did}, nonce ${nonce}:`, error);
                        set.status = 500;
                        return { error: "Internal server error while validating request." };
                    }

                    // 5. Create User Record (Tier 0)
                    try {
                        await authService.provisionNewUser(did, instanceIdentifier, profileName, profilePictureUrl); // Pass profile fields
                    } catch (error: any) {
                        logger.error(`Failed to create user record for DID ${did}, instance ${instanceIdentifier}:`, error);
                        // Handle specific errors like user already exists with a different instance if needed
                        if (error.message?.includes("already exists")) {
                            set.status = 409; // Conflict
                            return { error: error.message };
                        }
                        set.status = 500;
                        return { error: "Failed to initialize user for provisioning." };
                    }

                    // 6. Create "pending" Instance Record
                    const nowISO = new Date().toISOString();
                    const newInstanceRecord: Omit<Instance, "_rev"> = {
                        _id: `${INSTANCES_COLLECTION}/${instanceIdentifier}`,
                        userDid: did,
                        status: "pending",
                        createdAt: nowISO,
                        requestDetails: { nonce, timestamp },
                        collection: INSTANCES_COLLECTION,
                    };
                    try {
                        await dataService.createDocument(SYSTEM_DB, INSTANCES_COLLECTION, newInstanceRecord);
                        logger.info(`Instance record ${INSTANCES_COLLECTION}/${instanceIdentifier} created for DID ${did} with status 'pending'.`);
                    } catch (error: any) {
                        logger.error(`Failed to create instance record for ${INSTANCES_COLLECTION}/${instanceIdentifier}:`, error);
                        set.status = 500;
                        return { error: "Failed to record provisioning request." };
                    }

                    // 7. Asynchronously Trigger Provisioning Script/Process
                    // TODO: Implement the actual call to a modified provision.sh or K8s client logic
                    const scriptPath = path.resolve(process.cwd(), "../vibe-cloud-infra/provisioning/provision.sh");
                    // The CWD for the script should be where it can find the Helm chart, e.g., `vibe-cloud-infra`
                    const scriptCwd = path.resolve(process.cwd(), "../vibe-cloud-infra");

                    // DIAGNOSTIC: Check if scriptCwd actually exists
                    const fs = await import("node:fs"); // Dynamically import fs
                    logger.info(`[DIAGNOSTIC] Resolved scriptCwd: ${scriptCwd}`);
                    logger.info(`[DIAGNOSTIC] Does scriptCwd (${scriptCwd}) exist? ${fs.existsSync(scriptCwd)}`);

                    logger.info(`Executing provisioning script: ${scriptPath} in cwd: ${scriptCwd} for instance ${instanceIdentifier}`);

                    const controlPlaneBaseUrl = process.env.CONTROL_PLANE_BASE_URL || `http://localhost:${process.env.CONTROL_PLANE_PORT || 3001}`;

                    const provisionEnv = {
                        ...process.env, // Pass existing env vars
                        TARGET_USER_DID: did,
                        INSTANCE_IDENTIFIER: instanceIdentifier,
                        CONTROL_PLANE_URL: controlPlaneBaseUrl,
                        INTERNAL_SECRET_TOKEN: process.env.INTERNAL_SECRET_TOKEN || "dev-secret-token", // Use a proper secret in prod
                        // KUBECONFIG_PATH: process.env.KUBECONFIG_PATH, // Optional, if set in CP env
                    };

                    // Remove undefined keys from env, spawn doesn't like them
                    Object.keys(provisionEnv).forEach((key) => (provisionEnv as any)[key] === undefined && delete (provisionEnv as any)[key]);

                    const provisionProcess = spawn("/usr/bin/bash", [scriptPath], {
                        // Using absolute path
                        cwd: scriptCwd,
                        env: provisionEnv,
                        stdio: ["ignore", "pipe", "pipe"], // ignore stdin, pipe stdout/stderr
                        detached: true, // Run independently of the parent
                    });

                    provisionProcess.unref(); // Allow parent to exit independently

                    provisionProcess.stdout.on("data", (data) => {
                        logger.info(`[Provision STDOUT - ${instanceIdentifier}]: ${data.toString().trim()}`);
                    });

                    provisionProcess.stderr.on("data", (data) => {
                        logger.error(`[Provision STDERR - ${instanceIdentifier}]: ${data.toString().trim()}`);
                    });

                    provisionProcess.on("close", async (code) => {
                        logger.info(`Provisioning script for instance '${instanceIdentifier}' exited with code ${code}.`);
                        // If script exits non-zero *before* calling back, it's an early failure.
                        if (code !== 0) {
                            try {
                                const docIdToFetch = `${INSTANCES_COLLECTION}/${instanceIdentifier}`;
                                const instanceDoc = await dataService.getDocument<Instance>(SYSTEM_DB, docIdToFetch);
                                // Only update to failed if it's still pending/provisioning, to avoid overwriting a "completed" status from a successful callback
                                if (instanceDoc && (instanceDoc.status === "pending" || instanceDoc.status === "provisioning")) {
                                    const updatedFields: Partial<Instance> = {
                                        status: "failed",
                                        updatedAt: new Date().toISOString(),
                                        errorDetails: `Provisioning script exited with code ${code}. Check script logs.`,
                                    };
                                    try {
                                        await dataService.updateDocument(SYSTEM_DB, INSTANCES_COLLECTION, instanceDoc._id!, instanceDoc._rev!, {
                                            // _id here is already prefixed
                                            ...instanceDoc,
                                            ...updatedFields,
                                        });
                                    } catch (updateError: any) {
                                        if (updateError.message === "Revision conflict") {
                                            logger.warn(`Revision conflict on updating instance ${docIdToFetch} to failed (script close), retrying...`);
                                            const freshInstanceDoc = await dataService.getDocument<Instance>(SYSTEM_DB, docIdToFetch);
                                            await dataService.updateDocument(SYSTEM_DB, INSTANCES_COLLECTION, freshInstanceDoc._id!, freshInstanceDoc._rev!, {
                                                ...freshInstanceDoc,
                                                ...updatedFields,
                                            });
                                        } else {
                                            throw updateError;
                                        }
                                    }
                                    logger.error(`Instance ${docIdToFetch} marked as 'failed' due to script exit code ${code}.`);
                                }
                            } catch (dbError) {
                                logger.error(
                                    `Failed to update instance ${INSTANCES_COLLECTION}/${instanceIdentifier} status after script error (exit code ${code}):`,
                                    dbError
                                );
                            }
                        }
                    });

                    provisionProcess.on("error", async (err: NodeJS.ErrnoException) => {
                        // Added type for err
                        logger.error(`Failed to start provisioning script for instance '${instanceIdentifier}':`, err);
                        // If the error is a spawn error (like ENOENT), on('close') will also fire with a non-zero exit code.
                        // Let on('close') handle the DB update to "failed" in such cases to avoid race conditions/conflicts.
                        // We will only attempt a DB update here if it's an error from a *running* process,
                        // though for simple script spawn, 'error' usually means it failed to start.
                        // For ENOENT, err.code will be 'ENOENT'.
                        if (err.code !== "ENOENT") {
                            // Potentially handle other types of errors from a running process if necessary,
                            // but for now, primary failure updates are via on('close').
                            // This block can be expanded if other 'error' event scenarios need DB updates.
                            logger.warn(
                                `Provisioning process for '${instanceIdentifier}' emitted error (not ENOENT, might need specific handling): ${err.message}`
                            );
                        }
                        // The 'close' event will still fire and handle setting the status to 'failed'.
                    });

                    // Update status to 'provisioning' immediately after attempting to spawn
                    try {
                        const docIdToFetch = `${INSTANCES_COLLECTION}/${instanceIdentifier}`;
                        const pendingDoc = await dataService.getDocument<Instance>(SYSTEM_DB, docIdToFetch);
                        if (pendingDoc && pendingDoc.status === "pending") {
                            // Ensure it's still pending
                            const updatedDoc: Partial<Instance> = { status: "provisioning", updatedAt: new Date().toISOString() };
                            await dataService.updateDocument(SYSTEM_DB, INSTANCES_COLLECTION, pendingDoc._id!, pendingDoc._rev!, {
                                ...pendingDoc,
                                ...updatedDoc,
                            });
                            logger.info(`Instance ${docIdToFetch} status updated to 'provisioning'.`);
                        }
                    } catch (err) {
                        logger.error(`Error updating instance ${INSTANCES_COLLECTION}/${instanceIdentifier} to 'provisioning':`, err);
                        // If this fails, the instance record might remain 'pending'. The script callback should eventually correct it.
                    }

                    set.status = 202; // Accepted
                    return {
                        message: "Provisioning request accepted and initiated.",
                        instanceIdentifier: instanceIdentifier,
                    };
                },
                {
                    body: ProvisionInstanceRequestSchema,
                    response: {
                        202: ProvisionInstanceResponseSchema,
                        400: ErrorResponseSchema,
                        401: ErrorResponseSchema,
                        409: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "User requests provisioning of a new Vibe Cloud instance." },
                }
            )
            // GET /api/v1/provision/status/:instanceIdentifier - User checks status
            .get(
                "/status/:instanceIdentifier",
                async ({ dataService, params, set }) => {
                    const { instanceIdentifier } = params;
                    try {
                        const docIdToFetch = `${INSTANCES_COLLECTION}/${instanceIdentifier}`;
                        const instanceDoc = await dataService.getDocument<Instance>(SYSTEM_DB, docIdToFetch);
                        if (!instanceDoc) {
                            set.status = 404;
                            return { error: "Instance not found." };
                        }
                        const response: Static<typeof InstanceStatusResponseSchema> = {
                            instanceIdentifier: instanceDoc._id!,
                            userDid: instanceDoc.userDid,
                            status: instanceDoc.status,
                            instanceUrl: instanceDoc.instanceUrl,
                            createdAt: instanceDoc.createdAt,
                            updatedAt: instanceDoc.updatedAt,
                            errorDetails: instanceDoc.errorDetails,
                        };
                        return response;
                    } catch (error: any) {
                        if (error instanceof NotFoundError || error.message?.includes("not found")) {
                            set.status = 404;
                            return { error: "Instance not found." };
                        }
                        logger.error(`Error fetching status for instance ${instanceIdentifier}:`, error);
                        set.status = 500;
                        return { error: "Internal server error." };
                    }
                },
                {
                    params: t.Object({ instanceIdentifier: t.String() }),
                    response: { 200: InstanceStatusResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
                    detail: { summary: "Get the provisioning status of a Vibe Cloud instance." },
                }
            )
    )
    // --- Internal Callback Route for Provisioning Updates ---
    .group("/api/v1/internal", (group) =>
        group
            // TODO: Add security middleware for this internal route (e.g., IP whitelist, secret token)
            .onBeforeHandle(async ({ request, set }) => {
                const internalAuthToken = process.env.INTERNAL_SECRET_TOKEN;
                const requestToken = request.headers.get("authorization")?.replace("Bearer ", "");
                if (!internalAuthToken || !requestToken || requestToken !== internalAuthToken) {
                    logger.warn("Unauthorized attempt to access internal provisioning update endpoint.");
                    set.status = 401;
                    return { error: "Unauthorized." };
                }
            })
            .post(
                "/provision/update",
                async ({ dataService, body, set }) => {
                    const { instanceIdentifier, status, url, error: errorMsg } = body;
                    logger.info(`Internal provision update for ${instanceIdentifier}: status=${status}, url=${url}, error=${errorMsg}`);

                    try {
                        const docIdToUpdate = `${INSTANCES_COLLECTION}/${instanceIdentifier}`;
                        const instanceDoc = await dataService.getDocument<Instance>(SYSTEM_DB, docIdToUpdate);
                        if (!instanceDoc) {
                            logger.error(`Instance ${docIdToUpdate} not found for internal update.`);
                            set.status = 404; // Or 400 if this should always exist
                            return { error: "Instance to update not found." };
                        }

                        const updatedFields: Partial<Instance> = {
                            status,
                            updatedAt: new Date().toISOString(),
                        };
                        if (status === "completed" && url) {
                            updatedFields.instanceUrl = url;
                        } else if (status === "failed" && errorMsg) {
                            updatedFields.errorDetails = errorMsg;
                        } else if (status === "completed" && !url) {
                            logger.error(`Internal update for ${docIdToUpdate} to 'completed' but missing URL.`);
                            set.status = 400;
                            return { error: "Completed status requires a URL." };
                        }

                        await dataService.updateDocument(SYSTEM_DB, INSTANCES_COLLECTION, instanceDoc._id!, instanceDoc._rev!, {
                            ...instanceDoc,
                            ...updatedFields,
                        });
                        logger.info(`Instance ${docIdToUpdate} updated to status '${status}'.`);
                        set.status = 200;
                        return { message: "Instance status updated." };
                    } catch (error: any) {
                        if (error instanceof NotFoundError || error.message?.includes("not found")) {
                            set.status = 404;
                            return { error: "Instance to update not found." };
                        }
                        logger.error(`Error updating instance ${INSTANCES_COLLECTION}/${instanceIdentifier} via internal callback:`, error);
                        set.status = 500;
                        return { error: "Internal server error during update." };
                    }
                },
                {
                    body: InternalProvisionUpdateRequestSchema,
                    response: {
                        200: t.Object({ message: t.String() }),
                        400: ErrorResponseSchema,
                        401: ErrorResponseSchema,
                        404: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Internal callback to update the status of a provisioning process." },
                }
            )
    )
    // --- Identity Recovery Routes ---
    .group("/api/v1/identity", (group) =>
        group
            // GET /api/v1/identity/:did/status - Check if a DID is active/known
            .get(
                "/:did/status",
                async ({ dataService, params, set }) => {
                    const { did } = params;
                    try {
                        // A DID is "active" if a user record exists for it.
                        await dataService.getDocument<User>(SYSTEM_DB, `${USERS_COLLECTION}/${did}`);
                        // If getDocument doesn't throw, the user exists.
                        const response: IdentityStatusResponse = { isActive: true };
                        return response;
                    } catch (error: any) {
                        if (error instanceof NotFoundError || error.message?.includes("not found")) {
                            // User not found, so DID is not active in this control plane.
                            const response: IdentityStatusResponse = { isActive: false };
                            return response;
                        }
                        logger.error(`Error checking status for DID ${did}:`, error);
                        set.status = 500;
                        return { error: "Internal server error while checking DID status." };
                    }
                },
                {
                    params: t.Object({ did: t.String() }),
                    response: {
                        200: IdentityStatusResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Check if a DID is known and active in the control plane." },
                }
            )
            // GET /api/v1/identity/:did - Get metadata for a DID (protected)
            .get(
                "/:did",
                async ({ authService, dataService, params, request, set }) => {
                    const { did } = params;
                    const authHeader = request.headers.get("Authorization");

                    if (!authHeader || !authHeader.startsWith("VibeAuth ")) {
                        set.status = 401;
                        return { error: "Missing or invalid Authorization header." };
                    }

                    // Parse VibeAuth header: VibeAuth did="...",nonce="...",timestamp="...",signature="..."
                    const authParams = authHeader
                        .substring("VibeAuth ".length)
                        .split(",")
                        .reduce((acc, part) => {
                            const [key, value] = part.trim().split("=");
                            if (key && value) {
                                acc[key] = value.replace(/"/g, "");
                            }
                            return acc;
                        }, {} as Record<string, string>);

                    const { did: authDid, nonce, timestamp, signature } = authParams;

                    if (authDid !== did) {
                        set.status = 401;
                        return { error: "Authorization DID does not match path DID." };
                    }
                    if (!nonce || !timestamp || !signature) {
                        set.status = 400;
                        return { error: "Missing nonce, timestamp, or signature in Authorization header." };
                    }

                    // 1. Verify Signature (using authService.verifyDidSignature)
                    const isSignatureValid = await authService.verifyDidSignature(did, nonce, timestamp, signature);
                    if (!isSignatureValid) {
                        set.status = 401;
                        return { error: "Invalid signature or authentication failed." };
                    }

                    // 2. Check Timestamp Window (e.g., +/- 5 minutes from authService or define here)
                    const requestTime = new Date(timestamp);
                    const now = new Date();
                    const fiveMinutes = 5 * 60 * 1000;
                    if (Math.abs(now.getTime() - requestTime.getTime()) > fiveMinutes) {
                        logger.warn(`Request timestamp ${timestamp} for DID ${did} (metadata) is outside the valid window.`);
                        set.status = 400;
                        return { error: "Request timestamp is invalid or expired." };
                    }

                    // 3. Prevent Nonce Replay (Conceptual - requires storing used nonces)
                    // For this phase, we'll log it. A robust implementation needs a nonce store.
                    // Example: await authService.checkAndStoreNonce(did, nonce);
                    logger.info(`Nonce received for DID ${did}: ${nonce}. Nonce replay check would occur here.`);

                    try {
                        // Fetch User to get instanceId
                        const user = await dataService.getDocument<User>(SYSTEM_DB, `${USERS_COLLECTION}/${did}`);
                        if (!user || !user.instanceId) {
                            set.status = 404;
                            return { error: "User or associated instance not found for this DID." };
                        }

                        // Fetch Instance to get instanceUrl
                        const instance = await dataService.getDocument<Instance>(SYSTEM_DB, `${INSTANCES_COLLECTION}/${user.instanceId}`);
                        if (!instance || instance.status !== "completed") {
                            set.status = 404;
                            return { error: "Instance not found or not in a completed state." };
                        }

                        const response: IdentityMetadataResponse = {
                            did: user.userDid,
                            instanceUrl: instance.instanceUrl,
                            profileName: user.profileName, // Populate from User document
                            profilePictureUrl: user.profilePictureUrl, // Populate from User document
                        };
                        return response;
                    } catch (error: any) {
                        if (error instanceof NotFoundError || error.message?.includes("not found")) {
                            set.status = 404;
                            return { error: "Identity metadata not found." };
                        }
                        logger.error(`Error fetching metadata for DID ${did}:`, error);
                        set.status = 500;
                        return { error: "Internal server error while fetching identity metadata." };
                    }
                },
                {
                    params: t.Object({ did: t.String() }),
                    response: {
                        200: IdentityMetadataResponseSchema,
                        400: ErrorResponseSchema,
                        401: ErrorResponseSchema,
                        403: ErrorResponseSchema, // For future permission checks if any
                        404: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Get metadata for a DID, protected by a signed challenge." },
                }
            )
            // PUT /api/v1/identity/:did/profile - Update profile information for a DID (protected)
            .put(
                "/:did/profile",
                async ({ authService, params, body, request, set }) => {
                    const { did } = params;
                    const { profileName, profilePictureUrl } = body;
                    const authHeader = request.headers.get("Authorization");

                    if (!authHeader || !authHeader.startsWith("VibeAuth ")) {
                        set.status = 401;
                        return { error: "Missing or invalid Authorization header." };
                    }

                    const authParams = authHeader
                        .substring("VibeAuth ".length)
                        .split(",")
                        .reduce((acc, part) => {
                            const [key, value] = part.trim().split("=");
                            if (key && value) {
                                acc[key] = value.replace(/"/g, "");
                            }
                            return acc;
                        }, {} as Record<string, string>);

                    const { did: authDid, nonce, timestamp, signature } = authParams;

                    if (authDid !== did) {
                        set.status = 401;
                        return { error: "Authorization DID does not match path DID." };
                    }
                    if (!nonce || !timestamp || !signature) {
                        set.status = 400;
                        return { error: "Missing nonce, timestamp, or signature in Authorization header." };
                    }

                    const isSignatureValid = await authService.verifyDidSignature(did, nonce, timestamp, signature);
                    if (!isSignatureValid) {
                        set.status = 401;
                        return { error: "Invalid signature or authentication failed." };
                    }

                    const requestTime = new Date(timestamp);
                    const now = new Date();
                    const fiveMinutes = 5 * 60 * 1000;
                    if (Math.abs(now.getTime() - requestTime.getTime()) > fiveMinutes) {
                        logger.warn(`Request timestamp ${timestamp} for DID ${did} (profile update) is outside the valid window.`);
                        set.status = 400;
                        return { error: "Request timestamp is invalid or expired." };
                    }

                    // Nonce replay prevention (logging for now)
                    logger.info(`Nonce received for DID ${did} (profile update): ${nonce}. Nonce replay check would occur here.`);

                    try {
                        const updatedUser = await authService.updateUserProfile(did, profileName, profilePictureUrl);
                        // Return the updated user document, which includes profileName and profilePictureUrl
                        return updatedUser;
                    } catch (error: any) {
                        if (error instanceof NotFoundError) {
                            set.status = 404;
                            return { error: "User not found." };
                        }
                        logger.error(`Error updating profile for DID ${did}:`, error);
                        set.status = 500;
                        return { error: "Internal server error while updating profile." };
                    }
                },
                {
                    params: t.Object({ did: t.String() }),
                    body: UpdateProfileRequestSchema,
                    response: {
                        200: UserSchema, // Return the full User object
                        400: ErrorResponseSchema,
                        401: ErrorResponseSchema,
                        404: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Update profile information for a DID, protected by a signed challenge." },
                }
            )
    );

// Placeholder for WebSocket handler (Control plane likely doesn't need WS)
// const bunWsHandler: WebSocketHandler<any> = { ... };

// Placeholder for Fetch handler (Elysia handles fetch directly now)
// async function fetchHandler(req: Request, server: Server): Promise<Response | undefined> { ... }

// Exportable Server Start Function
export function startServer(port: number = 3001): Server {
    // Use a different default port
    logger.info(`Attempting to start Vibe Cloud Control Plane on port ${port}...`);
    try {
        const server = Bun.serve({
            hostname: "0.0.0.0",
            port: port,
            // websocket: bunWsHandler, // Add back when needed
            fetch: app.fetch, // Use Elysia's fetch directly for now
        });
        logger.info(`🚀 Vibe Cloud Control Plane (Version: ${process.env.APP_VERSION || "unknown"}) started at http://${server.hostname}:${server.port}`);
        return server;
    } catch (error) {
        logger.error(`Failed to start control plane server on port ${port}:`, error);
        throw error;
    }
}

// Start the server
if (import.meta.main) {
    startServer(Number(process.env.CONTROL_PLANE_PORT) || 3001); // Use different env var if needed
}

// Placeholder for exports (Update with actual exports)
export { dataService, authService, permissionService };
export type App = typeof app;
