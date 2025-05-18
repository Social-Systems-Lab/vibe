import { Buffer } from "buffer";
import * as Constants from "./constants";
// TokenManager is not directly used by these functions, but clearSessionStateInternal used to call clearCpTokens.
// For now, we assume clearCpTokens is handled elsewhere or its logic is incorporated if needed.
// If clearCpTokens (or parts of it) needs to be called from clearSessionStateInternal,
// we would need to import TokenManager here. Based on the current background.ts,
// clearSessionStateInternal *does* remove session storage keys related to CP access tokens,
// but doesn't call the full clearCpTokens which also handles local storage refresh tokens.
// This separation seems acceptable for now.

import { seedFromMnemonic, getMasterHDKeyFromSeed, deriveChildKeyPair, wipeMemory } from "../lib/crypto";
import { didFromEd25519 } from "../lib/identity";

// --- Global State (managed by session-manager) ---
export let currentActiveDid: string | null = null;
export let isUnlocked: boolean = false;

export function setCurrentActiveDid(did: string | null) {
    currentActiveDid = did;
}

export function setIsUnlocked(unlocked: boolean) {
    isUnlocked = unlocked;
}

// --- Core Identity and Session Management ---

export async function loadActiveIdentityFromSessionInternal(): Promise<boolean> {
    try {
        const sessionData = await chrome.storage.session.get([
            Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE,
            Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX,
        ]);
        const decryptedSeed = sessionData[Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
        const activeIndex = sessionData[Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]; // Can be -1

        if (decryptedSeed) {
            setIsUnlocked(true); // Set this based on seed presence
            if (typeof activeIndex === "number" && activeIndex >= 0) {
                let seedBuffer: Buffer | null = null;
                try {
                    seedBuffer = await seedFromMnemonic(decryptedSeed);
                    const masterKey = getMasterHDKeyFromSeed(seedBuffer);
                    const identityKeyPair = deriveChildKeyPair(masterKey, activeIndex);
                    setCurrentActiveDid(didFromEd25519(identityKeyPair.publicKey));
                    console.log("Active identity loaded from session:", currentActiveDid);
                    return true; // Successfully loaded an active DID
                } finally {
                    if (seedBuffer) wipeMemory(seedBuffer);
                }
            } else {
                setCurrentActiveDid(null);
                console.log("Vault unlocked (seed in session), but no valid active identity index set.");
                return true; // Still true in the sense that session is partially loaded (unlocked)
            }
        }
    } catch (error) {
        console.error("Error loading active identity from session:", error);
        await clearSessionStateInternal(); // This will also clear access tokens from session
    }
    setIsUnlocked(false);
    setCurrentActiveDid(null); // Ensure currentActiveDid is null if isUnlocked is false
    return false;
}

export async function clearSessionStateInternal(): Promise<void> {
    setCurrentActiveDid(null);
    setIsUnlocked(false);

    const itemsToClearFromSession = [Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE, Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX];

    const allSessionItems = await chrome.storage.session.get(null);
    for (const key in allSessionItems) {
        if (key.startsWith(Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX) || key.startsWith(Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX)) {
            itemsToClearFromSession.push(key);
        }
    }
    await chrome.storage.session.remove(itemsToClearFromSession);
    console.log("Session state (seed, active index, all CP access tokens) cleared.");
}
