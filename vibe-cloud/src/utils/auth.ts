// utils/signature-verification.ts
import jsrsasign from "jsrsasign";

export interface ChallengeData {
    challenge: string;
    timestamp: number;
    expiresAt: number;
}

// Store pending challenges with DIDs as keys
const pendingChallenges: Map<string, ChallengeData> = new Map();

// Generate a random challenge for a DID
export function generateChallenge(did: string): ChallengeData {
    // Create a random challenge string
    const challenge = jsrsasign.KJUR.crypto.Util.getRandomHexOfNbytes(32);
    const timestamp = Date.now();
    const expiresAt = timestamp + 5 * 60 * 1000; // Challenge valid for 5 minutes

    // Store the challenge
    pendingChallenges.set(did, { challenge, timestamp, expiresAt });

    return { challenge, timestamp, expiresAt };
}

// Verify a signature against a stored challenge
export function verifySignature(did: string, publicKeyPem: string, signatureBase64: string): boolean {
    // Get the stored challenge for this DID
    const challengeData = pendingChallenges.get(did);
    if (!challengeData) {
        return false; // No challenge found
    }

    // Check if challenge has expired
    if (Date.now() > challengeData.expiresAt) {
        pendingChallenges.delete(did); // Clean up expired challenge
        return false;
    }

    try {
        // Initialize the public key object from the PEM string
        const publicKey = jsrsasign.KEYUTIL.getKey(publicKeyPem);

        // Create a new Signature object with the matching algorithm
        const signature = new jsrsasign.KJUR.crypto.Signature({ alg: "SHA256withRSA" });

        // Initialize the Signature object with the public key
        signature.init(publicKey);

        // Update the Signature object with the challenge string
        signature.updateString(challengeData.challenge);

        // Convert Base64 signature to hex for verification
        const signatureHex = jsrsasign.b64tohex(signatureBase64);

        // Verify the signature
        const isValid = signature.verify(signatureHex);

        // Clean up the challenge after successful verification
        if (isValid) {
            pendingChallenges.delete(did);
        }

        return isValid;
    } catch (error) {
        console.error("Signature verification error:", error);
        return false;
    }
}
