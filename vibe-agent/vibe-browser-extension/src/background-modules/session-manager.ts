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
export let currentActiveDid: string | null = null; // This will be loaded from storage on init
export let isUnlocked: boolean = false; // Reflects if inMemoryDecryptedSeed is populated
let inMemoryDecryptedSeed: string | null = null;
// TODO: Consider adding an inactivity timeout to clear inMemoryDecryptedSeed

// Initialize Session Manager state on load
export async function initializeSessionManager(): Promise<void> {
    try {
        const data = await chrome.storage.local.get(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
        const loadedDid = data[Constants.STORAGE_KEY_LAST_ACTIVE_DID];
        if (loadedDid) {
            currentActiveDid = loadedDid;
            console.log("[SessionManager] Initialized currentActiveDid from storage:", currentActiveDid);
        } else {
            console.log("[SessionManager] No last active DID found in storage.");
        }
    } catch (error) {
        console.error("[SessionManager] Error initializing currentActiveDid from storage:", error);
    }
    // isUnlocked and inMemoryDecryptedSeed remain false/null until unlock
}

export function getInMemoryDecryptedSeed(): string | null {
    // TODO: Potentially refresh inactivity timer here if implementing auto-lock
    return inMemoryDecryptedSeed;
}

export function setInMemoryDecryptedSeed(seed: string | null): void {
    inMemoryDecryptedSeed = seed;
    isUnlocked = !!seed; // Update isUnlocked based on the presence of the seed
    if (!isUnlocked) {
        currentActiveDid = null; // Ensure currentActiveDid is cleared when locked
    }
    // TODO: If seed is set, start/reset inactivity timer. If null, clear timer.
}

export async function setCurrentActiveDid(did: string | null): Promise<void> {
    currentActiveDid = did;
    if (did) {
        try {
            await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: did });
            console.log("[SessionManager] Persisted currentActiveDid:", did);
        } catch (error) {
            console.error("[SessionManager] Error persisting currentActiveDid:", error);
        }
    } else {
        try {
            await chrome.storage.local.remove(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
            console.log("[SessionManager] Removed persisted currentActiveDid.");
        } catch (error) {
            console.error("[SessionManager] Error removing persisted currentActiveDid:", error);
        }
    }
}

// setIsUnlocked is effectively replaced by setInMemoryDecryptedSeed
// export function setIsUnlocked(unlocked: boolean) {
//     isUnlocked = unlocked;
// }

// --- Core Identity and Session Management ---

// Renamed from loadActiveIdentityFromSessionInternal
export async function loadActiveIdentity(): Promise<boolean> {
    if (!isUnlocked || !inMemoryDecryptedSeed) {
        console.log("Vault is locked or in-memory seed is not available. Cannot load active identity.");
        isUnlocked = false; // Ensure consistency
        currentActiveDid = null;
        return false;
    }

    try {
        // Active index is now primarily managed by the vault settings or lastActiveDid logic in message-handler
        // For now, we'll assume the activeIdentityIndex in session is still the source of truth after unlock
        // This might need to be refactored to pull from local.get(VAULT).settings.activeIdentityIndex
        const sessionData = await chrome.storage.session.get(Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX);
        const activeIndex = sessionData[Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX];

        if (typeof activeIndex === "number" && activeIndex >= 0) {
            let seedBuffer: Buffer | null = null;
            try {
                seedBuffer = await seedFromMnemonic(inMemoryDecryptedSeed);
                const masterKey = getMasterHDKeyFromSeed(seedBuffer);
                const identityKeyPair = deriveChildKeyPair(masterKey, activeIndex);
                const derivedDid = didFromEd25519(identityKeyPair.publicKey);
                await setCurrentActiveDid(derivedDid); // Persists and sets in-memory
                console.log("Active identity loaded using in-memory seed and persisted:", currentActiveDid);
                return true; // Successfully loaded an active DID
            } finally {
                if (seedBuffer) wipeMemory(seedBuffer); // Wipe the temporary buffer
            }
        } else {
            // No valid index, so clear in-memory active DID. Persisted hint remains.
            currentActiveDid = null;
            console.log("Vault unlocked (in-memory seed present), but no valid active identity index set in session. In-memory active DID cleared.");
            // isUnlocked remains true because the seed is still in memory.
            return false; // false because DID couldn't be loaded via index
        }
    } catch (error) {
        console.error("Error loading active identity with in-memory seed:", error);
        await lockVaultState(); // Clears in-memory seed and session tokens
    }
    // Ensure state is consistent if an error occurred or conditions not met
    isUnlocked = !!inMemoryDecryptedSeed; // Re-evaluate based on seed presence after potential errors
    if (!isUnlocked) currentActiveDid = null;
    return false;
}

// Renamed from clearSessionStateInternal
export async function lockVaultState(): Promise<void> {
    setInMemoryDecryptedSeed(null); // This clears the seed and sets isUnlocked to false, currentActiveDid to null
    // setCurrentActiveDid(null); // Handled by setInMemoryDecryptedSeed
    // setIsUnlocked(false); // Handled by setInMemoryDecryptedSeed

    const itemsToClearFromSession = [
        // Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE, // No longer stored in session
        Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX, // Still clear this, as it's tied to the unlocked session
    ];

    // Clear all CP access tokens from session storage
    const allSessionItems = await chrome.storage.session.get(null);
    for (const key in allSessionItems) {
        if (key.startsWith(Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX) || key.startsWith(Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX)) {
            itemsToClearFromSession.push(key);
        }
    }
    // Also remove the old decrypted seed phrase key if it somehow exists
    itemsToClearFromSession.push(Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE);

    if (itemsToClearFromSession.length > 0) {
        await chrome.storage.session.remove(itemsToClearFromSession);
    }
    console.log("Vault locked: In-memory seed cleared, active index and all CP access tokens removed from session.");
}
