import { Buffer } from "buffer";
import * as Constants from "../constants";
import * as Types from "../types";
import * as SessionManager from "../session-manager";
import * as TokenManager from "../token-manager";
import { seedFromMnemonic, getMasterHDKeyFromSeed, deriveChildKeyPair, wipeMemory, signMessage, deriveEncryptionKey, decryptData } from "../../lib/crypto";
import { didFromEd25519 } from "../../lib/identity";
import { broadcastAppStateToSubscriptions } from "../app-state-broadcaster";

export async function handleGetActiveIdentityDetails(): Promise<any> {
    let didToFetch: string | null = null;

    if (SessionManager.isUnlocked && SessionManager.currentActiveDid) {
        didToFetch = SessionManager.currentActiveDid;
    } else {
        const lastActiveDidResult = await chrome.storage.local.get(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
        didToFetch = lastActiveDidResult[Constants.STORAGE_KEY_LAST_ACTIVE_DID] || null;
    }

    if (!didToFetch) {
        const setupCompleteResult = await chrome.storage.local.get(Constants.STORAGE_KEY_SETUP_COMPLETE);
        if (!setupCompleteResult[Constants.STORAGE_KEY_SETUP_COMPLETE]) {
            throw new Types.HandledError({ error: { message: "Setup not complete. Cannot get identity details.", code: "SETUP_NOT_COMPLETE" } });
        } else {
            throw new Types.HandledError({ error: { message: "No active identity found. Please select or create an identity.", code: "NO_ACTIVE_IDENTITY" } });
        }
    }

    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    const vault = vaultResult[Constants.STORAGE_KEY_VAULT];

    if (!vault || !vault.identities || !Array.isArray(vault.identities)) {
        throw new Error("Vault data not found or invalid."); // Internal error, should not happen if DID was found
    }

    const identityData = vault.identities.find((idObj: any) => idObj.did === didToFetch || idObj.identityDid === didToFetch);

    if (!identityData) {
        throw new Types.HandledError({ error: { message: `Identity details for DID ${didToFetch} not found in vault.`, code: "IDENTITY_NOT_FOUND_IN_VAULT" } });
    }

    return {
        did: identityData.did || identityData.identityDid,
        profileName: identityData.profile_name,
        profilePictureUrl: identityData.profile_picture,
        cloudUrl: identityData.cloudUrl || identityData.instanceUrl,
        instanceStatus: (identityData as any).instanceStatus,
        isAdmin: (identityData as any).isAdmin,
        isVaultLocked: !SessionManager.isUnlocked,
    };
}

export async function handleUpdateIdentityProfile(payload: any): Promise<any> {
    const { did, profileName, profilePictureUrl, claimCode } = payload;
    if (!did) {
        throw new Types.HandledError({ error: { message: "DID required for profile update.", code: "DID_REQUIRED" } });
    }

    let localVault = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];
    if (!localVault || !localVault.identities) {
        throw new Types.HandledError({ error: { message: "Vault data not found.", code: "VAULT_NOT_FOUND" } });
    }

    const identityIndex = localVault.identities.findIndex((idObj: any) => (idObj.did || idObj.identityDid) === did);
    if (identityIndex === -1) {
        throw new Types.HandledError({ error: { message: `Identity with DID ${did} not found in vault.`, code: "IDENTITY_NOT_FOUND" } });
    }

    const identityToUpdate = localVault.identities[identityIndex];
    let needsLocalSave = false;
    let needsCloudSync = false;

    if (profileName !== undefined && identityToUpdate.profile_name !== profileName) {
        identityToUpdate.profile_name = profileName;
        needsLocalSave = true;
        needsCloudSync = true;
    }
    if (profilePictureUrl !== undefined && identityToUpdate.profile_picture !== profilePictureUrl) {
        identityToUpdate.profile_picture = profilePictureUrl;
        needsLocalSave = true;
        needsCloudSync = true;
    }
    if (claimCode !== undefined) {
        // Claim code implies cloud sync attempt
        needsCloudSync = true;
    }

    if (needsLocalSave) {
        await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: localVault });
    }

    let cloudSyncMessage = "No changes to sync.";
    let cloudUpdateError = null;

    if (needsCloudSync && (identityToUpdate.cloudUrl || identityToUpdate.instanceUrl) === Constants.OFFICIAL_VIBE_CLOUD_URL) {
        if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== did) {
            cloudUpdateError = "Vault locked or identity not active; cloud sync skipped.";
        } else {
            const decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
            if (!decryptedSeed) {
                cloudUpdateError = "Decrypted seed not available for signing; cloud sync skipped.";
            } else {
                let seedBuffer: Buffer | null = null;
                try {
                    seedBuffer = await seedFromMnemonic(decryptedSeed);
                    const masterKey = getMasterHDKeyFromSeed(seedBuffer);
                    // Determine derivation index. This assumes identityIndex matches derivation order.
                    // A more robust way would be to use identityToUpdate.derivationPath if stored.
                    const keyPair = deriveChildKeyPair(masterKey, identityIndex);

                    const nonce = crypto.randomUUID().toString();
                    const timestamp = new Date().toISOString();
                    const updateOwnerPayload: any = { nonce, timestamp };

                    if (profileName !== undefined) updateOwnerPayload.profileName = profileName;
                    if (profilePictureUrl !== undefined) updateOwnerPayload.profilePictureUrl = profilePictureUrl;
                    if (claimCode !== undefined) updateOwnerPayload.claimCode = claimCode;

                    // Construct message to sign based on what's being updated
                    const fieldsToSign = [
                        claimCode || "", // claimCode is part of signature even if not changing profile
                        profileName === undefined ? identityToUpdate.profile_name || "" : profileName,
                        profilePictureUrl === undefined ? identityToUpdate.profile_picture || "" : profilePictureUrl,
                    ];
                    const messageToSign = `${did}|${nonce}|${timestamp}|${fieldsToSign.join("|")}`;
                    updateOwnerPayload.signature = await signMessage(keyPair.privateKey, messageToSign);

                    let accessTokenToUse = await TokenManager.getValidCpAccessToken(did);
                    const updateUrl = `${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${did}`;
                    const updateResponse = await fetch(updateUrl, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessTokenToUse}` },
                        body: JSON.stringify(updateOwnerPayload),
                    });

                    if (!updateResponse.ok) {
                        const errBody = await updateResponse.json().catch(() => ({ error: "Unknown cloud update error" }));
                        throw new Error(`Cloud profile update failed: ${errBody.error || updateResponse.statusText}`);
                    }
                    const updatedServerIdentity = (await updateResponse.json()) as Types.AgentIdentity;

                    // Update local vault with confirmed server data
                    identityToUpdate.profile_name = updatedServerIdentity.profile_name;
                    identityToUpdate.profile_picture = updatedServerIdentity.profile_picture;
                    if (updatedServerIdentity.isAdmin !== undefined) identityToUpdate.isAdmin = updatedServerIdentity.isAdmin;
                    // instanceUrl might also be updated by server
                    identityToUpdate.cloudUrl = updatedServerIdentity.instanceUrl || identityToUpdate.cloudUrl;

                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: localVault });
                    cloudSyncMessage = "Changes saved locally and synced to cloud.";
                } catch (error: any) {
                    cloudUpdateError = error.message;
                } finally {
                    if (seedBuffer) wipeMemory(seedBuffer);
                }
            }
        }
    } else if (needsCloudSync && (identityToUpdate.cloudUrl || identityToUpdate.instanceUrl) !== Constants.OFFICIAL_VIBE_CLOUD_URL) {
        cloudSyncMessage = "Changes saved locally. Identity not connected to official Vibe Cloud for automated sync.";
    } else if (needsLocalSave) {
        cloudSyncMessage = "Changes saved locally.";
    }

    const finalProfile = {
        profileName: identityToUpdate.profile_name,
        profilePictureUrl: identityToUpdate.profile_picture,
    };

    if (cloudUpdateError) {
        // If cloud sync failed, but local save happened, it's a partial success.
        // The message should reflect this.
        throw new Types.HandledError({
            error: {
                message: `Local save successful. Cloud sync failed: ${cloudUpdateError}`,
                code: "CLOUD_SYNC_FAILED",
                updatedProfile: finalProfile, // still provide updated local profile
            },
        });
    }

    return {
        success: true,
        message: cloudSyncMessage,
        updatedProfile: finalProfile,
    };
}

export async function handleFetchFullIdentityDetails(payload: any): Promise<any> {
    const { did } = payload;
    if (!did || typeof did !== "string") {
        throw new Types.HandledError({ error: { message: "DID is required.", code: "DID_REQUIRED" } });
    }
    let accessToken: string;
    try {
        accessToken = await TokenManager.getValidCpAccessToken(did);
    } catch (tokenError: any) {
        if (tokenError.message && tokenError.message.startsWith("FULL_LOGIN_REQUIRED")) {
            throw new Types.HandledError({
                error: { message: `FULL_LOGIN_REQUIRED: Authentication required for ${did}.`, code: "FULL_LOGIN_REQUIRED", did: did },
            });
        }
        throw new Types.HandledError({ error: { message: `Token error for ${did}: ${tokenError.message}`, code: "TOKEN_ERROR" } });
    }

    const fetchUrl = `${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${did}`;
    const fetchResponse = await fetch(fetchUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    });

    if (!fetchResponse.ok) {
        const errorBody = await fetchResponse.json().catch(() => ({ error: `Fetch failed: ${fetchResponse.status}` }));
        if (fetchResponse.status === 401) {
            await TokenManager.clearCpTokens(did); // Clear potentially invalid tokens
            throw new Types.HandledError({
                error: { message: `FULL_LOGIN_REQUIRED: Access token rejected for ${did}.`, code: "FULL_LOGIN_REQUIRED", did: did },
            });
        }
        throw new Types.HandledError({ error: { message: errorBody.error || `API error: ${fetchResponse.status}`, code: "API_ERROR" } });
    }

    const serverIdentity = (await fetchResponse.json()) as Types.AgentIdentity;
    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];

    if (vaultData && vaultData.identities) {
        const identityIndex = vaultData.identities.findIndex((idObj: any) => (idObj.did || idObj.identityDid) === did);
        if (identityIndex !== -1) {
            const localIdentity = vaultData.identities[identityIndex];
            localIdentity.profile_name = serverIdentity.profile_name || localIdentity.profile_name;
            localIdentity.profile_picture = serverIdentity.profile_picture || localIdentity.profile_picture;
            localIdentity.cloudUrl = serverIdentity.instanceUrl || localIdentity.cloudUrl; // Prefer server's
            localIdentity.instanceUrl = serverIdentity.instanceUrl || localIdentity.instanceUrl;
            localIdentity.instanceStatus = serverIdentity.instanceStatus;
            localIdentity.instanceId = serverIdentity.instanceId;
            localIdentity.isAdmin = serverIdentity.isAdmin;
            localIdentity.instanceCreatedAt = serverIdentity.instanceCreatedAt;
            localIdentity.instanceUpdatedAt = serverIdentity.instanceUpdatedAt;
            localIdentity.instanceErrorDetails = serverIdentity.instanceErrorDetails;
            await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vaultData });
        }
    }
    return { success: true, identity: serverIdentity };
}

export async function handleRequestLoginFlow(payload: any): Promise<any> {
    const { did, password } = payload; // Password might be provided if vault is locked
    if (!did) {
        throw new Types.HandledError({ error: { message: "DID is required for login flow.", code: "DID_REQUIRED" } });
    }

    let decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
    let activeIdx: number | undefined;

    if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== did || !decryptedSeed) {
        if (!password) {
            throw new Types.HandledError({
                error: { message: "Vault locked or not active for this DID. Password required to login.", code: "VAULT_LOCKED_FOR_LOGIN", did: did },
            });
        }
        // Attempt to unlock with provided password specifically for this DID
        const localData = await chrome.storage.local.get([Constants.STORAGE_KEY_VAULT, Constants.STORAGE_KEY_VAULT_SALT]);
        const vaultData = localData[Constants.STORAGE_KEY_VAULT];
        const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];
        if (!vaultData || !saltHex) {
            throw new Types.HandledError({ error: { message: "Vault/salt not found for unlock attempt.", code: "VAULT_NOT_FOUND" } });
        }
        const salt = Buffer.from(saltHex, "hex");
        try {
            const encryptionKey = await deriveEncryptionKey(password, salt);
            decryptedSeed = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);
            if (!decryptedSeed) throw new Error("Decryption failed.");

            // Find the index for the given DID
            activeIdx = vaultData.identities.findIndex((idObj: any) => (idObj.did || idObj.identityDid) === did);
            if (activeIdx === -1) {
                throw new Error(`DID ${did} not found in vault.`);
            }
            // Temporarily set seed for this operation, but don't fully unlock session globally yet
            // SessionManager.setInMemoryDecryptedSeed(decryptedSeed); // Not setting globally yet
        } catch (unlockError: any) {
            throw new Types.HandledError({ error: { message: `Login failed: ${unlockError.message}`, code: "LOGIN_UNLOCK_FAILED" } });
        }
    } else {
        // Vault is already unlocked for this DID, get its index
        const vault = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];
        activeIdx = vault.identities.findIndex((idObj: any) => (idObj.did || idObj.identityDid) === did);
    }

    if (!decryptedSeed || typeof activeIdx !== "number" || activeIdx === -1) {
        throw new Types.HandledError({ error: { message: "Internal error: Seed or active index missing for login.", code: "INTERNAL_LOGIN_ERROR" } });
    }

    let seedForSigning: Buffer | null = null;
    try {
        seedForSigning = await seedFromMnemonic(decryptedSeed);
        const masterKey = getMasterHDKeyFromSeed(seedForSigning);
        const keyPair = deriveChildKeyPair(masterKey, activeIdx);

        const nonce = crypto.randomUUID().toString();
        const timestamp = new Date().toISOString();
        const messageToSign = `${did}|${nonce}|${timestamp}`;
        const signature = await signMessage(keyPair.privateKey, messageToSign);

        const loginResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ did, nonce, timestamp, signature }),
        });

        if (!loginResponse.ok) {
            const errBody = await loginResponse.json().catch(() => ({ error: `Login API failed: ${loginResponse.status}` }));
            throw new Error(errBody.error || `Login API failed: ${loginResponse.status}`);
        }
        const result = await loginResponse.json();
        const tokenDetails = result.tokenDetails as Types.TokenDetails;
        await TokenManager.storeCpTokens(did, tokenDetails);

        // If login was successful and vault wasn't fully unlocked for this DID, finalize unlock
        if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== did) {
            SessionManager.setInMemoryDecryptedSeed(decryptedSeed); // Now set it globally
            await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: activeIdx });
            await SessionManager.loadActiveIdentity(); // This will set currentActiveDid etc.
            if (SessionManager.currentActiveDid) {
                await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
            }
            await broadcastAppStateToSubscriptions();
        }

        return { success: true, message: "Logged in successfully.", identity: result.identity };
    } catch (error: any) {
        throw new Types.HandledError({ error: { message: `Login flow failed: ${error.message}`, code: "LOGIN_FLOW_FAILED" } });
    } finally {
        if (seedForSigning) wipeMemory(seedForSigning);
        // If we temporarily decrypted the seed just for this login, clear it if not fully unlocking.
        // This is handled by the fact that we only call setInMemoryDecryptedSeed globally on full success.
    }
}

export async function handleGetAllIdentities(): Promise<any> {
    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
    const identities =
        vault?.identities?.map((id: any) => ({
            did: id.did || id.identityDid,
            profile_name: id.profile_name,
            profile_picture: id.profile_picture,
            cloudUrl: id.cloudUrl || id.instanceUrl,
            // include other relevant, safe fields
        })) || [];
    return { identities };
}

export async function handleSwitchActiveIdentity(payload: any): Promise<any> {
    const { did: targetDid } = payload;
    if (!targetDid) {
        throw new Types.HandledError({ error: { message: "Target DID required for switching identity.", code: "TARGET_DID_REQUIRED" } });
    }

    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
    if (!vault || !vault.identities || !Array.isArray(vault.identities)) {
        throw new Types.HandledError({ error: { message: "Vault data missing or invalid.", code: "VAULT_DATA_INVALID" } });
    }

    const targetIdentityIndex = vault.identities.findIndex((idObj: any) => (idObj.did || idObj.identityDid) === targetDid);
    if (targetIdentityIndex === -1) {
        throw new Types.HandledError({ error: { message: `Target DID ${targetDid} not found in vault.`, code: "TARGET_IDENTITY_NOT_FOUND" } });
    }

    const previousActiveDid = SessionManager.currentActiveDid;

    // Update session and local storage for active identity
    await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: targetIdentityIndex });
    vault.settings.activeIdentityIndex = targetIdentityIndex; // Persist in vault settings
    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vault });
    await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: targetDid });

    if (SessionManager.isUnlocked) {
        // If vault is unlocked, load the new identity into the session fully
        await SessionManager.loadActiveIdentity();
        if (SessionManager.currentActiveDid !== targetDid) {
            // This should not happen if loadActiveIdentity works correctly
            await SessionManager.lockVaultState(); // Lock as a precaution
            throw new Error(`Failed to switch active identity in unlocked state. Expected ${targetDid}, got ${SessionManager.currentActiveDid}. Vault locked.`);
        }
    } else {
        // If vault is locked, we just update the target DID. User will need to unlock.
        SessionManager.setCurrentActiveDid(null); // Clear current active DID from session state as it's locked
    }

    // Clear tokens for previous and new DID to force re-auth or fresh token fetch if needed
    if (previousActiveDid && previousActiveDid !== targetDid) {
        await TokenManager.clearCpTokens(previousActiveDid);
    }
    await TokenManager.clearCpTokens(targetDid); // Clear for the new one too

    await broadcastAppStateToSubscriptions();
    return {
        success: true,
        newActiveDid: SessionManager.isUnlocked ? SessionManager.currentActiveDid : targetDid, // If locked, newActiveDid is the target, UI handles unlock
        message: `Switched active identity context to ${targetDid}.`,
    };
}

export async function handleCreateNewIdentityFromSeed(payload: any): Promise<any> {
    // `payload` might be used for profile info later
    if (!SessionManager.isUnlocked) {
        throw new Types.HandledError({ error: { message: "Vault must be unlocked to create a new identity.", code: "VAULT_LOCKED" } });
    }
    const decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
    if (!decryptedSeed) {
        // This case should ideally be covered by isUnlocked check, but as a safeguard:
        throw new Types.HandledError({ error: { message: "Vault locked (in-memory seed missing).", code: "VAULT_LOCKED_SEED_MISSING" } });
    }

    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
    if (!vault || !vault.settings || typeof vault.settings.nextIdentityIndex !== "number") {
        throw new Error("Vault data/settings invalid for creating new identity."); // Internal error
    }

    const newIdentityIndex = vault.settings.nextIdentityIndex;
    let seedBuffer: Buffer | null = null;
    try {
        seedBuffer = await seedFromMnemonic(decryptedSeed);
        const masterHDKey = getMasterHDKeyFromSeed(seedBuffer);
        const newKeyPair = deriveChildKeyPair(masterHDKey, newIdentityIndex);
        const newIdentityDid = didFromEd25519(newKeyPair.publicKey);

        const newIdentityEntry: Types.AgentIdentity = {
            // Using AgentIdentity for consistency
            identityDid: newIdentityDid,
            derivationPath: newKeyPair.derivationPath,
            profile_name: `Identity ${newIdentityIndex + 1}`, // Default name
            profile_picture: undefined,
            cloudUrl: undefined,
            isAdmin: false, // Default
        };

        vault.identities.push(newIdentityEntry);
        vault.settings.nextIdentityIndex = newIdentityIndex + 1;
        await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vault });

        // Optionally, switch to this new identity or let user do it. For now, just create.
        // await broadcastAppStateToSubscriptions(); // If state changes significantly (e.g. new identity added to list)

        return {
            success: true,
            message: "New identity created locally. You may need to finalize its setup.",
            newIdentity: {
                // Return a VibeIdentity-like structure for UI
                did: newIdentityEntry.identityDid,
                label: newIdentityEntry.profile_name,
                // Any other relevant fields for UI
            },
        };
    } catch (error) {
        throw new Types.HandledError({
            error: {
                message: `Failed to create new identity: ${error instanceof Error ? error.message : String(error)}`,
                code: "NEW_IDENTITY_CREATION_FAILED",
            },
        });
    } finally {
        if (seedBuffer) wipeMemory(seedBuffer);
    }
}

export async function handleGetNextIdentityIndex(): Promise<any> {
    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
    if (!vault || !vault.settings || typeof vault.settings.nextIdentityIndex !== "number") {
        throw new Types.HandledError({
            error: {
                message: "Vault data or settings are invalid. Cannot determine next identity index.",
                code: "VAULT_SETTINGS_INVALID",
            },
        });
    }
    return { identityIndex: vault.settings.nextIdentityIndex };
}

export async function handleDeleteIdentity(payload: any): Promise<any> {
    const { did: didToDelete } = payload;
    if (!didToDelete || typeof didToDelete !== "string") {
        throw new Types.HandledError({ error: { message: "DID is required for DELETE_IDENTITY action.", code: "DID_REQUIRED" } });
    }

    // Deleting an identity is a sensitive operation.
    // Ensure vault is unlocked AND the DID to delete is the currently active one for safety,
    // or require password re-entry. For now, let's assume UI handles password prompt if needed
    // and this handler proceeds if session is active for the DID.

    if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== didToDelete) {
        // If not unlocked for this specific DID, it's safer to prevent deletion without re-auth.
        // However, the original code proceeded if tokens were available.
        // For now, let's stick to requiring active session for the DID or re-evaluate security.
        console.warn(
            `DELETE_IDENTITY: Vault not unlocked for ${didToDelete} or it's not the active session DID. Frontend should ensure this or provide password.`
        );
        // Depending on strictness, could throw error here.
    }

    console.info(`Attempting to delete identity from cloud: ${didToDelete}`);
    let accessToken: string;
    try {
        accessToken = await TokenManager.getValidCpAccessToken(didToDelete);
    } catch (tokenError: any) {
        // If token cannot be obtained, cloud deletion might not be possible.
        // Decide if local deletion should proceed or if this is a hard stop.
        // For now, treat as error for cloud deletion part.
        console.error(`DELETE_IDENTITY: Failed to get access token for cloud deletion of ${didToDelete}. Error: ${tokenError.message}`);
        throw new Types.HandledError({
            error: { message: `Failed to authenticate for cloud deletion: ${tokenError.message}`, code: "AUTH_FAILED_FOR_DELETE" },
        });
    }

    // Perform cloud deletion
    const deleteUrl = `${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${didToDelete}`;
    let cloudDeletionMessage = "Cloud deletion skipped (not connected to official cloud or error).";
    try {
        const apiResponse = await fetch(deleteUrl, {
            method: "DELETE",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        });

        if (!apiResponse.ok) {
            const errorBody = await apiResponse.json().catch(() => ({ error: `API error: ${apiResponse.status}` }));
            console.error(`DELETE_IDENTITY: Cloud API call failed for ${didToDelete}. Status: ${apiResponse.status}, Error: ${errorBody.error}`);
            // Don't stop local deletion yet, but report cloud failure.
            cloudDeletionMessage = `Cloud deletion failed: ${errorBody.error || apiResponse.statusText}. Proceeding with local removal.`;
            // Potentially throw here if cloud deletion is mandatory before local.
        } else {
            const responseJson = await apiResponse.json();
            cloudDeletionMessage = responseJson.message || "Identity deleted from cloud.";
            console.info(`DELETE_IDENTITY: Cloud API call successful for ${didToDelete}. Message: ${cloudDeletionMessage}`);
        }
    } catch (fetchError: any) {
        console.error(`DELETE_IDENTITY: Error during fetch for cloud deletion of ${didToDelete}: ${fetchError.message}`);
        cloudDeletionMessage = `Cloud deletion fetch error: ${fetchError.message}. Proceeding with local removal.`;
    }

    await TokenManager.clearCpTokens(didToDelete); // Clear any stored tokens for this DID

    // Perform local deletion from vault
    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    let vault = vaultResult[Constants.STORAGE_KEY_VAULT];
    if (!vault || !vault.identities) {
        throw new Types.HandledError({ error: { message: "Vault data not found for local deletion.", code: "VAULT_NOT_FOUND" } });
    }
    const initialIdentitiesCount = vault.identities.length;
    vault.identities = vault.identities.filter((id: any) => (id.did || id.identityDid) !== didToDelete);

    if (vault.identities.length === initialIdentitiesCount) {
        // DID not found locally, but cloud deletion might have happened.
        return { success: true, message: `Identity ${didToDelete} not found locally. ${cloudDeletionMessage}` };
    }

    // Adjust settings if the deleted identity was active or affects nextIdentityIndex (though usually not)
    if (vault.settings.activeIdentityIndex >= vault.identities.length) {
        vault.settings.activeIdentityIndex = vault.identities.length > 0 ? 0 : -1; // Default to first or none
    }
    // nextIdentityIndex usually only increments, not related to deletion of specific DIDs by index.

    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vault });

    // Clear last active DID if it was the one deleted
    const localData = await chrome.storage.local.get(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
    if (localData[Constants.STORAGE_KEY_LAST_ACTIVE_DID] === didToDelete) {
        await chrome.storage.local.remove(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
        console.info(`Cleared lastActiveDid as it was the deleted identity: ${didToDelete}`);
    }

    // If the deleted identity was the one active in the current session, lock the vault.
    if (SessionManager.currentActiveDid === didToDelete) {
        await SessionManager.lockVaultState(); // This also broadcasts app state
        console.info(`Locked vault as the deleted identity ${didToDelete} was active in session.`);
    } else {
        // If a different identity was active, or vault was already locked, still broadcast
        await broadcastAppStateToSubscriptions();
    }

    return { success: true, message: `Identity ${didToDelete} removed locally. ${cloudDeletionMessage}` };
}
