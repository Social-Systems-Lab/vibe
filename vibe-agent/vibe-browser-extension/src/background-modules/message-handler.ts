import { Buffer } from "buffer";
import * as Constants from "./constants";
import * as Types from "./types";
import * as TokenManager from "./token-manager";
import * as SessionManager from "./session-manager";

import {
    generateMnemonic,
    generateSalt,
    deriveEncryptionKey,
    encryptData,
    seedFromMnemonic,
    getMasterHDKeyFromSeed,
    deriveChildKeyPair,
    wipeMemory,
    decryptData,
    validateMnemonic,
    signMessage,
} from "../lib/crypto";
import { didFromEd25519 } from "../lib/identity";

export async function handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
    const { action, payload, requestId } = message;

    let responsePayload: any;
    let responseType = "VIBE_AGENT_RESPONSE";
    try {
        switch (action) {
            case "init":
                // Attempt to load from session first (checks for decrypted seed)
                if (!SessionManager.isUnlocked) {
                    await SessionManager.loadActiveIdentityFromSessionInternal();
                }

                if (SessionManager.isUnlocked && SessionManager.currentActiveDid) {
                    // Successfully loaded an active identity from session (vault is unlocked)
                    responsePayload = {
                        did: SessionManager.currentActiveDid,
                        permissions: { "profile:read": "always" }, // Example permission
                        message: "Successfully initialized.",
                        code: "INITIALIZED_UNLOCKED",
                    };
                } else {
                    // Vault is locked, or no active identity could be loaded from session
                    const localData = await chrome.storage.local.get(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
                    const lastActiveDid = localData[Constants.STORAGE_KEY_LAST_ACTIVE_DID];

                    if (lastActiveDid) {
                        // We know the last active DID, but the vault is locked.
                        responseType = "VIBE_AGENT_RESPONSE_ERROR"; // Still an "error" in terms of full init
                        responsePayload = {
                            error: {
                                message: "Vault is locked. Unlock to access your last active identity.",
                                code: "UNLOCK_REQUIRED_FOR_LAST_ACTIVE",
                                lastActiveDid: lastActiveDid,
                            },
                        };
                    } else {
                        // Vault is locked, and we don't even know the last active DID (e.g., fresh install, or storage cleared)
                        // This could also mean setup is not complete, or setup is complete but no identities exist.
                        const setupCompleteResult = await chrome.storage.local.get(Constants.STORAGE_KEY_SETUP_COMPLETE);
                        const vaultAfterSetupCheck = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];

                        if (!setupCompleteResult[Constants.STORAGE_KEY_SETUP_COMPLETE]) {
                            responseType = "VIBE_AGENT_RESPONSE_ERROR";
                            responsePayload = { error: { message: "Setup not complete.", code: "SETUP_NOT_COMPLETE" } };
                        } else if (
                            setupCompleteResult[Constants.STORAGE_KEY_SETUP_COMPLETE] &&
                            (!vaultAfterSetupCheck || !vaultAfterSetupCheck.identities || vaultAfterSetupCheck.identities.length === 0)
                        ) {
                            // Setup is marked complete, but no identities exist. This happens if user cancels first identity creation.
                            responseType = "VIBE_AGENT_RESPONSE_ERROR";
                            responsePayload = {
                                error: {
                                    message: "Setup is complete but no identities found. Please create your first identity.",
                                    code: "FIRST_IDENTITY_CREATION_REQUIRED",
                                },
                            };
                        } else {
                            // Setup complete, identities exist, but vault is locked and no last active DID.
                            responseType = "VIBE_AGENT_RESPONSE_ERROR";
                            responsePayload = { error: { message: "Vault is locked. Please unlock.", code: "VAULT_LOCKED_NO_LAST_ACTIVE" } };
                        }
                    }
                }
                break;

            case "UNLOCK_VAULT": {
                console.log("Processing 'UNLOCK_VAULT'");
                const { password } = payload;
                if (!password || typeof password !== "string") throw new Error("Password is required for UNLOCK_VAULT.");
                const localData = await chrome.storage.local.get([
                    Constants.STORAGE_KEY_VAULT,
                    Constants.STORAGE_KEY_VAULT_SALT,
                    Constants.STORAGE_KEY_LAST_ACTIVE_DID,
                ]);
                const vaultData = localData[Constants.STORAGE_KEY_VAULT];
                const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];
                const lastActiveDidFromStorage = localData[Constants.STORAGE_KEY_LAST_ACTIVE_DID];

                if (!vaultData || !saltHex) throw new Error("Vault or salt not found. Setup may not be complete.");
                const salt = Buffer.from(saltHex, "hex");
                let encryptionKey: CryptoKey | null = null; // For scoping, ensure it's not accidentally reused
                let decryptedSeedAttempt: string | null = null;
                try {
                    encryptionKey = await deriveEncryptionKey(password, salt);
                    decryptedSeedAttempt = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);
                    if (!decryptedSeedAttempt) throw new Error("Decryption failed, returned null seed.");

                    let activeIdentityIndexToSet = vaultData.settings?.activeIdentityIndex ?? 0;

                    // If we have a lastActiveDid, try to find its index and use that
                    if (lastActiveDidFromStorage && vaultData.identities) {
                        const foundIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === lastActiveDidFromStorage);
                        if (foundIndex !== -1) {
                            activeIdentityIndexToSet = foundIndex;
                            // Also update the vault's persisted activeIdentityIndex to match lastActiveDid
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

                    await chrome.storage.session.set({
                        [Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt,
                        [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: activeIdentityIndexToSet,
                    });
                    await SessionManager.loadActiveIdentityFromSessionInternal(); // This sets currentActiveDid and isUnlocked
                    if (!SessionManager.isUnlocked || !SessionManager.currentActiveDid)
                        throw new Error("Failed to load active identity into global state after unlock.");

                    // Persist this successfully unlocked DID as the last active one
                    if (SessionManager.currentActiveDid) {
                        await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
                    }

                    // JWT is no longer proactively checked here. It will be handled by getValidCpAccessToken on demand.
                    console.info(`Vault unlocked for ${SessionManager.currentActiveDid}. API calls will attempt to use/refresh tokens.`);

                    responsePayload = { success: true, did: SessionManager.currentActiveDid, message: "Vault unlocked." };
                } catch (error) {
                    // This catch belongs to the try block above
                    await SessionManager.clearSessionStateInternal(); // Clear session on any unlock error
                    throw new Error(`Failed to unlock vault. ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                    // This finally belongs to the try block above
                    // encryptionKey is a CryptoKey object, no explicit wipe method. It will be garbage collected.
                    if (decryptedSeedAttempt) decryptedSeedAttempt = null; // Clear sensitive data from memory
                }
                break;
            }

            case "LOCK_VAULT":
                await SessionManager.clearSessionStateInternal(); // This clears seed, active index, and all JWTs
                responsePayload = { success: true, message: "Vault locked." };
                break;

            case "GET_LOCK_STATE":
                responsePayload = { isUnlocked: SessionManager.isUnlocked, did: SessionManager.currentActiveDid };
                break;

            case "SETUP_CREATE_VAULT": {
                await SessionManager.clearSessionStateInternal();
                const { password } = payload;
                if (!password || typeof password !== "string") throw new Error("Password is required for SETUP_CREATE_VAULT.");
                const mnemonic = generateMnemonic();
                const salt = generateSalt();
                const saltHex = Buffer.from(salt).toString("hex");
                let encryptionKey: CryptoKey | null = null;
                let seed: Buffer | null = null;
                try {
                    encryptionKey = await deriveEncryptionKey(password, salt);
                    const encryptedMnemonicData = await encryptData(mnemonic, encryptionKey);
                    seed = await seedFromMnemonic(mnemonic);
                    // const masterHDKey = getMasterHDKeyFromSeed(seed); // Not needed here as no DID is created
                    const vaultData = {
                        encryptedSeedPhrase: encryptedMnemonicData,
                        identities: [],
                        settings: { nextAccountIndex: 0, activeIdentityIndex: -1 },
                    };
                    await chrome.storage.local.set({
                        [Constants.STORAGE_KEY_VAULT_SALT]: saltHex,
                        [Constants.STORAGE_KEY_VAULT]: vaultData,
                        [Constants.STORAGE_KEY_SETUP_COMPLETE]: true, // Mark setup as complete here
                    });
                    await chrome.storage.session.set({
                        [Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: mnemonic,
                        [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: -1,
                    });
                    SessionManager.setCurrentActiveDid(null);
                    SessionManager.setIsUnlocked(true);
                    console.log("SETUP_CREATE_VAULT: Vault created, pre-unlocked (seed in session), no identities yet.");
                    responsePayload = { mnemonic };
                } finally {
                    if (seed) wipeMemory(seed);
                }
                break;
            }

            case "SETUP_IMPORT_VAULT": {
                // This case seems to create a first identity, might need review against new flows
                const { importedMnemonic, password } = payload;
                if (!importedMnemonic || !password) throw new Error("Mnemonic and password required.");
                if (!validateMnemonic(importedMnemonic)) throw new Error("Invalid mnemonic provided.");
                await SessionManager.clearSessionStateInternal();
                const salt = generateSalt();
                const saltHex = Buffer.from(salt).toString("hex");
                let encryptionKey: CryptoKey | null = null;
                let seed: Buffer | null = null;
                try {
                    encryptionKey = await deriveEncryptionKey(password, salt);
                    const encryptedMnemonicData = await encryptData(importedMnemonic, encryptionKey);
                    seed = await seedFromMnemonic(importedMnemonic);
                    const masterHDKey = getMasterHDKeyFromSeed(seed);
                    const firstIdentityKeys = deriveChildKeyPair(masterHDKey, 0);
                    const firstDid = didFromEd25519(firstIdentityKeys.publicKey);
                    const vaultData = {
                        encryptedSeedPhrase: encryptedMnemonicData,
                        identities: [
                            {
                                did: firstDid,
                                derivationPath: firstIdentityKeys.derivationPath,
                                profile_name: "Imported Identity",
                                profile_picture: null,
                                cloudUrl: null,
                            },
                        ],
                        settings: { nextAccountIndex: 1, activeIdentityIndex: 0 },
                    };
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT_SALT]: saltHex, [Constants.STORAGE_KEY_VAULT]: vaultData });
                    responsePayload = {
                        success: true,
                        did: firstDid,
                        message: "Vault imported. Proceed to finalize.",
                    };
                } finally {
                    if (seed) wipeMemory(seed);
                }
                break;
            }

            case "GET_ACTIVE_IDENTITY_DETAILS": {
                if (!SessionManager.isUnlocked || !SessionManager.currentActiveDid) {
                    throw new Error("Vault is locked or no active DID.");
                }
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vault || !vault.identities) throw new Error("Vault data not found.");
                const activeIdentityData = vault.identities.find((idObj: any) => idObj.did === SessionManager.currentActiveDid);
                if (!activeIdentityData) throw new Error(`Active DID ${SessionManager.currentActiveDid} not found.`);
                responsePayload = {
                    did: activeIdentityData.did,
                    profileName: activeIdentityData.profile_name,
                    profilePictureUrl: activeIdentityData.profile_picture,
                    cloudUrl: activeIdentityData.cloudUrl,
                    instanceStatus: (activeIdentityData as any).instanceStatus,
                    isAdmin: (activeIdentityData as any).isAdmin,
                };
                break;
            }

            case "CLOSE_SETUP_TAB": {
                if (sender.tab && sender.tab.id) {
                    chrome.tabs.remove(sender.tab.id);
                    responsePayload = { success: true, message: "Setup tab closed." };
                } else {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = { success: false, message: "No tab ID to close." };
                }
                break;
            }

            case "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES": {
                const { importedMnemonic, password } = payload;
                if (!importedMnemonic || !validateMnemonic(importedMnemonic)) throw new Error("Valid mnemonic required.");
                if (!password) throw new Error("Password required.");
                await SessionManager.clearSessionStateInternal();
                const salt = generateSalt();
                const saltHex = Buffer.from(salt).toString("hex");
                const encryptionKey = await deriveEncryptionKey(password, salt);
                const encryptedMnemonicData = await encryptData(importedMnemonic, encryptionKey);
                await chrome.storage.local.set({
                    [Constants.STORAGE_KEY_VAULT_SALT]: saltHex,
                    [Constants.STORAGE_KEY_VAULT]: {
                        encryptedSeedPhrase: encryptedMnemonicData,
                        identities: [],
                        settings: { nextAccountIndex: 0, activeIdentityIndex: -1 },
                    },
                });
                const masterSeedBuffer = await seedFromMnemonic(importedMnemonic);
                const masterHDKey = getMasterHDKeyFromSeed(masterSeedBuffer);
                const recoveredIdentities: any[] = [];
                let consecutiveInactiveCount = 0;
                let currentIndex = 0;
                let nextAccountIndexToStore = 0;
                while (consecutiveInactiveCount < Constants.GAP_LIMIT) {
                    const keyPair = deriveChildKeyPair(masterHDKey, currentIndex);
                    const currentDid = didFromEd25519(keyPair.publicKey);
                    const statusUrl = `${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${currentDid}/status`;
                    const statusResponse = await fetch(statusUrl);
                    let isActive = false;
                    let instanceStatus;
                    if (statusResponse.ok) {
                        const data = await statusResponse.json();
                        isActive = data.isActive || false;
                        instanceStatus = data.instanceStatus;
                    } else if (statusResponse.status !== 404) {
                        console.warn(`Status check for ${currentDid} failed: ${statusResponse.status}`);
                    }
                    if (isActive) {
                        recoveredIdentities.push({
                            did: currentDid,
                            derivationPath: keyPair.derivationPath,
                            profile_name: `Recovered Identity ${currentIndex + 1}`,
                            instanceStatus: instanceStatus,
                        });
                        consecutiveInactiveCount = 0;
                        try {
                            const nonce = crypto.randomUUID().toString();
                            const timestamp = new Date().toISOString();
                            const messageToSign = `${currentDid}|${nonce}|${timestamp}`;
                            const signature = await signMessage(keyPair.privateKey, messageToSign);
                            const loginResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/login`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ did: currentDid, nonce, timestamp, signature }),
                            });
                            if (loginResponse.ok) {
                                const result = await loginResponse.json();
                                const tokenDetails = result.tokenDetails as Types.TokenDetails;
                                if (tokenDetails) await TokenManager.storeCpTokens(currentDid, tokenDetails);
                            } else {
                                console.warn(`Proactive login failed for ${currentDid}: ${loginResponse.status}`);
                            }
                        } catch (loginError: any) {
                            console.error(`Error during proactive login for ${currentDid}:`, loginError.message);
                        }
                        nextAccountIndexToStore = currentIndex + 1;
                    } else {
                        consecutiveInactiveCount++;
                    }
                    currentIndex++;
                }
                wipeMemory(masterSeedBuffer);
                const finalVaultData = {
                    encryptedSeedPhrase: encryptedMnemonicData,
                    identities: recoveredIdentities,
                    settings: { nextAccountIndex: nextAccountIndexToStore, activeIdentityIndex: recoveredIdentities.length > 0 ? 0 : -1 },
                };
                await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: finalVaultData, [Constants.STORAGE_KEY_SETUP_COMPLETE]: true });
                if (recoveredIdentities.length > 0) {
                    await chrome.storage.session.set({
                        [Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: importedMnemonic,
                        [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0,
                    });
                    await SessionManager.loadActiveIdentityFromSessionInternal();
                    responsePayload = {
                        success: true,
                        message: `Recovered ${recoveredIdentities.length} identities.`,
                        recoveredCount: recoveredIdentities.length,
                        primaryDid: recoveredIdentities[0].did,
                    };
                } else {
                    responsePayload = { success: true, message: "No active identities found.", recoveredCount: 0 };
                }
                break;
            }

            case "SETUP_COMPLETE_AND_FINALIZE": {
                // New identity registration
                const { identityName, identityPicture, cloudUrl, claimCode, password, mnemonic } = payload;
                if (!password || !mnemonic) throw new Error("Password and mnemonic required.");
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vaultData || !vaultData.identities || vaultData.identities.length === 0) {
                    // Should be empty for first identity
                    throw new Error("Vault not properly initialized.");
                }
                const identityDid = vaultData.identities[0].did; // Assumes first identity is being finalized
                if (cloudUrl === Constants.OFFICIAL_VIBE_CLOUD_URL) {
                    let seedForSigning: Buffer | null = null;
                    try {
                        seedForSigning = await seedFromMnemonic(mnemonic);
                        const masterKey = getMasterHDKeyFromSeed(seedForSigning);
                        const keyPair = deriveChildKeyPair(masterKey, vaultData.settings.activeIdentityIndex || 0); // activeIdentityIndex should be 0
                        const nonce = crypto.randomUUID().toString();
                        const timestamp = new Date().toISOString();
                        const messageToSign = `${identityDid}|${nonce}|${timestamp}|${claimCode || ""}`;
                        const signature = await signMessage(keyPair.privateKey, messageToSign);
                        const registerPayload: any = { did: identityDid, nonce, timestamp, signature };
                        if (identityName) registerPayload.profileName = identityName;
                        if (identityPicture) registerPayload.profilePictureUrl = identityPicture;
                        if (claimCode) registerPayload.claimCode = claimCode;
                        const registerResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(registerPayload),
                        });
                        if (!registerResponse.ok) {
                            const errBody = await registerResponse.json().catch(() => ({ error: "Unknown registration error" }));
                            throw new Error(`Registration failed: ${errBody.error}`);
                        }
                        const result = await registerResponse.json();
                        const serverIdentity = result.identity as Types.Identity;
                        const tokenDetails = result.tokenDetails as Types.TokenDetails;
                        await TokenManager.storeCpTokens(identityDid, tokenDetails);
                        vaultData.identities[0].profile_name = serverIdentity.profileName;
                        vaultData.identities[0].profile_picture = serverIdentity.profilePictureUrl;
                        vaultData.identities[0].cloudUrl = serverIdentity.instanceUrl;
                        (vaultData.identities[0] as any).instanceId = serverIdentity.instanceId;
                        (vaultData.identities[0] as any).instanceStatus = serverIdentity.instanceStatus;
                        (vaultData.identities[0] as any).isAdmin = serverIdentity.isAdmin;
                    } finally {
                        if (seedForSigning) wipeMemory(seedForSigning);
                    }
                } else if (cloudUrl) {
                    vaultData.identities[0].profile_name = identityName;
                    vaultData.identities[0].profile_picture = identityPicture;
                    vaultData.identities[0].cloudUrl = cloudUrl;
                }
                await chrome.storage.local.set({
                    [Constants.STORAGE_KEY_VAULT]: vaultData,
                    [Constants.STORAGE_KEY_SETUP_COMPLETE]: true, // Already set in SETUP_CREATE_VAULT
                    // currentIdentityDID: identityDid, // This was an old key, lastActiveDid is preferred
                });
                // Session already set by SETUP_CREATE_VAULT, just ensure active index is correct
                await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0 });
                await SessionManager.loadActiveIdentityFromSessionInternal();
                responsePayload = { success: true, message: "Setup finalized.", did: identityDid, identityName: vaultData.identities[0].profile_name };
                break;
            }

            case "UPDATE_IDENTITY_PROFILE": {
                const { did, profileName, profilePictureUrl, claimCode } = payload;
                if (!did) throw new Error("DID required.");
                if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== did) throw new Error("Target identity not active or vault locked.");
                const sessionData = await chrome.storage.session.get(Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                const decryptedSeed = sessionData[Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                if (!decryptedSeed) throw new Error("Vault locked.");
                const localVault = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];
                const identityIndex = localVault.identities.findIndex((idObj: any) => idObj.did === did);
                if (identityIndex === -1) throw new Error("Identity not found in vault.");
                let seedBuffer: Buffer | null = null;
                try {
                    seedBuffer = await seedFromMnemonic(decryptedSeed);
                    const masterKey = getMasterHDKeyFromSeed(seedBuffer);
                    const keyPair = deriveChildKeyPair(masterKey, identityIndex);
                    const nonce = crypto.randomUUID().toString();
                    const timestamp = new Date().toISOString();
                    const updateOwnerPayload: any = { nonce, timestamp };
                    if (profileName !== undefined) updateOwnerPayload.profileName = profileName;
                    if (profilePictureUrl !== undefined) updateOwnerPayload.profilePictureUrl = profilePictureUrl;
                    if (claimCode !== undefined) updateOwnerPayload.claimCode = claimCode;
                    const fieldsToSign = [claimCode || "", updateOwnerPayload.profileName || "", updateOwnerPayload.profilePictureUrl || ""];
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
                        const errBody = await updateResponse.json().catch(() => ({ error: "Unknown update error" }));
                        throw new Error(`Profile update failed: ${errBody.error}`);
                    }
                    const updatedServerIdentity = (await updateResponse.json()) as Types.Identity & { token?: string };
                    localVault.identities[identityIndex].profile_name = updatedServerIdentity.profileName;
                    localVault.identities[identityIndex].profile_picture = updatedServerIdentity.profilePictureUrl;
                    if (updatedServerIdentity.isAdmin) (localVault.identities[identityIndex] as any).isAdmin = true;
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: localVault });
                    if ((updatedServerIdentity as any).token) {
                        // Fallback for old token field
                        const sessionAccessTokenKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${did}`;
                        const sessionAccessTokenExpiresAtKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${did}`;
                        const defaultExpiry = Math.floor(Date.now() / 1000) + 900;
                        await chrome.storage.session.set({
                            [sessionAccessTokenKey]: (updatedServerIdentity as any).token,
                            [sessionAccessTokenExpiresAtKey]: defaultExpiry,
                        });
                    }
                    responsePayload = {
                        success: true,
                        message: "Profile updated.",
                        updatedProfile: { profileName: updatedServerIdentity.profileName, profilePictureUrl: updatedServerIdentity.profilePictureUrl },
                    };
                } finally {
                    if (seedBuffer) wipeMemory(seedBuffer);
                }
                break;
            }

            case "FETCH_FULL_IDENTITY_DETAILS": {
                const { did } = payload;
                if (!did || typeof did !== "string") throw new Error("DID is required.");
                let accessToken = await TokenManager.getValidCpAccessToken(did);
                const fetchUrl = `${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${did}`;
                const fetchResponse = await fetch(fetchUrl, {
                    method: "GET",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                });
                if (!fetchResponse.ok) {
                    const errorBody = await fetchResponse.json().catch(() => ({ error: `Fetch failed: ${fetchResponse.status}` }));
                    if (fetchResponse.status === 401) {
                        await TokenManager.clearCpTokens(did);
                        throw new Error(`FULL_LOGIN_REQUIRED: Access token rejected for ${did}.`);
                    }
                    throw new Error(errorBody.error || `API error: ${fetchResponse.status}`);
                }
                const serverIdentity = (await fetchResponse.json()) as Types.Identity;
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (vaultData && vaultData.identities) {
                    const identityIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === did);
                    if (identityIndex !== -1) {
                        const localIdentity = vaultData.identities[identityIndex];
                        localIdentity.profile_name = serverIdentity.profileName || localIdentity.profile_name;
                        localIdentity.profile_picture = serverIdentity.profilePictureUrl || localIdentity.profile_picture;
                        localIdentity.cloudUrl = serverIdentity.instanceUrl || localIdentity.cloudUrl;
                        (localIdentity as any).instanceStatus = serverIdentity.instanceStatus;
                        (localIdentity as any).instanceId = serverIdentity.instanceId;
                        (localIdentity as any).isAdmin = serverIdentity.isAdmin;
                        (localIdentity as any).instanceCreatedAt = serverIdentity.instanceCreatedAt;
                        (localIdentity as any).instanceUpdatedAt = serverIdentity.instanceUpdatedAt;
                        (localIdentity as any).instanceErrorDetails = serverIdentity.instanceErrorDetails;
                        await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vaultData });
                    }
                }
                responsePayload = { success: true, identity: serverIdentity };
                break;
            }

            case "REQUEST_LOGIN_FLOW": {
                const { did, password } = payload;
                if (!did) throw new Error("DID is required.");
                if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== did) {
                    if (password) {
                        const localData = await chrome.storage.local.get([Constants.STORAGE_KEY_VAULT, Constants.STORAGE_KEY_VAULT_SALT]);
                        const vaultData = localData[Constants.STORAGE_KEY_VAULT];
                        const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];
                        if (!vaultData || !saltHex) throw new Error("Vault/salt not found.");
                        const salt = Buffer.from(saltHex, "hex");
                        const encryptionKey = await deriveEncryptionKey(password, salt);
                        const decryptedSeedAttempt = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);
                        if (!decryptedSeedAttempt) throw new Error("Decryption failed.");
                        const identityIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === did);
                        if (identityIndex === -1) throw new Error(`DID ${did} not found in vault.`);
                        await chrome.storage.session.set({
                            [Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt,
                            [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: identityIndex,
                        });
                        await SessionManager.loadActiveIdentityFromSessionInternal();
                        if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== did) {
                            throw new Error("Failed to unlock/set active identity.");
                        }
                    } else {
                        throw { message: "Vault locked. Password required.", code: "VAULT_LOCKED_FOR_LOGIN" };
                    }
                }
                const decryptedSeed = (await chrome.storage.session.get(Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE))[
                    Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE
                ];
                const activeIdx = (await chrome.storage.session.get(Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX))[
                    Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX
                ];
                if (!decryptedSeed || typeof activeIdx !== "number") throw new Error("Session seed/index missing.");
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
                    responsePayload = { success: true, message: "Logged in.", identity: result.identity };
                } finally {
                    if (seedForSigning) wipeMemory(seedForSigning);
                }
                break;
            }

            case "GET_ALL_IDENTITIES": {
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
                responsePayload = { identities: vault && vault.identities && Array.isArray(vault.identities) ? vault.identities : [] };
                break;
            }

            case "SWITCH_ACTIVE_IDENTITY": {
                const { did: targetDid } = payload;
                if (!targetDid) throw new Error("Target DID required.");
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vault || !vault.identities || !Array.isArray(vault.identities)) throw new Error("Vault data missing.");
                const targetIdentityIndex = vault.identities.findIndex((idObj: any) => idObj.did === targetDid);
                if (targetIdentityIndex === -1) throw new Error(`Target DID ${targetDid} not found.`);
                const previousActiveDid = SessionManager.currentActiveDid;
                await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: targetIdentityIndex });
                vault.settings.activeIdentityIndex = targetIdentityIndex;
                await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vault });
                await SessionManager.loadActiveIdentityFromSessionInternal();
                if (SessionManager.currentActiveDid !== targetDid) {
                    await SessionManager.clearSessionStateInternal();
                    throw new Error(`Failed to switch. Expected ${targetDid}, got ${SessionManager.currentActiveDid}.`);
                }
                if (SessionManager.currentActiveDid) {
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
                }
                if (previousActiveDid && previousActiveDid !== targetDid) {
                    const prevAccessTokenKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${previousActiveDid}`;
                    const prevAccessTokenExpiresAtKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${previousActiveDid}`;
                    await chrome.storage.session.remove([prevAccessTokenKey, prevAccessTokenExpiresAtKey]);
                }
                const newAccessTokenKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${targetDid}`;
                const newAccessTokenExpiresAtKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${targetDid}`;
                await chrome.storage.session.remove([newAccessTokenKey, newAccessTokenExpiresAtKey]);
                responsePayload = {
                    success: true,
                    newActiveDid: SessionManager.currentActiveDid,
                    message: `Switched to ${SessionManager.currentActiveDid}.`,
                };
                break;
            }

            case "CREATE_NEW_IDENTITY_FROM_SEED": {
                if (!SessionManager.isUnlocked) throw new Error("Vault must be unlocked.");
                const sessionData = await chrome.storage.session.get(Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                const decryptedSeed = sessionData[Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                if (!decryptedSeed) throw new Error("Decrypted seed not in session.");
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vault || !vault.settings || typeof vault.settings.nextAccountIndex !== "number") {
                    throw new Error("Vault data/settings invalid.");
                }
                const newAccountIndex = vault.settings.nextAccountIndex;
                let seedBuffer: Buffer | null = null;
                try {
                    seedBuffer = await seedFromMnemonic(decryptedSeed);
                    const masterHDKey = getMasterHDKeyFromSeed(seedBuffer);
                    const newKeyPair = deriveChildKeyPair(masterHDKey, newAccountIndex);
                    const newIdentityDid = didFromEd25519(newKeyPair.publicKey);
                    const newIdentityEntry = {
                        did: newIdentityDid,
                        derivationPath: newKeyPair.derivationPath,
                        profile_name: `Identity ${newAccountIndex + 1}`,
                        profile_picture: null,
                        cloudUrl: null,
                    };
                    vault.identities.push(newIdentityEntry);
                    vault.settings.nextAccountIndex = newAccountIndex + 1;
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vault });
                    responsePayload = {
                        success: true,
                        message: "New identity created.",
                        newIdentity: newIdentityEntry,
                    };
                } finally {
                    if (seedBuffer) wipeMemory(seedBuffer);
                }
                break;
            }

            case "GET_NEXT_ACCOUNT_INDEX": {
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vault || !vault.settings || typeof vault.settings.nextAccountIndex !== "number") {
                    throw new Error("Vault data/settings invalid.");
                }
                responsePayload = { accountIndex: vault.settings.nextAccountIndex };
                break;
            }

            case "SETUP_NEW_IDENTITY_AND_FINALIZE": {
                const { accountIndexToUse, identityName, identityPicture, cloudUrl, claimCode, password } = payload;
                if (typeof accountIndexToUse !== "number" || (!SessionManager.isUnlocked && !password)) {
                    throw new Error("Index required; password if locked.");
                }
                if (!SessionManager.isUnlocked && password) {
                    const localData = await chrome.storage.local.get([Constants.STORAGE_KEY_VAULT, Constants.STORAGE_KEY_VAULT_SALT]);
                    const vaultDataForUnlock = localData[Constants.STORAGE_KEY_VAULT];
                    const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];
                    if (!vaultDataForUnlock || !saltHex) throw new Error("Vault/salt not found.");
                    const salt = Buffer.from(saltHex, "hex");
                    const encryptionKey = await deriveEncryptionKey(password, salt);
                    const decryptedSeedAttempt = await decryptData(vaultDataForUnlock.encryptedSeedPhrase, encryptionKey);
                    if (!decryptedSeedAttempt) throw new Error("Decryption failed.");
                    await chrome.storage.session.set({ [Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt });
                    SessionManager.setIsUnlocked(true);
                }
                const sessionData = await chrome.storage.session.get(Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                const decryptedSeed = sessionData[Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                if (!decryptedSeed) throw new Error("Vault locked or seed missing.");
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vaultData || !vaultData.settings || typeof vaultData.settings.nextAccountIndex !== "number") {
                    throw new Error("Vault data/settings invalid.");
                }
                const newAccountIndex = vaultData.settings.nextAccountIndex; // Always use vault's next index
                let seedBuffer: Buffer | null = null;
                try {
                    seedBuffer = await seedFromMnemonic(decryptedSeed);
                    const masterHDKey = getMasterHDKeyFromSeed(seedBuffer);
                    const newKeyPair = deriveChildKeyPair(masterHDKey, newAccountIndex);
                    const newIdentityDid = didFromEd25519(newKeyPair.publicKey);
                    const newIdentityEntry: any = {
                        // Use 'any' for flexibility with extra fields
                        did: newIdentityDid,
                        derivationPath: newKeyPair.derivationPath,
                        profile_name: identityName || `Identity ${newAccountIndex + 1}`,
                        profile_picture: identityPicture || null,
                        cloudUrl: null,
                    };
                    vaultData.identities.push(newIdentityEntry);
                    vaultData.settings.nextAccountIndex = newAccountIndex + 1;
                    if (cloudUrl === Constants.OFFICIAL_VIBE_CLOUD_URL) {
                        const nonce = crypto.randomUUID().toString();
                        const timestamp = new Date().toISOString();
                        const messageToSign = `${newIdentityDid}|${nonce}|${timestamp}|${claimCode || ""}`;
                        const signature = await signMessage(newKeyPair.privateKey, messageToSign);
                        const registerPayload: any = { did: newIdentityDid, nonce, timestamp, signature };
                        if (identityName) registerPayload.profileName = identityName;
                        if (identityPicture) registerPayload.profilePictureUrl = identityPicture;
                        if (claimCode) registerPayload.claimCode = claimCode;
                        const registerResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(registerPayload),
                        });
                        if (!registerResponse.ok) {
                            const errBody = await registerResponse.json().catch(() => ({ error: "Registration error" }));
                            throw new Error(`Registration failed: ${errBody.error}`);
                        }
                        const result = await registerResponse.json();
                        const serverIdentity = result.identity as Types.Identity;
                        const tokenDetails = result.tokenDetails as Types.TokenDetails;
                        await TokenManager.storeCpTokens(newIdentityDid, tokenDetails);
                        newIdentityEntry.profile_name = serverIdentity.profileName || newIdentityEntry.profile_name;
                        newIdentityEntry.profile_picture = serverIdentity.profilePictureUrl || newIdentityEntry.profile_picture;
                        newIdentityEntry.cloudUrl = serverIdentity.instanceUrl;
                        newIdentityEntry.instanceId = serverIdentity.instanceId;
                        newIdentityEntry.instanceStatus = serverIdentity.instanceStatus;
                        newIdentityEntry.isAdmin = serverIdentity.isAdmin;
                    } else if (cloudUrl) {
                        newIdentityEntry.cloudUrl = cloudUrl;
                    }
                    const newIdentityEntryIndexInVault = vaultData.identities.length - 1;
                    vaultData.settings.activeIdentityIndex = newIdentityEntryIndexInVault;
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vaultData });
                    await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: newIdentityEntryIndexInVault });
                    await SessionManager.loadActiveIdentityFromSessionInternal();
                    if (SessionManager.currentActiveDid) {
                        await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
                    }
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_SETUP_COMPLETE]: true });
                    responsePayload = {
                        success: true,
                        message: `New identity ${newIdentityDid} created and finalized.`,
                        did: newIdentityDid,
                        identityName: newIdentityEntry.profile_name,
                    };
                } finally {
                    if (seedBuffer) wipeMemory(seedBuffer);
                }
                break;
            }

            case "FINALIZE_NEW_IDENTITY_SETUP": {
                // Potentially deprecated by SETUP_NEW_IDENTITY_AND_FINALIZE
                const { didToFinalize, accountIndex, identityName, identityPicture, cloudUrl, claimCode, password } = payload;
                if (!didToFinalize || typeof accountIndex !== "number" || !password) throw new Error("Required fields missing.");
                if (!SessionManager.isUnlocked) {
                    const localData = await chrome.storage.local.get([Constants.STORAGE_KEY_VAULT, Constants.STORAGE_KEY_VAULT_SALT]);
                    const vaultDataForUnlock = localData[Constants.STORAGE_KEY_VAULT];
                    const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];
                    if (!vaultDataForUnlock || !saltHex) throw new Error("Vault/salt not found.");
                    const salt = Buffer.from(saltHex, "hex");
                    const encryptionKey = await deriveEncryptionKey(password, salt);
                    const decryptedSeedAttempt = await decryptData(vaultDataForUnlock.encryptedSeedPhrase, encryptionKey);
                    if (!decryptedSeedAttempt) throw new Error("Decryption failed.");
                    await chrome.storage.session.set({ [Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt });
                    // SessionManager.setIsUnlocked(true); // Not setting global unlock, just for this operation
                }
                const sessionData = await chrome.storage.session.get(Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                const decryptedSeed = sessionData[Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                if (!decryptedSeed) throw new Error("Vault locked or seed missing.");
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vaultData || !vaultData.identities) throw new Error("Vault data missing.");
                const identityEntryIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === didToFinalize);
                if (identityEntryIndex === -1) throw new Error(`Identity ${didToFinalize} not found.`);
                if (cloudUrl === Constants.OFFICIAL_VIBE_CLOUD_URL) {
                    let seedForSigning: Buffer | null = null;
                    try {
                        seedForSigning = await seedFromMnemonic(decryptedSeed);
                        const masterKey = getMasterHDKeyFromSeed(seedForSigning);
                        const keyPair = deriveChildKeyPair(masterKey, accountIndex);
                        if (didFromEd25519(keyPair.publicKey) !== didToFinalize) throw new Error("DID mismatch.");
                        const nonce = crypto.randomUUID().toString();
                        const timestamp = new Date().toISOString();
                        const messageToSign = `${didToFinalize}|${nonce}|${timestamp}|${claimCode || ""}`;
                        const signature = await signMessage(keyPair.privateKey, messageToSign);
                        const registerPayload: any = { did: didToFinalize, nonce, timestamp, signature };
                        if (identityName) registerPayload.profileName = identityName;
                        if (identityPicture) registerPayload.profilePictureUrl = identityPicture;
                        if (claimCode) registerPayload.claimCode = claimCode;
                        const registerResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(registerPayload),
                        });
                        if (!registerResponse.ok) {
                            const errBody = await registerResponse.json().catch(() => ({ error: "Registration error" }));
                            throw new Error(`Registration failed: ${errBody.error}`);
                        }
                        const result = await registerResponse.json();
                        const serverIdentity = result.identity as Types.Identity;
                        const tokenDetails = result.tokenDetails as Types.TokenDetails;
                        await TokenManager.storeCpTokens(didToFinalize, tokenDetails);
                        vaultData.identities[identityEntryIndex].profile_name = serverIdentity.profileName;
                        vaultData.identities[identityEntryIndex].profile_picture = serverIdentity.profilePictureUrl;
                        vaultData.identities[identityEntryIndex].cloudUrl = serverIdentity.instanceUrl;
                        (vaultData.identities[identityEntryIndex] as any).instanceId = serverIdentity.instanceId;
                        (vaultData.identities[identityEntryIndex] as any).instanceStatus = serverIdentity.instanceStatus;
                        (vaultData.identities[identityEntryIndex] as any).isAdmin = serverIdentity.isAdmin;
                    } finally {
                        if (seedForSigning) wipeMemory(seedForSigning);
                    }
                } else if (cloudUrl) {
                    vaultData.identities[identityEntryIndex].profile_name = identityName;
                    vaultData.identities[identityEntryIndex].profile_picture = identityPicture;
                    vaultData.identities[identityEntryIndex].cloudUrl = cloudUrl;
                } else {
                    vaultData.identities[identityEntryIndex].profile_name = identityName;
                    vaultData.identities[identityEntryIndex].profile_picture = identityPicture;
                }
                vaultData.settings.activeIdentityIndex = identityEntryIndex;
                await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vaultData });
                await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: identityEntryIndex });
                await SessionManager.loadActiveIdentityFromSessionInternal();
                if (SessionManager.currentActiveDid) {
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
                }
                if (payload.password && !SessionManager.isUnlocked) {
                    // If was temporarily unlocked
                    await chrome.storage.session.remove(Constants.SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                    // SessionManager.setIsUnlocked(false); // loadActiveIdentityFromSessionInternal should set this correctly
                }
                responsePayload = {
                    success: true,
                    message: `Identity ${didToFinalize} finalized.`,
                    did: didToFinalize,
                    identityName: vaultData.identities[identityEntryIndex].profile_name,
                    newActiveDid: SessionManager.currentActiveDid,
                };
                break;
            }

            default:
                console.warn(`[BG_WARN_UnknownAction] Unknown action: ${action}`);
                responsePayload = { error: { message: `Unknown action: ${action}` } };
                responseType = "VIBE_AGENT_RESPONSE_ERROR";
        }

        if (responseType === "VIBE_AGENT_RESPONSE_ERROR") {
            sendResponse({ type: responseType, requestId, error: responsePayload.error });
        } else {
            sendResponse({ type: responseType, requestId, payload: responsePayload });
        }
    } catch (error: any) {
        console.error(`[BG_ERROR_IIFE] Error in async IIFE for ${action}:`, error.message, error.stack);
        const errPayload = error instanceof Error ? { message: error.message } : { message: "Unknown error occurred" };
        sendResponse({ type: "VIBE_AGENT_RESPONSE_ERROR", requestId, error: errPayload });
    }
}
