// apps/test/src/lib/identity.ts
// Adapted from vibe-cloud/src/utils/identity.utils.ts for frontend use

import multibase from "multibase";
import varint from "varint";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// --- Enable Sync Methods for @noble/ed25519 ---
// Attempt to enable sync methods, may not be strictly necessary if async is used
// or if the environment handles it automatically.
try {
    // @ts-ignore - Allow setting sha512Sync if possible
    if (!ed.etc.sha512Sync) {
        // @ts-ignore - Allow setting sha512Sync if possible
        ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
    }
} catch (error) {
    console.warn("Could not set ed.etc.sha512Sync. Sync methods might fall back to async or fail if not supported.", error);
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
    // Use async version in browser environments if sync setup fails or is not preferred
    // const publicKey = await ed.getPublicKeyAsync(privateKey);
    const publicKey = ed.getPublicKey(privateKey); // Attempt sync first
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
    // Use async version in browser environments if sync setup fails or is not preferred
    // return await ed.signAsync(message, privateKey);
    return ed.sign(message, privateKey); // Attempt sync first
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
        throw new Error(`Invalid public key length: Expected ${ED25519_KEY_LENGTH} bytes, got ${publicKey.length}.`);
    }
    try {
        // Use async version in browser environments if sync setup fails or is not preferred
        // return await ed.verifyAsync(signature, message, publicKey);
        return ed.verify(signature, message, publicKey); // Attempt sync first
    } catch (error) {
        console.debug("Ed25519 verification failed with error:", error);
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

// Helper to convert hex string to Uint8Array
export function hexToUint8Array(hexString: string): Uint8Array {
    if (hexString.length % 2 !== 0) {
        throw "Invalid hexString";
    }
    const arrayBuffer = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        const byteValue = parseInt(hexString.substring(i, i + 2), 16);
        if (isNaN(byteValue)) {
            throw "Invalid hexString";
        }
        arrayBuffer[i / 2] = byteValue;
    }
    return arrayBuffer;
}

// Helper to convert Uint8Array to hex string
export function uint8ArrayToHex(bytes: Uint8Array): string {
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");
}
