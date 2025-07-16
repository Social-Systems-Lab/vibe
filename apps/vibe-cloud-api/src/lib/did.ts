import multibase from "multibase";
import { createHmac } from "crypto";

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
