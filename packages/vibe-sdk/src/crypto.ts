import * as bip39 from "bip39";
import { HDKey } from "micro-ed25519-hdkey";
import * as ed from "@noble/ed25519"; // Re-use existing import for consistency
import { Buffer } from "buffer"; // Needed for hex conversions
import { sha512 } from "@noble/hashes/sha2.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// Polyfill Buffer globally for libraries that might expect it (e.g., bip39 in some environments)
// Without this bip39.validateMnemonic always returns false
if (typeof globalThis !== "undefined" && typeof globalThis.Buffer === "undefined") {
    globalThis.Buffer = Buffer;
}

// --- Constants ---
// Standard Ed25519 derivation path for SLIP-0010
// Example: m / purpose' / coin_type' / account' / change / address_index
// Using a placeholder coin type (e.g., 501' for Solana, adjust if Vibe defines its own)
// We'll use a simple path for the mock: m/44'/501'/0'/0'/{index}'
const DEFAULT_DERIVATION_PATH_PREFIX = "m/44'/501'/0'/0'"; // Master path for accounts
const PBKDF2_ITERATIONS = 250000; // Number of iterations for password hashing (adjust as needed)
const AES_KEY_LENGTH = 256; // AES key length in bits

// --- Types ---
export interface EncryptedData {
    iv: string; // Hex encoded IV
    ciphertext: string; // Hex encoded ciphertext
}

// --- Mnemonic and Seed Generation ---

/**
 * Generates a new BIP39 mnemonic phrase.
 * @param strength - The number of words (12 or 24). Defaults to 24.
 * @returns A 12 or 24-word mnemonic phrase.
 */
export function generateMnemonic(strength: 12 | 24 = 24): string {
    const entropyBits = strength === 12 ? 128 : 256;
    return bip39.generateMnemonic(entropyBits);
}

/**
 * Validates a BIP39 mnemonic phrase.
 * @param mnemonic - The phrase to validate.
 * @returns True if the mnemonic is valid, false otherwise.
 */
export function validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
}

/**
 * Derives the seed buffer from a mnemonic phrase.
 * @param mnemonic - The BIP39 mnemonic phrase.
 * @param password - Optional BIP39 passphrase.
 * @returns The derived seed as a Buffer.
 */
export async function seedFromMnemonic(mnemonic: string, password?: string): Promise<Buffer> {
    return bip39.mnemonicToSeed(mnemonic, password);
}

// --- Key Derivation ---

/**
 * Derives the master HDKey object from a seed.
 * @param seed - The seed buffer derived from the mnemonic.
 * @returns An HDKey instance for the master key.
 */
export function getMasterHDKeyFromSeed(seed: Buffer): HDKey {
    return HDKey.fromMasterSeed(seed);
}

/**
 * Derives a child Ed25519 key pair from an HDKey using a specific index.
 * Uses the default path prefix: m/44'/501'/0'/0'/{index}'
 * @param masterHDKey - The master HDKey instance.
 * @param index - The account index to derive.
 * @returns The derived Ed25519 key pair { publicKey: Uint8Array, privateKey: Uint8Array } and the full derivation path.
 */
export function deriveChildKeyPair(masterHDKey: HDKey, index: number): { publicKey: Uint8Array; privateKey: Uint8Array; derivationPath: string } {
    const derivationPath = `${DEFAULT_DERIVATION_PATH_PREFIX}/${index}'`; // Use hardened index
    const childKey = masterHDKey.derive(derivationPath);
    // micro-ed25519-hdkey returns the 64-byte expanded private key (private + public)
    // We need the 32-byte private seed for signing with @noble/ed25519
    const privateKeySeed = childKey.privateKey.slice(0, 32);

    const publicKeyFromMicroHDKey = childKey.publicKey.slice(1); // From micro-ed25519-hdkey
    const publicKeyFromNoble = ed.getPublicKey(privateKeySeed); // From @noble/ed25519

    // Log if there's a notable difference, especially in length.
    if (publicKeyFromMicroHDKey.length !== publicKeyFromNoble.length) {
        console.warn(
            `Public key length discrepancy: micro-ed25519-hdkey produced ${publicKeyFromMicroHDKey.length} bytes, @noble/ed25519 produced ${publicKeyFromNoble.length} bytes. Using @noble/ed25519 version.`,
            { microHDKey: publicKeyFromMicroHDKey, noble: publicKeyFromNoble }
        );
    } else if (Buffer.from(publicKeyFromMicroHDKey).toString("hex") !== Buffer.from(publicKeyFromNoble).toString("hex")) {
        // If lengths are same but content differs, this is a more serious issue.
        console.error("Public key content mismatch (same length): micro-ed25519-hdkey and @noble/ed25519 derived different public keys from the same private seed.", {
            microHDKey: publicKeyFromMicroHDKey,
            noble: publicKeyFromNoble,
        });
        // This case should ideally throw an error, as it indicates a fundamental disagreement between the libraries.
    }

    return {
        publicKey: publicKeyFromNoble, // Use the 32-byte key from @noble/ed25519
        privateKey: privateKeySeed, // Return the 32-byte seed
        derivationPath: derivationPath,
    };
}

