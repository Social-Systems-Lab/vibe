// models.ts - Vibe Cloud Models, Types, and Schemas
import { t, type Static, type TSchema } from "elysia";
import type nano from "nano";
import type { DocumentInsertResponse, MaybeDocument } from "nano";

//#region --- Collection Constants ---

export const PERMISSIONS_COLLECTION = "permissions" as const;
export const USERS_COLLECTION = "users" as const;
export const BLOBS_COLLECTION = "blobs" as const;
export const CLAIM_CODES_COLLECTION = "claimCodes" as const;

//#endregion

//#region --- Core Database Document Schemas & Types ---

// Schema for storing app grants within a user's permission document
export const AppGrantSchema = t.Record(
    t.String(), // Key: appId (URL or DID)
    t.Array(t.String(), { minItems: 1 }), // Value: Array of granted permission strings (scopes)
    { description: "Map of application IDs to their granted permissions for this user." }
);

// Revised Permission Schema
export const PermissionSchema = t.Object({
    _id: t.Optional(t.String()), // Should be userDid
    _rev: t.Optional(t.String()),
    userDid: t.String({ description: "The user who owns these permissions/grants." }),
    collection: t.Literal(PERMISSIONS_COLLECTION),
    appGrants: t.Optional(AppGrantSchema), // Map of appId -> granted scopes
    directPermissions: t.Optional(
        t.Array(t.String(), { minItems: 1 }) // User's own direct permissions (e.g., read:blobs)
    ),
});
export type Permission = Static<typeof PermissionSchema>;
export interface PermissionUpdateResponse extends CouchDbModificationResponse {} // Alias for CouchDB response

export const UserSchema = t.Object({
    _id: t.Optional(t.String()),
    _rev: t.Optional(t.String()),
    userDid: t.String(),
    isAdmin: t.Boolean(),
    collection: t.Literal(USERS_COLLECTION),
});
export type User = Static<typeof UserSchema>;

export const BlobMetadataSchema = t.Object({
    _id: t.String(), // Required: objectId (UUID for the blob)
    _rev: t.Optional(t.String()),
    originalFilename: t.String(),
    contentType: t.String(),
    size: t.Number(),
    ownerDid: t.String(),
    uploadTimestamp: t.String({ format: "date-time" }), // ISO date-time string
    bucket: t.String(), // e.g., S3 bucket name
    collection: t.Literal(BLOBS_COLLECTION),
});
export type BlobMetadata = Static<typeof BlobMetadataSchema>; // Single definition derived from schema

export const ClaimCodeSchema = t.Object({
    _id: t.String(), // Required: e.g., "INITIAL_ADMIN" or UUID
    _rev: t.Optional(t.String()),
    code: t.String(),
    // Use t.Nullable for fields that can be explicitly null
    expiresAt: t.Nullable(t.String({ format: "date-time" })),
    forDid: t.Nullable(t.String()),
    spentAt: t.Nullable(t.String({ format: "date-time" })),
    claimedByDid: t.Optional(t.String()),
    collection: t.Literal(CLAIM_CODES_COLLECTION),
});
export type ClaimCode = Static<typeof ClaimCodeSchema>;

// Generic schema for user data documents (non-system collections)
export const GenericDataDocumentSchema = t.Object(
    {
        _id: t.Optional(t.String()),
        _rev: t.Optional(t.String()),
        collection: t.String(), // Collection name (not a system collection)
        // No specific fields defined, allowing any additional properties
    },
    { additionalProperties: true } // Explicitly allow extra fields
);
export type GenericDataDocument = Static<typeof GenericDataDocumentSchema>;

//#endregion

//#region --- API Data Transfer Objects (DTOs) / View Models ---

// Schema for the /data/read endpoint body
export const ReadPayloadSchema = t.Object({
    collection: t.String({ minLength: 1, error: "Collection name is required." }),
    filter: t.Optional(
        t.Record(t.String(), t.Unknown(), {
            error: "Filter must be an object.",
        })
    ),
});
export type ReadPayload = Static<typeof ReadPayloadSchema>;

