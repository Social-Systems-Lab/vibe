// packages/vibe-crypto/src/did.ts
import multibase from "multibase";
import varint from "varint";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { createHmac } from "crypto";

// --- Enable Sync Methods for @noble/ed25519 ---
try {
    ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
} catch (error) {
    // This might happen in environments where sha512Sync is already set or frozen
    console.warn("Could not set ed.etc.sha512Sync. Sync methods might not work.", error);
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

    const encodedBytes: Uint8Array = multibase.encode("base58btc", data);

    let multibaseString: string;
    try {
        multibaseString = new TextDecoder().decode(encodedBytes);
    } catch (error: any) {
        console.error("Failed to decode multibase bytes into string:", error);
        throw new Error(`Internal error: Failed to decode multibase bytes: ${error.message}`);
    }

    if (!multibaseString.startsWith("z")) {
        console.error("Multibase base58btc encoding did not start with 'z':", multibaseString);
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
    if (!did || typeof did !== "string") {
        throw new Error("Invalid DID input: Must be a non-empty string.");
    }
    const parts = did.split(":");
    if (parts.length !== 3 || parts[0] !== "did" || parts[1] !== "vibe") {
        throw new Error(`Invalid did:vibe format: ${did}`);
    }

    const multibaseEncodedKey = parts[2];
    if (!multibaseEncodedKey || multibaseEncodedKey.length === 0) {
        throw new Error("Invalid did:vibe format: Missing multibase key part.");
    }

    let bytes: Uint8Array;
    try {
        bytes = multibase.decode(multibaseEncodedKey);
    } catch (error: any) {
        throw new Error(`Failed to decode multibase key part '${multibaseEncodedKey}': ${error.message}`);
    }

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

// --- Instance ID Generation ---

/**
 * Generates a deterministic instance ID from a DID and a secret salt.
 * The format is <17-char-base58btc-lowercase-prefix>-<last-7-of-DID-lowercase-suffix>.
 * Uses HMAC-SHA256 for the prefix generation and multibase for base58btc encoding.
 * @param did - The input DID string (e.g., "did:vibe:z...").
 * @param secret - The server-side secret salt.
 * @returns The generated instance ID string.
 * @throws Error if the DID format is invalid or secret is missing.
 */
export function instanceIdFromDid(did: string, secret: string): string {
    const PREFIX_LEN = 17; // configurable – 17 keeps total length 25 (17 + 1 + 7)
    const SUFFIX_LEN = 7;

    if (!secret || secret.length === 0) {
        throw new Error("Instance ID generation secret is missing or empty.");
    }

    if (!/^did:vibe:z[1-9A-HJ-NP-Za-km-z]+$/i.test(did)) {
        throw new Error("Input does not look like a valid did:vibe DID for instanceId generation.");
    }

    /* ---------- 1. salted, deterministic digest ---------- */
    const digest = createHmac("sha256", secret).update(did).digest();

    /* ---------- 2. base-58 encode (multibase) and force lower-case for prefix ---------- */
    const multibaseEncodedBytesPrimary = multibase.encode("base58btc", digest.subarray(0, 12));
    const rawBase58Primary = new TextDecoder().decode(multibaseEncodedBytesPrimary).substring(1).toLowerCase();

    const multibaseEncodedBytesSecondary = multibase.encode("base58btc", digest.subarray(12));
    const rawBase58Secondary = new TextDecoder().decode(multibaseEncodedBytesSecondary).substring(1).toLowerCase();

    let prefix = rawBase58Primary.padEnd(PREFIX_LEN, rawBase58Secondary).slice(0, PREFIX_LEN);

    /* ---------- 3. canonical 7-char suffix from the DID ---------- */
    const suffix = did.slice(-SUFFIX_LEN).toLowerCase();

    return `${prefix}-${suffix}`;
}