// --- Password-Based Key Derivation (PBKDF2) ---

/**
 * Generates a cryptographically secure salt.
 * @param length - The desired length of the salt in bytes. Defaults to 16.
 * @returns A random salt as a Uint8Array.
 */
export function generateSalt(length: number = 16): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Derives an AES-GCM encryption key from a password and salt using PBKDF2.
 * @param password - The user's password.
 * @param salt - The salt (Uint8Array).
 * @returns The derived CryptoKey for AES-GCM encryption/decryption.
 */
export async function deriveEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const passwordBuffer = new TextEncoder().encode(password);
    const baseKey = await crypto.subtle.importKey("raw", passwordBuffer, { name: "PBKDF2" }, false, ["deriveKey"]);

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: AES_KEY_LENGTH },
        true, // Extractable is false for security, but true might be needed if key is passed around (avoid if possible)
        ["encrypt", "decrypt"]
    );
}

// --- Encryption/Decryption (AES-GCM) ---

/**
 * Encrypts data using AES-GCM with a derived key.
 * @param data - The data to encrypt (string).
 * @param encryptionKey - The AES-GCM CryptoKey derived via PBKDF2.
 * @returns An object containing the hex-encoded IV and ciphertext.
 */
export async function encryptData(data: string, encryptionKey: CryptoKey): Promise<EncryptedData> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes is recommended for AES-GCM
    const encodedData = new TextEncoder().encode(data);

    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        encryptionKey,
        encodedData
    );

    return {
        iv: Buffer.from(iv).toString("hex"),
        ciphertext: Buffer.from(encryptedBuffer).toString("hex"),
    };
}

/**
 * Decrypts data using AES-GCM with a derived key.
 * @param encryptedData - An object containing the hex-encoded IV and ciphertext.
 * @param encryptionKey - The AES-GCM CryptoKey derived via PBKDF2.
 * @returns The decrypted data as a string.
 */
export async function decryptData(encryptedData: EncryptedData, encryptionKey: CryptoKey): Promise<string> {
    const iv = Buffer.from(encryptedData.iv, "hex");
    const ciphertext = Buffer.from(encryptedData.ciphertext, "hex");

    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        encryptionKey,
        ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
}

// --- Utility ---

/**
 * Securely wipes a Buffer or TypedArray from memory (best effort).
 * @param sensitiveData - The Buffer or TypedArray to wipe.
 */
export function wipeMemory(sensitiveData: Buffer | Uint8Array): void {
    if (sensitiveData.fill) {
        sensitiveData.fill(0);
    } else {
        // Fallback for environments where fill might not be available (less likely for Buffer/Uint8Array)
        for (let i = 0; i < sensitiveData.length; i++) {
            sensitiveData[i] = 0;
        }
    }
    // Note: Garbage collection timing is not guaranteed, but this overwrites the data.
}

// --- WebCrypto Key Import ---

/**
 * Imports a raw Ed25519 private key (seed) into a CryptoKey object for signing.
 * @param privateKeyBytes - The 32-byte raw private key (seed).
 * @param extractable - Whether the key should be extractable. Defaults to false for security.
 * @returns A Promise that resolves to the imported CryptoKey.
 */
// export async function importEd25519Key(privateKeyBytes: Uint8Array, extractable: boolean = false): Promise<CryptoKey> {
//     if (privateKeyBytes.length !== 32) {
//         throw new Error("Ed25519 private key (seed) must be 32 bytes.");
//     }
//     // This was causing "Algorithm: Unrecognized name" error as "Ed25519" is not a standard
//     // algorithm name for crypto.subtle.importKey in all environments for raw private keys.
//     // The current signing flow uses noble/ed25519 directly via signMessage, so this CryptoKey is not strictly needed.
//     return crypto.subtle.importKey(
//         "raw",
//         privateKeyBytes,
//         { name: "Ed25519" },
//         extractable,
//         ["sign"]
//     );
// }

/**
 * Signs a message using a raw Ed25519 private key (seed).
 * @param privateKeySeed - The 32-byte raw private key (seed).
 * @param message - The string message to sign.
 * @returns A Promise that resolves to the base64 encoded signature.
 */
export async function signMessage(privateKeySeed: Uint8Array, message: string): Promise<string> {
    if (privateKeySeed.length !== 32) {
        throw new Error("Ed25519 private key (seed) must be 32 bytes for signing.");
    }
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = await ed.sign(messageBytes, privateKeySeed);
    return Buffer.from(signatureBytes).toString("base64");
}

export function privateKeyHexToPkcs8Pem(hexKey: string): string {
    // Ed25519 private keys are 32 bytes. The hex string is 64 characters.
    // The full key pair is 64 bytes, with the private key being the first 32 bytes.
    const privateKeyBytes = Buffer.from(hexKey.slice(0, 64), "hex");

    // The PKCS#8 header for an Ed25519 private key
    const pkcs8Header = Buffer.from("302e020100300506032b657004220420", "hex");

    const pkcs8Key = Buffer.concat([pkcs8Header, privateKeyBytes]);

    const base64Key = pkcs8Key.toString("base64");

    return `-----BEGIN PRIVATE KEY-----\n${base64Key}\n-----END PRIVATE KEY-----`;
}
