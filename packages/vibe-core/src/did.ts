import { getPublicKey } from "@noble/ed25519";
import { HDKey } from "micro-ed25519-hdkey";
import multibase from "multibase";
import varint from "varint";

const ED25519_CODEC = 0xed01;
const ED25519_KEY_LENGTH = 32;

export function generateEd25519KeyPair(): {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
} {
    const seed = HDKey.fromMasterSeed(crypto.getRandomValues(new Uint8Array(32))).privateKey;
    const publicKey = getPublicKey(seed);
    return { publicKey, privateKey: seed };
}

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
