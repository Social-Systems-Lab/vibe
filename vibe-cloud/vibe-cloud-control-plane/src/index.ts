import { Elysia, t, NotFoundError, InternalServerError, type Static } from "elysia";
import { jwt as jwtPlugin } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { dataService } from "./services/data.service";
import { AuthService } from "./services/auth.service";
import { PermissionService } from "./services/permission.service";
import { logger } from "./utils/logger";
import { spawn } from "child_process";
import path from "path";
import { Buffer } from "buffer";
import type { Server } from "bun";
import type * as nano from "nano";
import { ed25519FromDid } from "./utils/identity.utils"; // Added
import { verify } from "@noble/ed25519"; // Added
import {
    AdminClaimSchema,
    CLAIM_CODES_COLLECTION,
    ErrorResponseSchema,
    JWTPayloadSchema, // Schema for JWT structure
    LoginRequestSchema,
    LoginResponseSchema,
    RegisterRequestSchema,
    RegisterResponseSchema,
    IdentitySchema,
    IdentityListResponseSchema,
    IdentityStatusResponseSchema,
    UpdateIdentityOwnerRequestSchema,
    UpdateIdentityAdminRequestSchema,
    UpdateIdentityInternalRequestSchema,
    USERS_COLLECTION,
    type ClaimCode,
    type Identity,
    type LoginRequest,
    type RegisterRequest,
    type UpdateIdentityOwnerRequest,
    type UpdateIdentityAdminRequest,
    type UpdateIdentityInternalRequest,
    type JWTPayload as JWTPayloadType, // Type for JWT payload
    type AdminClaimBody, // Added import
} from "./models/models";
import { SYSTEM_DB } from "./utils/constants";
import { randomUUID } from "crypto";

// Environment Variable Validation
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    logger.error("CRITICAL: JWT_SECRET environment variable is not set.");
    throw new Error("JWT_SECRET environment variable not configured.");
}

// Service Initialization
await dataService.connect();
await dataService.ensureDatabaseExists(SYSTEM_DB);
const permissionService = new PermissionService(dataService);
const authService = new AuthService(dataService, permissionService);

// Initial Admin Claim Code Bootstrap
try {
    await authService.ensureInitialAdminClaimCode();
} catch (error) {
    logger.error("CRITICAL: Failed to ensure initial admin claim code:", error);
}

