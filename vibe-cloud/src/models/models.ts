// models.ts - Vibe Cloud Models, Types, and Schemas
import { t, type Static } from "elysia";
import type nano from "nano";
import type { DocumentInsertResponse, MaybeDocument } from "nano";

// --- Collection Constants ---

export const PERMISSIONS_COLLECTION = "$permissions" as const;
export const USERS_COLLECTION = "$users" as const;
export const BLOBS_COLLECTION = "$blobs" as const;
export const CLAIM_CODES_COLLECTION = "$claimCodes" as const;

// --- Core Database Document Schemas & Types ---

export const PermissionSchema = t.Object({
    _id: t.Optional(t.String()), // userDid, optional before creation
    _rev: t.Optional(t.String()),
    userDid: t.String(),
    allowedActions: t.Array(t.String()), // e.g., ["read:notes", "write:notes"]
    collection: t.Literal(PERMISSIONS_COLLECTION),
});
export type Permission = Static<typeof PermissionSchema>;

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

// --- API Data Transfer Objects (DTOs) / View Models ---
// Types used for API responses, often derived but potentially modified.

// Exported User type excluding sensitive fields, derived from the User type
export type UserPublicProfile = Omit<User, "hashedPassword" | "_rev" | "collection">;

// Response type for successful updates/inserts (can be reused)
export interface CouchDbModificationResponse extends DocumentInsertResponse {}
// Specific alias for clarity
export interface PermissionUpdateResponse extends CouchDbModificationResponse {}

// --- Elysia Validation Schemas & Derived Types (for API Payloads/Params) ---
// Schemas used for validating API request bodies, query params, etc.

// Generic Data Schemas (for API interaction)
export const GenericDataPayloadSchema = t.Object({}, { additionalProperties: true });
export type GenericDataPayload = Static<typeof GenericDataPayloadSchema>;

// Schema for updating generic documents (requires _rev, allows any other data)
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

export const JWTPayloadSchema = t.Object({
    userDid: t.String(),
});
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

// --- WebSocket Types ---

export interface WebSocketAuthContext {
    userDid: string;
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

// --- Base & External Types ---

export type { DocumentInsertResponse, MaybeDocument };
export type ChangeWithDoc<TDocSchema extends t.TLiteralObject | t.TObject<any>> = nano.DatabaseChangesResultItem & {
    doc?: Static<TDocSchema> & MaybeDocument; // Ensure _id/_rev might be present
};
