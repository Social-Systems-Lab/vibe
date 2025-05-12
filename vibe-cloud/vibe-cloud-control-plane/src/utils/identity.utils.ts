// src/utils/identity.utils.ts
import multibase from "multibase";
import varint from "varint";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { USER_DB_PREFIX } from "./constants";
import { logger } from "./logger"; // Optional: for logging errors

// --- Enable Sync Methods for @noble/ed25519 ---
// This setup allows us to use the simpler synchronous versions of noble functions
// within this utility module. Consumers of this module will use sync functions.
// If async is needed elsewhere, import noble libs directly there or add async wrappers here.
try {
    ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
} catch (error) {
    // This might happen in environments where sha512Sync is already set or frozen
    logger.warn("Could not set ed.etc.sha512Sync. Sync methods might not work.", error);
}
// --- End Sync Method Setup ---

// --- Constants ---
const ED25519_CODEC = 0xed01; // "ed25519-pub" per multicodec table
const ED25519_KEY_LENGTH = 32;

// --- Interfaces ---
export interface Ed25519KeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}

// --- Key Generation ---

/**
 * Generates a new Ed25519 key pair (private and public keys).
 * Uses crypto.getRandomValues for randomness.
 * @returns An object containing the 32-byte private and public keys.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = ed.getPublicKey(privateKey); // Using sync version
    return { privateKey, publicKey };
}

// --- Signing & Verification ---

/**
 * Signs a message using an Ed25519 private key.
 * @param message - The message to sign (Uint8Array).
 * @param privateKey - The 32-byte Ed25519 private key.
 * @returns The 64-byte signature as a Uint8Array.
 * @throws Error if the private key is not 32 bytes.
 */
export function signEd25519(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
    if (privateKey.length !== ED25519_KEY_LENGTH) {
        throw new Error(`Invalid private key length: Expected ${ED25519_KEY_LENGTH} bytes, got ${privateKey.length}.`);
    }
    return ed.sign(message, privateKey); // Using sync version
}

/**
 * Verifies an Ed25519 signature.
 * @param signature - The 64-byte signature to verify.
 * @param message - The original message that was signed.
 * @param publicKey - The 32-byte Ed25519 public key corresponding to the private key used for signing.
 * @returns True if the signature is valid, false otherwise.
 * @throws Error if the public key is not 32 bytes.
 */
export function verifyEd25519(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
    if (publicKey.length !== ED25519_KEY_LENGTH) {
        // Throw or return false? Throwing is clearer about invalid input.
        throw new Error(`Invalid public key length: Expected ${ED25519_KEY_LENGTH} bytes, got ${publicKey.length}.`);
    }
    try {
        // Using sync version. Default options use ZIP215.
        return ed.verify(signature, message, publicKey);
    } catch (error) {
        // Noble verify can throw errors for malformed inputs
        logger.debug("Ed25519 verification failed with error:", error);
        return false;
    }
}

// --- DID Formatting ---

/**
 * Given a raw 32-byte Ed25519 public key, produce a did:vibe DID.
 * did:vibe:<multibase(base58btc, 0xed01 + raw_public_key)>
 * @param rawPublicKey - The 32-byte Ed25519 public key.
 * @returns The did:vibe string.
 * @throws Error if the public key is not 32 bytes.
 */
export function didFromEd25519(rawPublicKey: Uint8Array): string {
    if (rawPublicKey.length !== ED25519_KEY_LENGTH) {
        throw new Error(`Ed25519 public key must be ${ED25519_KEY_LENGTH} bytes.`);
    }

    const prefix = Uint8Array.from(varint.encode(ED25519_CODEC));
    const data = new Uint8Array(prefix.length + rawPublicKey.length);
    data.set(prefix);
    data.set(rawPublicKey, prefix.length);

    // 2. Multibase-encode the prefixed key using base58btc (prefix 'z')
    // This returns a Uint8Array containing the character codes of the base58 string.
    const encodedBytes: Uint8Array = multibase.encode("base58btc", data);

    // 3. Decode the Uint8Array into a JavaScript string
    let multibaseString: string;
    try {
        multibaseString = new TextDecoder().decode(encodedBytes);
    } catch (error: any) {
        logger.error("Failed to decode multibase bytes into string:", error);
        throw new Error(`Internal error: Failed to decode multibase bytes: ${error.message}`);
    }

    // 4. Basic validation of the resulting string
    if (!multibaseString.startsWith("z")) {
        logger.error("Multibase base58btc encoding did not start with 'z':", multibaseString);
        throw new Error("Internal error: Multibase base58btc encoding format unexpected.");
    }

    return `did:vibe:${multibaseString}`;
}

