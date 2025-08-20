import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let masterKey: Buffer;

function getMasterKey(): Buffer {
    if (masterKey) {
        return masterKey;
    }
    const keyHex = process.env.ENCRYPTION_MASTER_KEY;
    if (!keyHex || keyHex.length !== 64) {
        throw new Error("ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes)");
    }
    masterKey = Buffer.from(keyHex, "hex");
    return masterKey;
}

export function encryptWithMasterKey(plaintext: string | Buffer): {
    alg: "aes-256-gcm";
    iv: string;
    ciphertext: string;
    tag: string;
    v: 2;
} {
    const key = getMasterKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const plaintextBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");

    const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        alg: ALGORITHM,
        iv: iv.toString("hex"),
        ciphertext: ciphertext.toString("hex"),
        tag: tag.toString("hex"),
        v: 2,
    };
}

export function decryptWithMasterKey(encrypted: { iv: string; ciphertext: string; tag: string }): string {
    const key = getMasterKey();
    const iv = Buffer.from(encrypted.iv, "hex");
    const ciphertext = Buffer.from(encrypted.ciphertext, "hex");
    const tag = Buffer.from(encrypted.tag, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString("utf8");
}
