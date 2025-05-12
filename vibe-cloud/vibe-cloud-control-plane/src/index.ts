import { Elysia, t, NotFoundError, InternalServerError } from "elysia";
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
    ProvisionRequestSchema,
    type ClaimCode,
    type User,
} from "./models/models";
import { SYSTEM_DB, USERS_COLLECTION } from "./utils/constants"; // Import USERS_COLLECTION

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
    .get("/health", () => ({ status: "ok", service: "control-plane" }))
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
    // --- Provisioning Routes (Admin Only) ---
    .group("/api/v1/provision", (group) =>
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
            // Middleware: Check User JWT and Admin status
            .onBeforeHandle(async ({ user, authService, set }) => {
                if (!user) {
                    set.status = 401;
                    return { error: "Unauthorized: Invalid or missing user token." };
                }
                const isAdmin = await authService.isAdmin(user.userDid);
                if (!isAdmin) {
                    set.status = 403;
                    logger.warn(`Provisioning attempt denied for non-admin user: ${user.userDid}`);
                    return { error: "Forbidden: Only administrators can provision new instances." };
                }
                logger.info(`Admin user ${user.userDid} accessing provisioning endpoint.`);
            })
            // POST /api/v1/provision/request - Trigger a new instance provisioning
            .post(
                "/request",
                async ({ user, body, set }) => {
                    const { userDid: requestingAdminDid } = user!;
                    const { targetUserDid, instanceIdentifier } = body;

                    logger.info(
                        `Provisioning request received from admin ${requestingAdminDid} for user ${targetUserDid} with identifier ${instanceIdentifier}`
                    );

                    // --- Execute Provisioning Script ---
                    // Resolve paths relative to the current working directory (vibe-cloud/vibe-cloud-control-plane)
                    const scriptPath = path.resolve(process.cwd(), "../vibe-cloud-infra/provisioning/provision.sh");
                    const terraformDir = path.resolve(process.cwd(), "../vibe-cloud-infra/terraform");

                    logger.info(`Executing provisioning script: ${scriptPath} in cwd: ${terraformDir}`);

                    const provisionProcess = spawn("bash", [scriptPath], {
                        cwd: terraformDir,
                        env: {
                            ...process.env,
                            TARGET_USER_DID: targetUserDid,
                            INSTANCE_IDENTIFIER: instanceIdentifier,
                            // TODO: Securely pass Scaleway credentials
                        },
                        stdio: ["ignore", "pipe", "pipe"],
                    });

                    provisionProcess.stdout.on("data", (data) => {
                        logger.info(`[Provision Script STDOUT - ${instanceIdentifier}]: ${data.toString().trim()}`);
                    });

                    provisionProcess.stderr.on("data", (data) => {
                        logger.error(`[Provision Script STDERR - ${instanceIdentifier}]: ${data.toString().trim()}`);
                    });

                    provisionProcess.on("close", (code) => {
                        if (code === 0) {
                            logger.info(`Provisioning script for instance '${instanceIdentifier}' finished successfully (exit code ${code}).`);
                            // TODO: Post-provisioning steps
                        } else {
                            logger.error(`Provisioning script for instance '${instanceIdentifier}' failed with exit code ${code}.`);
                            // TODO: Failure handling
                        }
                    });

                    provisionProcess.on("error", (err) => {
                        logger.error(`Failed to start provisioning script for instance '${instanceIdentifier}':`, err);
                        // TODO: Handle failure to start
                    });

                    set.status = 202; // Accepted
                    return {
                        message: "Provisioning request accepted and initiated.",
                        instanceIdentifier: instanceIdentifier,
                        targetUserDid: targetUserDid,
                    };
                },
                {
                    body: ProvisionRequestSchema,
                    response: {
                        202: t.Object({
                            message: t.String(),
                            instanceIdentifier: t.String(),
                            targetUserDid: t.String(),
                        }),
                        // Add other potential error responses
                        400: ErrorResponseSchema,
                        401: ErrorResponseSchema,
                        403: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Initiate provisioning of a new Vibe Cloud instance (Admin Only)." },
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
        logger.info(`🚀 Vibe Cloud Control Plane started at http://${server.hostname}:${server.port}`);
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