export const app = new Elysia()
    .decorate("dataService", dataService)
    .decorate("authService", authService)
    .decorate("permissionService", permissionService)
    .use(
        cors({
            origin: "*",
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization", "X-Internal-Secret"],
            credentials: true,
            preflight: true,
        })
    )
    .use(
        jwtPlugin({
            name: "jwt",
            secret: jwtSecret,
            schema: JWTPayloadSchema,
        })
    )
    .onError(({ code, error, set }) => {
        if (error instanceof Error) {
            logger.error(`[${code}] Error: ${error.message}`, error.stack);
        } else {
            logger.error(`[${code}] Non-Error thrown:`, error);
        }

        let errorMessage = "An internal server error occurred.";
        // Check if error is an object and has a message property
        if (typeof error === "object" && error !== null && "message" in error && typeof (error as any).message === "string") {
            errorMessage = (error as any).message;
        } else if (typeof error === "string") {
            errorMessage = error;
        }

        if (error instanceof NotFoundError) {
            set.status = 404;
            return { error: errorMessage || "Resource not found." };
        }

        set.status = 500;
        if (errorMessage.includes("Unauthorized") || errorMessage.includes("Invalid token")) set.status = 401;
        if (errorMessage.includes("Forbidden")) set.status = 403;
        if (errorMessage.includes("Invalid signature")) set.status = 401;
        if (errorMessage.includes("already exists") || errorMessage.includes("conflict")) set.status = 409;

        return { error: errorMessage };
    })
    .get("/health", () => ({ status: "ok", service: "control-plane", version: process.env.APP_VERSION || "unknown" }))

    // --- Authentication Routes ---
    .group("/api/v1/auth", (authGroup) =>
        authGroup
            .post(
                "/login",
                async ({ authService, dataService, jwt, body, set }) => {
                    const { did, nonce, timestamp, signature } = body as LoginRequest;
                    logger.info(`Login attempt for identity DID: ${did}`);

                    const isSignatureValid = await authService.verifyDidSignature(did, nonce, timestamp, signature);
                    if (!isSignatureValid) {
                        set.status = 401;
                        return { error: "Invalid signature or authentication failed." };
                    }

                    const requestTime = new Date(timestamp);
                    if (Math.abs(Date.now() - requestTime.getTime()) > 5 * 60 * 1000) {
                        set.status = 400;
                        return { error: "Request timestamp is invalid or expired." };
                    }
                    // TODO: Nonce replay prevention

                    let identity: Identity | null = null;
                    try {
                        identity = await dataService.getDocument<Identity>(SYSTEM_DB, `${USERS_COLLECTION}/${did}`);
                        if (!identity) {
                            set.status = 404;
                            return { error: "Identity not found. Please register first." };
                        }
                    } catch (error: any) {
                        if (error instanceof NotFoundError) {
                            set.status = 404;
                            return { error: "Identity not found. Please register first." };
                        }
                        logger.error(`Error fetching identity ${did} during login:`, error);
                        set.status = 500;
                        return { error: "Internal server error during login." };
                    }

                    const token = await jwt.sign({ identityDid: identity.identityDid, isAdmin: identity.isAdmin });
                    logger.debug(`JWT generated for identity ${identity.identityDid}, isAdmin: ${identity.isAdmin}`);

                    set.status = 200;
                    return { token, identityDid: identity.identityDid, isAdmin: identity.isAdmin };
                },
                {
                    body: LoginRequestSchema,
                    response: {
                        200: LoginResponseSchema,
                        400: ErrorResponseSchema,
                        401: ErrorResponseSchema,
                        404: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Login an identity with DID and signed challenge." },
                }
            )
            .post(
                "/register",
                async ({ authService, jwt, body, set }) => {
                    const { did, nonce, timestamp, signature, profileName, profilePictureUrl, claimCode } = body as RegisterRequest;
                    logger.info(`Registration attempt for identity DID: ${did}`);

                    const isSignatureValid = await authService.verifyDidSignature(did, nonce, timestamp, signature, [claimCode || ""]);
                    if (!isSignatureValid) {
                        set.status = 401;
                        return { error: "Invalid signature for registration." };
                    }

                    const requestTime = new Date(timestamp);
                    if (Math.abs(Date.now() - requestTime.getTime()) > 5 * 60 * 1000) {
                        set.status = 400;
                        return { error: "Request timestamp is invalid or expired." };
                    }
                    // TODO: Nonce replay check

                    const instanceId = `vibe-${randomUUID().substring(0, 18)}`;

                    try {
                        const registeredIdentity = await authService.registerIdentity(did, instanceId, profileName, profilePictureUrl, claimCode, {
                            nonce,
                            timestamp,
                        });

                        const scriptPath = path.resolve(process.cwd(), "../vibe-cloud-infra/provisioning/provision.sh");
                        const scriptCwd = path.resolve(process.cwd(), "../vibe-cloud-infra");
                        const controlPlaneBaseUrl = process.env.CONTROL_PLANE_BASE_URL || `http://localhost:${process.env.CONTROL_PLANE_PORT || 3001}`;
                        const provisionEnv = {
                            ...process.env,
                            TARGET_USER_DID: did, // Keep as TARGET_USER_DID if script expects this name
                            INSTANCE_IDENTIFIER: instanceId,
                            CONTROL_PLANE_URL: controlPlaneBaseUrl,
                            INTERNAL_SECRET_TOKEN: process.env.INTERNAL_SECRET_TOKEN || "dev-secret-token",
                        };
                        Object.keys(provisionEnv).forEach((key) => (provisionEnv as any)[key] === undefined && delete (provisionEnv as any)[key]);

                        logger.info(`Executing provisioning script for ${instanceId} (identity: ${did})`);
                        const provisionProcess = spawn("/usr/bin/bash", [scriptPath], { cwd: scriptCwd, env: provisionEnv, stdio: "pipe", detached: true });
                        provisionProcess.unref();
                        provisionProcess.stdout.on("data", (data) => logger.info(`[Provision STDOUT - ${instanceId}]: ${data.toString().trim()}`));
                        provisionProcess.stderr.on("data", (data) => logger.error(`[Provision STDERR - ${instanceId}]: ${data.toString().trim()}`));

                        provisionProcess.on("close", async (code) => {
                            logger.info(`Provisioning script for instance '${instanceId}' exited with code ${code}.`);
                            if (code !== 0) {
                                try {
                                    await authService.updateIdentity(
                                        did,
                                        { instanceStatus: "failed", instanceErrorDetails: `Provisioning script exited with code ${code}.` },
                                        "internal"
                                    );
                                } catch (updateErr) {
                                    logger.error(`Failed to mark instance ${instanceId} as failed after script error:`, updateErr);
                                }
                            }
                        });
                        provisionProcess.on("error", async (err) => {
                            logger.error(`Failed to start provisioning script for ${instanceId}:`, err);
                            try {
                                await authService.updateIdentity(
                                    did,
                                    { instanceStatus: "failed", instanceErrorDetails: `Failed to start provisioning script: ${err.message}` },
                                    "internal"
                                );
                            } catch (updateErr) {
                                logger.error(`Failed to mark instance ${instanceId} as failed after script spawn error:`, updateErr);
                            }
                        });

                        const provisioningIdentity = await authService.updateIdentity(did, { instanceStatus: "provisioning" }, "internal");
                        const token = await jwt.sign({ identityDid: provisioningIdentity.identityDid, isAdmin: provisioningIdentity.isAdmin });
                        set.status = 201;
                        return { identity: provisioningIdentity, token };
                    } catch (error: any) {
                        if (error.message?.includes("already exists")) {
                            set.status = 409;
                            return { error: "Identity already exists." };
                        }
                        logger.error(`Error during registration for ${did}:`, error);
                        set.status = 500;
                        return { error: "Registration failed." };
                    }
                },
                {
                    body: RegisterRequestSchema,
                    response: {
                        201: RegisterResponseSchema,
                        400: ErrorResponseSchema,
                        401: ErrorResponseSchema,
                        409: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Register a new identity; provisions an instance and handles optional admin promotion." },
                }
            )
    )
    // --- Initial Admin Claim Route (Bootstrap only, if ADMIN_CLAIM_CODE is set) ---
    .post(
        "/api/v1/admin/claim",
        async ({ authService, jwt, body, set }) => {
            const { did, claimCode, signature } = body as AdminClaimBody;
            logger.info(`Initial admin claim attempt for DID: ${did}`);

            const initialAdminCode = process.env.ADMIN_CLAIM_CODE;
            if (!initialAdminCode || claimCode !== initialAdminCode) {
                set.status = 400;
                return { error: "Invalid or non-initial admin claim code." };
            }

            const messageBytes = new TextEncoder().encode(claimCode);
            const publicKeyBytes = ed25519FromDid(did); // Ensure ed25519FromDid is imported
            const signatureBytes = Buffer.from(signature, "base64");
            const isSignatureValid = await verify(signatureBytes, messageBytes, publicKeyBytes); // Ensure verify is imported
            if (!isSignatureValid) {
                set.status = 401;
                return { error: "Invalid signature for admin claim." };
            }
            // Use registerIdentity for consistency, it handles admin promotion via claim code
            const instanceId = `admin-instance-${randomUUID().substring(0, 8)}`;
            const adminIdentity = await authService.registerIdentity(did, instanceId, "Admin", undefined, claimCode);

            const token = await jwt.sign({ identityDid: adminIdentity.identityDid, isAdmin: adminIdentity.isAdmin });
            set.status = 201;
            return { message: "Admin account claimed successfully.", identityDid: adminIdentity.identityDid, isAdmin: adminIdentity.isAdmin, token };
        },
        {
            body: AdminClaimSchema,
            response: { 201: LoginResponseSchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema, 500: ErrorResponseSchema },
            detail: { summary: "Claim an admin account (initial bootstrap)." },
        }
    )

    // --- Identities Routes ---
    .group("/api/v1/identities", (group) =>
        group
            .derive(async ({ jwt, request, set }) => {
                const urlPath = new URL(request.url).pathname;
                if (request.method === "GET" && urlPath.endsWith("/status")) {
                    return { currentIdentity: null as JWTPayloadType | null }; // Public route
                }
                const authHeader = request.headers.get("authorization");
                if (!authHeader?.startsWith("Bearer ")) {
                    set.status = 401;
                    throw new Error("Unauthorized: Missing Bearer token.");
                }
                try {
                    const payload = (await jwt.verify(authHeader.substring(7))) as JWTPayloadType;
                    if (!payload || !payload.identityDid) {
                        set.status = 401;
                        throw new Error("Unauthorized: Invalid token payload.");
                    }
                    return { currentIdentity: payload };
                } catch (err) {
                    set.status = 401;
                    throw new Error("Unauthorized: Token verification failed.");
                }
            })
            .get(
                "/",
                async ({ dataService, set, currentIdentity }) => {
                    if (!currentIdentity?.isAdmin) {
                        set.status = 403;
                        return { error: "Forbidden: Admin privileges required." };
                    }

                    try {
                        const query: nano.MangoQuery = { selector: { collection: USERS_COLLECTION } };
                        const identitiesResponse = await dataService.findDocuments<Identity>(SYSTEM_DB, query);
                        return identitiesResponse.docs;
                    } catch (error: any) {
                        logger.error("Error listing identities:", error);
                        set.status = 500;
                        return { error: "Failed to list identities." };
                    }
                },
                {
                    response: { 200: IdentityListResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 500: ErrorResponseSchema },
                    detail: { summary: "List all identities (Admin Only)." },
                }
            )
            .get(
                "/:did/status",
                async ({ dataService, params, set }) => {
                    try {
                        const identity = await dataService.getDocument<Identity>(SYSTEM_DB, `${USERS_COLLECTION}/${params.did}`);
                        return { isActive: true, instanceStatus: identity.instanceStatus };
                    } catch (error: any) {
                        if (error instanceof NotFoundError) return { isActive: false, instanceStatus: undefined };
                        logger.error(`Error getting status for identity ${params.did}:`, error);
                        set.status = 500;
                        return { error: "Failed to get identity status." };
                    }
                },
                {
                    params: t.Object({ did: t.String() }),
                    response: { 200: IdentityStatusResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
                    detail: { summary: "Get if DID is known and active, and its instance status (Public)." },
                }
            )
            .get(
                "/:did",
                async ({ dataService, params, set, currentIdentity }) => {
                    if (!currentIdentity || (!currentIdentity.isAdmin && currentIdentity.identityDid !== params.did)) {
                        set.status = 403;
                        return { error: "Forbidden: Access denied." };
                    }
                    try {
                        const identity = await dataService.getDocument<Identity>(SYSTEM_DB, `${USERS_COLLECTION}/${params.did}`);
                        return identity;
                    } catch (error: any) {
                        if (error instanceof NotFoundError) {
                            set.status = 404;
                            return { error: "Identity not found." };
                        }
                        logger.error(`Error fetching identity ${params.did}:`, error);
                        set.status = 500;
                        return { error: "Failed to fetch identity." };
                    }
                },
                {
                    params: t.Object({ did: t.String() }),
                    response: { 200: IdentitySchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
                    detail: { summary: "Get metadata for a specific identity (Admin or Owner)." },
                }
            )
            .put(
                "/:did",
                async ({ authService, body, params, request, set, currentIdentity, jwt }) => {
                    const { did } = params;
                    const internalSecretHeader = request.headers.get("x-internal-secret");
                    const expectedInternalSecret = process.env.INTERNAL_SECRET_TOKEN || "dev-secret-token";

                    let callingRole: "owner" | "admin" | "internal";
                    let updates: Partial<Identity>;
                    let claimCodeForPromotion: string | undefined;

                    if (internalSecretHeader === expectedInternalSecret) {
                        callingRole = "internal";
                        updates = body as UpdateIdentityInternalRequest;
                    } else if (currentIdentity) {
                        if (currentIdentity.isAdmin) {
                            callingRole = "admin";
                            updates = body as UpdateIdentityAdminRequest;
                        } else if (currentIdentity.identityDid === did) {
                            callingRole = "owner";
                            const ownerUpdatesPayload = body as UpdateIdentityOwnerRequest;
                            const { nonce, timestamp, signature, claimCode, ...profileUpdates } = ownerUpdatesPayload;

                            if (!nonce || !timestamp || !signature) {
                                set.status = 400;
                                return { error: "Missing signature parameters for owner update." };
                            }
                            const fieldsToSignForOwner = [claimCode || "", profileUpdates.profileName || "", profileUpdates.profilePictureUrl || ""];
                            const isOwnerSignatureValid = await authService.verifyDidSignature(
                                did,
                                nonce,
                                timestamp,
                                signature,
                                fieldsToSignForOwner.map((f) => String(f ?? "")) // Ensure string values
                            );
                            if (!isOwnerSignatureValid) {
                                set.status = 401;
                                return { error: "Invalid signature for owner update." };
                            }
                            updates = profileUpdates;
                            claimCodeForPromotion = claimCode;
                        } else {
                            set.status = 403;
                            return { error: "Forbidden: Insufficient permissions." };
                        }
                    } else {
                        set.status = 401;
                        return { error: "Unauthorized." };
                    }

                    try {
                        const identityBeforeUpdate = await dataService.getDocument<Identity>(SYSTEM_DB, `${USERS_COLLECTION}/${did}`);
                        const updatedIdentity = await authService.updateIdentity(did, updates, callingRole, claimCodeForPromotion);

                        let responseToken: string | undefined = undefined;
                        if (callingRole === "owner" && claimCodeForPromotion && updatedIdentity.isAdmin && !identityBeforeUpdate.isAdmin) {
                            responseToken = await jwt.sign({ identityDid: updatedIdentity.identityDid, isAdmin: true });
                        }
                        // Return type for Elysia needs to match schema, so ensure token is part of the object if defined
                        const responsePayload: Static<typeof IdentitySchema> & { token?: string } = { ...updatedIdentity };
                        if (responseToken) {
                            responsePayload.token = responseToken;
                        }
                        return responsePayload;
                    } catch (error: any) {
                        if (error instanceof NotFoundError) {
                            set.status = 404;
                            return { error: error.message };
                        }
                        if (error instanceof InternalServerError) {
                            set.status = 500;
                            return { error: error.message };
                        }
                        logger.error(`Error updating identity ${did}:`, error);
                        set.status = 500;
                        return { error: "Failed to update identity." };
                    }
                },
                {
                    params: t.Object({ did: t.String() }),
                    body: t.Any(),
                    response: {
                        200: t.Intersect([IdentitySchema, t.Object({ token: t.Optional(t.String()) })]),
                        400: ErrorResponseSchema,
                        401: ErrorResponseSchema,
                        403: ErrorResponseSchema,
                        404: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Update an identity. Owner can update profile/claim admin. Admin can update most. Internal for instance status." },
                }
            )
            .delete(
                "/:did",
                async ({ authService, dataService, params, set, currentIdentity }) => {
                    if (!currentIdentity || (!currentIdentity.isAdmin && currentIdentity.identityDid !== params.did)) {
                        set.status = 403;
                        return { error: "Forbidden: Access denied." };
                    }
                    const { did } = params;
                    logger.info(`Request to delete identity: ${did} by ${currentIdentity.identityDid}`);

                    try {
                        const identityToDelete = await dataService.getDocument<Identity>(SYSTEM_DB, `${USERS_COLLECTION}/${did}`);
                        if (identityToDelete.instanceId) {
                            logger.info(`Initiating deprovisioning for instance ${identityToDelete.instanceId} of identity ${did}.`);
                            await authService.updateIdentity(did, { instanceStatus: "deprovisioning" }, "internal");

                            // TODO: Asynchronously trigger deprovision.sh script
                            logger.warn(`DEPROVISIONING SCRIPT EXECUTION FOR ${identityToDelete.instanceId} IS A TODO.`);
                        }

                        await authService.deleteIdentity(did);

                        return { message: `Identity ${did} deletion process initiated. Instance deprovisioning (if any) started.` };
                    } catch (error: any) {
                        if (error instanceof NotFoundError) {
                            set.status = 404;
                            return { error: "Identity not found." };
                        }
                        logger.error(`Error deleting identity ${did}:`, error);
                        set.status = 500;
                        return { error: "Failed to delete identity." };
                    }
                },
                {
                    params: t.Object({ did: t.String() }),
                    response: {
                        200: t.Object({ message: t.String() }),
                        401: ErrorResponseSchema,
                        403: ErrorResponseSchema,
                        404: ErrorResponseSchema,
                        500: ErrorResponseSchema,
                    },
                    detail: { summary: "Delete an identity and its instance (Admin or Owner)." },
                }
            )
    );

// Exportable Server Start Function
export function startServer(port: number = 3001): Server {
    logger.info(`Attempting to start Vibe Cloud Control Plane on port ${port}...`);
    try {
        const server = Bun.serve({
            hostname: "0.0.0.0",
            port: port,
            fetch: app.fetch,
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
    startServer(Number(process.env.CONTROL_PLANE_PORT) || 3001);
}

export { dataService, authService, permissionService };
export type App = typeof app;