/**
 * Given a did:vibe DID, return the raw 32-byte Ed25519 public key.
 * @param did - The did:vibe string.
 * @returns The raw 32-byte Ed25519 public key as a Uint8Array.
 * @throws Error if the DID is invalid, uses an unexpected codec, or the key length is wrong.
 */
export function ed25519FromDid(did: string): Uint8Array {
    // ... implementation remains the same ...
    if (!did || typeof did !== "string") {
        throw new Error("Invalid DID input: Must be a non-empty string.");
    }
    const parts = did.split(":");
    if (parts.length !== 3 || parts[0] !== "did" || parts[1] !== "vibe") {
        throw new Error(`Invalid did:vibe format: ${did}`);
    }

    const multibaseEncodedKey = parts[2]; // This should now be the correct 'z...' string
    if (!multibaseEncodedKey || multibaseEncodedKey.length === 0) {
        throw new Error("Invalid did:vibe format: Missing multibase key part.");
    }

    let bytes: Uint8Array;
    try {
        // multibase.decode expects the base-encoded *string*
        bytes = multibase.decode(multibaseEncodedKey);
    } catch (error: any) {
        throw new Error(`Failed to decode multibase key part '${multibaseEncodedKey}': ${error.message}`);
    }

    // ... rest of the decoding logic remains the same ...
    let codec: number;
    let codecByteLength: number;
    try {
        codec = varint.decode(bytes);
        codecByteLength = varint.decode.bytes ?? 0;
    } catch (error: any) {
        throw new Error(`Failed to decode multicodec prefix: ${error.message}`);
    }

    if (codec !== ED25519_CODEC) {
        throw new Error(`Unexpected multicodec in DID: Expected 0x${ED25519_CODEC.toString(16)}, got 0x${codec.toString(16)}`);
    }

    if (codecByteLength === undefined || codecByteLength <= 0) {
        throw new Error("Failed to determine varint length during DID decoding.");
    }

    const rawPublicKey = bytes.slice(codecByteLength);

    if (rawPublicKey.length !== ED25519_KEY_LENGTH) {
        throw new Error(`Expected ${ED25519_KEY_LENGTH}-byte Ed25519 public key, but got ${rawPublicKey.length} bytes.`);
    }

    return rawPublicKey;
}

// --- Database Naming Utility ---

/**
 * Derives a valid CouchDB database name from a user DID.
 * - Prepends USER_DB_PREFIX.
 * - Converts to lowercase.
 * - Replaces invalid characters (like ':') with hyphens.
 * - Ensures it starts with a letter (handled by the prefix).
 *
 * @param userDid - The user's Decentralized Identifier.
 * @returns A valid CouchDB database name string.
 */
export function getUserDbName(userDid: string): string {
    if (!userDid) {
        throw new Error("Cannot generate database name from empty userDid.");
    }

    // Keep full DID for uniqueness
    let baseId = userDid;

    // Replace invalid CouchDB characters (specifically ':' from DIDs, plus others if needed)
    // CouchDB rules: Must begin with a lowercase letter (a-z), and can contain
    // lowercase letters (a-z), digits (0-9), and any of the characters _, $, (, ), +, -, and /.
    // We replace ':' with '-' and remove/replace any other potentially problematic chars.
    // Convert to lowercase first, then sanitize.
    const lowerCaseId = baseId.toLowerCase();
    const sanitizedId = lowerCaseId.replace(/:/g, "-").replace(/[^a-z0-9_$( )+-/]/g, "-");

    // Prepend prefix (ensure prefix itself is valid and ends appropriately)
    // The prefix 'userdata-' ensures it starts with a letter.
    const dbName = `${USER_DB_PREFIX}${sanitizedId}`;

    // Optional: Truncate if exceeding CouchDB length limits (e.g., 238 chars)
    // const maxLength = 238;
    // if (dbName.length > maxLength) {
    //     logger.warn(`Generated DB name exceeded max length and was truncated: ${dbName}`);
    //     // Consider hashing or a more robust truncation strategy if this happens often
    //     return dbName.substring(0, maxLength);
    // }

    return dbName;
}