// Schema for the /data/write endpoint body
// Allows either a single object or an array of objects for the 'data' field
const ArbitraryObjectSchema = t.Record(t.String(), t.Unknown(), { description: "Represents an object with any properties." });
export const WritePayloadSchema = t.Object({
    collection: t.String({ minLength: 1, error: "Collection name is required." }),
    data: t.Union([ArbitraryObjectSchema, t.Array(ArbitraryObjectSchema)], {
        error: "Data must be a single object or an array of objects.",
    }),
});
export type WritePayload = Static<typeof WritePayloadSchema>;

// Response type for successful updates/inserts (can be reused)
export interface CouchDbModificationResponse extends DocumentInsertResponse {}
export interface PermissionUpdateResponse extends CouchDbModificationResponse {}

// --- Elysia Validation Schemas & Derived Types (for API Payloads/Params) ---
// Schemas used for validating API request bodies, query params, etc.

// Generic Data Schemas (for API interaction)
export const GenericDataPayloadSchema = t.Object({}, { additionalProperties: true });
export type GenericDataPayload = Static<typeof GenericDataPayloadSchema>;

// Schema for updating generic documents
export const UpdateDataPayloadSchema = t.Intersect([
    t.Object({
        _rev: t.String({ error: "Missing required field: _rev" }),
    }),
    GenericDataPayloadSchema,
]);
export type UpdateDataPayload = Static<typeof UpdateDataPayloadSchema>;

export const DeleteParamsSchema = t.Object({
    _rev: t.String({ error: "Missing required query parameter: _rev" }),
});
export type DeleteParams = Static<typeof DeleteParamsSchema>;

// Auth Schemas
export const AuthCredentialsSchema = t.Object({
    email: t.String({ format: "email", error: "Invalid email format." }),
    password: t.String({ minLength: 8, error: "Password must be at least 8 characters long." }),
});
export type AuthCredentials = Static<typeof AuthCredentialsSchema>;

export const JWTPayloadSchema = t.Object(
    {
        userDid: t.String(),
    },
    {
        // Allow standard JWT claims like iat, exp, aud, iss etc.
        additionalProperties: true,
        description: "Schema for JWT payload, requires userDid, allows standard claims.",
    }
);
export type JWTPayload = Static<typeof JWTPayloadSchema>;

// Admin Claim Schema
export const AdminClaimSchema = t.Object({
    did: t.String({ error: "Missing required field: did" }),
    claimCode: t.String({ error: "Missing required field: claimCode" }),
    signature: t.String({ error: "Missing required field: signature (Base64)" }),
});
export type AdminClaimBody = Static<typeof AdminClaimSchema>;

// Blob Schemas (for API interaction)
export const BlobUploadBodySchema = t.Object({
    file: t.File({ error: "File upload is required." }),
});
export type BlobUploadBody = Static<typeof BlobUploadBodySchema>;

export const BlobDownloadResponseSchema = t.Object({
    url: t.String({ format: "uri", error: "Invalid URL format." }),
});
export type BlobDownloadResponse = Static<typeof BlobDownloadResponseSchema>;

// Error Schema
export const ErrorResponseSchema = t.Object({
    error: t.String(),
});
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

//#endregion

//#region --- WebSocket Types ---

export interface WebSocketAuthContext {
    userDid: string;
    appId: string; // App ID (URL or DID) that initiated the WebSocket connection
}

export interface WebSocketManagedContext extends WebSocketAuthContext {
    subscriptions: Set<string>; // Collections the user is subscribed to
}

export interface WebSocketClientMessage {
    action: "subscribe" | "unsubscribe";
    collection: string;
}

export type WebSocketServerMessage =
    | { status: "subscribed" | "unsubscribed" | "denied" | "not_subscribed"; collection: string; reason?: string }
    | { error: string }
    | { type: "update" | "delete"; collection: string; data: any }; // Consider typing 'data' more strictly

//#endregion

//#region --- Base & External Types ---

export type { DocumentInsertResponse, MaybeDocument };
export type ChangeWithDoc<TDocSchema extends TSchema> = nano.DatabaseChangesResultItem & {
    doc?: Static<TDocSchema> & MaybeDocument; // Ensure _id/_rev might be present
};

//#endregion
