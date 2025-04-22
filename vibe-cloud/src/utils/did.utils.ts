import multibase from "multibase";
import varint from "varint";

// Multicodec code for Ed25519 public key
const ED25519_CODEC = 0xed01; // "ed25519-pub" per multicodec table

/**
 * Given a raw 32-byte Ed25519 public key, produce a did:vibe DID.
 * did:vibe:<multibase(base58btc, 0xed01 + raw_public_key)>
 * @param rawPublicKey - The 32-byte Ed25519 public key.
 * @returns The did:vibe string.
 * @throws Error if the public key is not 32 bytes.
 */
export function didFromEd25519(rawPublicKey: Uint8Array): string {
    if (rawPublicKey.length !== 32) {
        throw new Error("Ed25519 public key must be 32 bytes.");
    }

    // 1. Prepend the multicodec varint for Ed25519 public key (0xed01)
    const prefix = Uint8Array.from(varint.encode(ED25519_CODEC));
    const data = new Uint8Array(prefix.length + rawPublicKey.length);
    data.set(prefix);
    data.set(rawPublicKey, prefix.length);

    // 2. Multibase-encode the prefixed key using base58btc (prefix 'z')
    const mb = multibase.encode("base58btc", data).toString(); // toString() is important if multibase returns Buffer

    return `did:vibe:${mb}`;
}

/**
 * Given a did:vibe DID, return the raw 32-byte Ed25519 public key.
 * @param did - The did:vibe string.
 * @returns The raw 32-byte Ed25519 public key as a Uint8Array.
 * @throws Error if the DID is invalid, uses an unexpected codec, or the key length is wrong.
 */
export function ed25519FromDid(did: string): Uint8Array {
    const parts = did.split(":");
    if (parts.length !== 3 || parts[0] !== "did" || parts[1] !== "vibe") {
        throw new Error(`Invalid did:vibe format: ${did}`);
    }

    const multibaseEncodedKey = parts[2];
    if (!multibaseEncodedKey || multibaseEncodedKey.length === 0) {
        throw new Error("Invalid did:vibe format: Missing multibase key part.");
    }

    // Decode the multibase string (should start with 'z' for base58btc)
    const bytes = multibase.decode(multibaseEncodedKey); // Returns Uint8Array

    // Decode the multicodec prefix (varint)
    const codec = varint.decode(bytes);
    if (codec !== ED25519_CODEC) {
        throw new Error(`Unexpected multicodec in DID: Expected 0x${ED25519_CODEC.toString(16)}, got 0x${codec.toString(16)}`);
    }

    // Get the number of bytes used by the varint codec prefix
    const codecByteLength = varint.decode.bytes;
    if (codecByteLength === undefined || codecByteLength <= 0) {
        throw new Error("Failed to determine varint length during DID decoding.");
    }

    // Extract the raw public key (the rest of the bytes)
    const rawPublicKey = bytes.slice(codecByteLength);

    // Validate the length of the extracted key
    if (rawPublicKey.length !== 32) {
        throw new Error(`Expected 32-byte Ed25519 public key, but got ${rawPublicKey.length} bytes.`);
    }

    return rawPublicKey;
}
