import { Buffer } from "buffer";
import * as Constants from "../constants";
import * as Types from "../types";
import * as SessionManager from "../session-manager";
import { deriveEncryptionKey, decryptData } from "../../lib/crypto";
import { broadcastAppStateToSubscriptions } from "../app-state-broadcaster";
import * as PouchDBManager from "../../lib/pouchdb";

export async function handleUnlockVault(payload: any): Promise<any> {
    console.log("Processing 'UNLOCK_VAULT'");
    const { password } = payload;
    if (!password || typeof password !== "string") {
        throw new Types.HandledError({ error: { message: "Password is required for UNLOCK_VAULT.", code: "PASSWORD_REQUIRED" } });
    }

    const localData = await chrome.storage.local.get([Constants.STORAGE_KEY_VAULT, Constants.STORAGE_KEY_VAULT_SALT, Constants.STORAGE_KEY_LAST_ACTIVE_DID]);
    const vaultData = localData[Constants.STORAGE_KEY_VAULT];
    const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];
    const lastActiveDidFromStorage = localData[Constants.STORAGE_KEY_LAST_ACTIVE_DID];

    if (!vaultData || !saltHex) {
        throw new Types.HandledError({ error: { message: "Vault or salt not found. Setup may not be complete.", code: "VAULT_NOT_FOUND" } });
    }

    const saltBuffer = Buffer.from(saltHex, "hex");
    let encryptionKey: CryptoKey | null = null;
    let decryptedSeedAttempt: string | null = null;

    try {
        encryptionKey = await deriveEncryptionKey(password, new Uint8Array(saltBuffer.buffer, saltBuffer.byteOffset, saltBuffer.byteLength));
        decryptedSeedAttempt = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);
        if (!decryptedSeedAttempt) {
            throw new Error("Decryption failed, returned null seed."); // This will be caught and re-thrown as HandledError
        }

        let activeIdentityIndexToSet = vaultData.settings?.activeIdentityIndex ?? 0;

        if (lastActiveDidFromStorage && vaultData.identities) {
            const foundIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === lastActiveDidFromStorage);
            if (foundIndex !== -1) {
                activeIdentityIndexToSet = foundIndex;
                if (vaultData.settings.activeIdentityIndex !== foundIndex) {
                    vaultData.settings.activeIdentityIndex = foundIndex;
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vaultData });
                    console.log(`Persisted activeIdentityIndex updated to match lastActiveDid: ${lastActiveDidFromStorage}`);
                }
            } else {
                console.warn(
                    `Last active DID ${lastActiveDidFromStorage} not found in current vault identities. Defaulting to index ${activeIdentityIndexToSet}.`
                );
            }
        }

        SessionManager.setInMemoryDecryptedSeed(decryptedSeedAttempt);
        await chrome.storage.session.set({
            [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: activeIdentityIndexToSet,
        });
        await SessionManager.loadActiveIdentity();

        if (!SessionManager.isUnlocked || !SessionManager.currentActiveDid) {
            SessionManager.setInMemoryDecryptedSeed(null); // Clean up partial success
            throw new Error("Failed to load active identity into global state after unlock.");
        }

        if (SessionManager.currentActiveDid) {
            await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
            // Attempt to initialize PouchDB sync now that vault is unlocked and password is known
            PouchDBManager.initializeSync(SessionManager.currentActiveDid, password).catch((err) =>
                console.error(`Error initializing PouchDB sync for ${SessionManager.currentActiveDid} after vault unlock:`, err)
            );
        }
        console.info(`Vault unlocked for ${SessionManager.currentActiveDid}. API calls will attempt to use/refresh tokens.`);
        await broadcastAppStateToSubscriptions();
        return { success: true, did: SessionManager.currentActiveDid, message: "Vault unlocked." };
    } catch (error) {
        SessionManager.setInMemoryDecryptedSeed(null); // Ensure cleanup on any error
        await SessionManager.lockVaultState(); // Ensure vault is locked on failure
        throw new Types.HandledError({
            error: {
                message: `Failed to unlock vault. ${error instanceof Error ? error.message : String(error)}`,
                code: "UNLOCK_FAILED",
            },
        });
    } finally {
        if (decryptedSeedAttempt) decryptedSeedAttempt = null; // Clear sensitive data from memory
    }
}

export async function handleLockVault(): Promise<any> {
    await SessionManager.lockVaultState();
    await broadcastAppStateToSubscriptions();
    return { success: true, message: "Vault locked." };
}

export async function handleGetLockState(): Promise<any> {
    return { isUnlocked: SessionManager.isUnlocked, did: SessionManager.currentActiveDid };
}
