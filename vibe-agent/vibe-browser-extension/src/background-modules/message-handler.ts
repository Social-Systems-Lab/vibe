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

// Simple in-memory store for active app subscriptions
// Key: subscriptionId, Value: { tabId, origin, appId }
const appSubscriptions = new Map<string, { tabId?: number; origin: string; appId?: string }>();

async function getCurrentVibeStateForSubscription(appId?: string, origin?: string): Promise<Types.VibeState> {
    // Helper to construct VibeState, similar to INITIALIZE_APP_SESSION
    // TODO: Incorporate actual permissions based on appId and origin in the future
    const vaultData = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];
    const agentIdentitiesFromVault: Types.AgentIdentity[] = vaultData?.identities || [];

    const vibeIdentities: Types.VibeIdentity[] = agentIdentitiesFromVault.map((agentId: Types.AgentIdentity) => ({
        did: agentId.identityDid,
        label: agentId.profile_name || `Identity ${agentId.identityDid.substring(0, 12)}...`,
        pictureUrl: agentId.profile_picture,
    }));

    const currentAgentActiveDid = SessionManager.currentActiveDid;
    let activeVibeIdentity: Types.VibeIdentity | null = null;
    if (currentAgentActiveDid) {
        const foundActive = vibeIdentities.find((vid) => vid.did === currentAgentActiveDid);
        activeVibeIdentity = foundActive || null;
    }

    return {
        isUnlocked: SessionManager.isUnlocked,
        did: currentAgentActiveDid,
        account: currentAgentActiveDid ? { did: currentAgentActiveDid } : null,
        permissions: {
            /* Mock/actual permissions for appId, origin */
        },
        identities: vibeIdentities,
        activeIdentity: activeVibeIdentity,
    };
}

async function broadcastAppStateToSubscriptions() {
    console.log("[BG] Broadcasting app state to all subscriptions.");
    for (const [subscriptionId, subInfo] of appSubscriptions.entries()) {
        if (subInfo.tabId) {
            try {
                const newState = await getCurrentVibeStateForSubscription(subInfo.appId, subInfo.origin);
                console.log(`[BG] Sending VIBE_PAGE_EVENT_STATE_CHANGED to tab ${subInfo.tabId} for subId ${subscriptionId}`);
                chrome.tabs.sendMessage(subInfo.tabId, {
                    type: "VIBE_PAGE_EVENT_STATE_CHANGED",
                    subscriptionId: subscriptionId,
                    payload: newState,
                });
            } catch (error) {
                console.error(`[BG] Error sending state update to tab ${subInfo.tabId} for subId ${subscriptionId}:`, error);
                // Optionally, remove subscription if tab is no longer accessible?
                // chrome.tabs.get(subInfo.tabId, (tab) => { if (chrome.runtime.lastError) appSubscriptions.delete(subscriptionId); });
            }
        }
    }
}

export async function handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
    const { action, payload, requestId } = message;

    let responsePayload: any;
    let responseType = "VIBE_AGENT_RESPONSE";
    try {
        switch (action) {
            case "GET_AGENT_STATUS":
                // Attempt to load from session first (checks for decrypted seed)
                if (!SessionManager.isUnlocked) {
                    // Try to load identity if in-memory seed might exist (e.g. service worker restarted)
                    // This call itself checks isUnlocked and inMemoryDecryptedSeed
                    await SessionManager.loadActiveIdentity();
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
                    // Vault is locked (SessionManager.isUnlocked is false), or no active identity could be loaded from session.
                    const localData = await chrome.storage.local.get(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
                    const lastActiveDid = localData[Constants.STORAGE_KEY_LAST_ACTIVE_DID];

                    if (lastActiveDid) {
                        // Vault is locked, but we have a lastActiveDid.
                        // Try to get a token using refresh token if available.
                        try {
                            // Attempt to get a valid access token. This will try to use the refresh token.
                            // We don't need the token itself here, just to see if it succeeds.
                            await TokenManager.getValidCpAccessToken(lastActiveDid);

                            // If getValidCpAccessToken succeeds, it means we have a valid session or refreshed token.
                            // We can proceed as if "unlocked" for API purposes, even if the vault password hasn't been entered.
                            // SessionManager.isUnlocked will remain false, which is correct.
                            // We set currentActiveDid here so the UI knows which identity we are operating with.
                            SessionManager.setCurrentActiveDid(lastActiveDid); // Ensure this is set for UI context

                            responsePayload = {
                                did: lastActiveDid,
                                permissions: { "profile:read": "always" }, // Example permission
                                message: "Successfully initialized using stored token.",
                                code: "INITIALIZED_UNLOCKED", // Treat as unlocked for UI flow
                            };
                            // responseType remains "VIBE_AGENT_RESPONSE" (success)
                        } catch (tokenError: any) {
                            // If getValidCpAccessToken throws, it means we need a full login or vault unlock.
                            if (tokenError.message && tokenError.message.startsWith("FULL_LOGIN_REQUIRED")) {
                                // Refresh token is invalid or missing, so vault unlock is truly required.
                                responseType = "VIBE_AGENT_RESPONSE_ERROR";
                                responsePayload = {
                                    error: {
                                        message: "Vault is locked. Unlock to access your last active identity.",
                                        code: "UNLOCK_REQUIRED_FOR_LAST_ACTIVE",
                                        lastActiveDid: lastActiveDid,
                                    },
                                };
                            } else {
                                // Some other unexpected error during token refresh.
                                console.error(`Unexpected error during token validation for init: ${tokenError.message}`);
                                responseType = "VIBE_AGENT_RESPONSE_ERROR";
                                responsePayload = {
                                    error: {
                                        message: `Error initializing session: ${tokenError.message}`,
                                        code: "INIT_TOKEN_ERROR", // Potentially a new error code for UI to handle
                                        lastActiveDid: lastActiveDid,
                                    },
                                };
                            }
                        }
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
                let encryptionKey: CryptoKey | null = null;
                let decryptedSeedAttempt: string | null = null;
                try {
                    encryptionKey = await deriveEncryptionKey(password, salt);
                    decryptedSeedAttempt = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);
                    if (!decryptedSeedAttempt) throw new Error("Decryption failed, returned null seed.");

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
                        SessionManager.setInMemoryDecryptedSeed(null);
                        throw new Error("Failed to load active identity into global state after unlock.");
                    }

                    if (SessionManager.currentActiveDid) {
                        await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
                    }
                    console.info(`Vault unlocked for ${SessionManager.currentActiveDid}. API calls will attempt to use/refresh tokens.`);
                    responsePayload = { success: true, did: SessionManager.currentActiveDid, message: "Vault unlocked." };
                    await broadcastAppStateToSubscriptions();
                } catch (error) {
                    SessionManager.setInMemoryDecryptedSeed(null);
                    await SessionManager.lockVaultState();
                    throw new Error(`Failed to unlock vault. ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                    if (decryptedSeedAttempt) decryptedSeedAttempt = null;
                }
                break;
            }

            case "LOCK_VAULT":
                await SessionManager.lockVaultState();
                responsePayload = { success: true, message: "Vault locked." };
                await broadcastAppStateToSubscriptions();
                break;

            case "GET_LOCK_STATE":
                responsePayload = { isUnlocked: SessionManager.isUnlocked, did: SessionManager.currentActiveDid };
                break;

            case "SETUP_CREATE_VAULT": {
                await SessionManager.lockVaultState();
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
                    const vaultData = {
                        encryptedSeedPhrase: encryptedMnemonicData,
                        identities: [],
                        settings: { nextAccountIndex: 0, activeIdentityIndex: -1 },
                    };
                    await chrome.storage.local.set({
                        [Constants.STORAGE_KEY_VAULT_SALT]: saltHex,
                        [Constants.STORAGE_KEY_VAULT]: vaultData,
                        [Constants.STORAGE_KEY_SETUP_COMPLETE]: true,
                    });
                    SessionManager.setInMemoryDecryptedSeed(mnemonic);
                    await chrome.storage.session.set({
                        [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: -1,
                    });
                    SessionManager.setCurrentActiveDid(null);
                    console.log("SETUP_CREATE_VAULT: Vault created, pre-unlocked (seed in memory), no identities yet.");
                    responsePayload = { mnemonic };
                } finally {
                    if (seed) wipeMemory(seed);
                }
                break;
            }

            case "SETUP_IMPORT_VAULT": {
                const { importedMnemonic, password } = payload;
                if (!importedMnemonic || !password) throw new Error("Mnemonic and password required.");
                if (!validateMnemonic(importedMnemonic)) throw new Error("Invalid mnemonic provided.");
                await SessionManager.lockVaultState();
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
                let didToFetch: string | null = null;

                if (SessionManager.isUnlocked && SessionManager.currentActiveDid) {
                    didToFetch = SessionManager.currentActiveDid;
                } else {
                    const lastActiveDidResult = await chrome.storage.local.get(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
                    didToFetch = lastActiveDidResult[Constants.STORAGE_KEY_LAST_ACTIVE_DID] || null;
                }

                if (!didToFetch) {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    const setupCompleteResult = await chrome.storage.local.get(Constants.STORAGE_KEY_SETUP_COMPLETE);
                    if (!setupCompleteResult[Constants.STORAGE_KEY_SETUP_COMPLETE]) {
                        responsePayload = { error: { message: "Setup not complete. Cannot get identity details.", code: "SETUP_NOT_COMPLETE" } };
                    } else {
                        responsePayload = { error: { message: "No active identity found. Please select or create an identity.", code: "NO_ACTIVE_IDENTITY" } };
                    }
                    break;
                }

                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                const vault = vaultResult[Constants.STORAGE_KEY_VAULT];

                if (!vault || !vault.identities || !Array.isArray(vault.identities)) {
                    throw new Error("Vault data not found or invalid.");
                }

                const identityData = vault.identities.find((idObj: any) => idObj.did === didToFetch);

                if (!identityData) {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = { error: { message: `Identity details for DID ${didToFetch} not found in vault.`, code: "IDENTITY_NOT_FOUND_IN_VAULT" } };
                    break;
                }

                responsePayload = {
                    did: identityData.did,
                    profileName: identityData.profile_name,
                    profilePictureUrl: identityData.profile_picture,
                    cloudUrl: identityData.cloudUrl,
                    instanceStatus: (identityData as any).instanceStatus,
                    isAdmin: (identityData as any).isAdmin,
                    isVaultLocked: !SessionManager.isUnlocked,
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
                await SessionManager.lockVaultState();
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
                    SessionManager.setInMemoryDecryptedSeed(importedMnemonic);
                    await chrome.storage.session.set({
                        [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0,
                    });
                    await SessionManager.loadActiveIdentity();
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
                const { identityName, identityPicture, cloudUrl, claimCode, password, mnemonic } = payload;
                if (!password || !mnemonic) throw new Error("Password and mnemonic required.");
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vaultData || !vaultData.identities || vaultData.identities.length === 0) {
                    throw new Error("Vault not properly initialized.");
                }
                const identityDid = vaultData.identities[0].did;
                if (cloudUrl === Constants.OFFICIAL_VIBE_CLOUD_URL) {
                    let seedForSigning: Buffer | null = null;
                    try {
                        seedForSigning = await seedFromMnemonic(mnemonic);
                        const masterKey = getMasterHDKeyFromSeed(seedForSigning);
                        const keyPair = deriveChildKeyPair(masterKey, vaultData.settings.activeIdentityIndex || 0);
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
                        const serverIdentity = result.identity as Types.AgentIdentity;
                        const tokenDetails = result.tokenDetails as Types.TokenDetails;
                        await TokenManager.storeCpTokens(identityDid, tokenDetails);
                        vaultData.identities[0].profile_name = serverIdentity.profile_name;
                        vaultData.identities[0].profile_picture = serverIdentity.profile_picture;
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
                    [Constants.STORAGE_KEY_SETUP_COMPLETE]: true,
                });
                await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0 });
                await SessionManager.loadActiveIdentity();
                responsePayload = { success: true, message: "Setup finalized.", did: identityDid, identityName: vaultData.identities[0].profile_name };
                break;
            }

            case "UPDATE_IDENTITY_PROFILE": {
                const { did, profileName, profilePictureUrl, claimCode } = payload;
                if (!did) throw new Error("DID required for profile update.");

                let localVault = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];
                if (!localVault || !localVault.identities) throw new Error("Vault data not found.");

                const identityIndex = localVault.identities.findIndex((idObj: any) => idObj.did === did);
                if (identityIndex === -1) throw new Error(`Identity with DID ${did} not found in vault.`);

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
                    needsCloudSync = true;
                }

                if (needsLocalSave) {
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: localVault });
                }

                let cloudSyncMessage = "";
                let cloudUpdateError = null;

                if (needsCloudSync && identityToUpdate.cloudUrl === Constants.OFFICIAL_VIBE_CLOUD_URL) {
                    if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== did) {
                        cloudUpdateError = "Vault locked or identity not active; cloud sync skipped.";
                        cloudSyncMessage = "Changes saved locally. Cloud sync skipped (vault locked or inactive identity).";
                    } else {
                        const decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
                        if (!decryptedSeed) {
                            cloudUpdateError = "Decrypted seed not available for signing; cloud sync skipped.";
                            cloudSyncMessage = "Changes saved locally. Cloud sync skipped (seed unavailable).";
                        } else {
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

                                const fieldsToSign = [
                                    claimCode || "",
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
                                    throw new Error(`Cloud profile update failed: ${errBody.error}`);
                                }
                                const updatedServerIdentity = (await updateResponse.json()) as Types.AgentIdentity & { token?: string };

                                identityToUpdate.profile_name = updatedServerIdentity.profile_name;
                                identityToUpdate.profile_picture = updatedServerIdentity.profile_picture;
                                if (updatedServerIdentity.isAdmin !== undefined) identityToUpdate.isAdmin = updatedServerIdentity.isAdmin;
                                if (updatedServerIdentity.token) {
                                    console.warn(
                                        "Received token in PUT response, but current flow relies on refresh tokens. Ignoring direct token update here."
                                    );
                                }
                                await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: localVault });
                                cloudSyncMessage = "Changes saved locally and synced to cloud.";
                            } catch (error: any) {
                                console.error("Error during cloud profile update:", error);
                                cloudUpdateError = error.message;
                                cloudSyncMessage = `Changes saved locally. Cloud sync failed: ${error.message}`;
                            } finally {
                                if (seedBuffer) wipeMemory(seedBuffer);
                            }
                        }
                    }
                } else if (needsCloudSync && identityToUpdate.cloudUrl !== Constants.OFFICIAL_VIBE_CLOUD_URL) {
                    cloudSyncMessage = "Changes saved locally. Identity not connected to official Vibe Cloud for sync.";
                } else if (!needsCloudSync && needsLocalSave) {
                    cloudSyncMessage = "Changes saved locally.";
                } else if (!needsLocalSave && !needsCloudSync) {
                    cloudSyncMessage = "No changes detected.";
                }

                if (needsLocalSave && !cloudUpdateError && cloudSyncMessage.includes("synced to cloud")) {
                    responsePayload = {
                        success: true,
                        message: "Profile updated and synced to cloud.",
                        updatedProfile: { profileName: identityToUpdate.profile_name, profilePictureUrl: identityToUpdate.profile_picture },
                    };
                } else if (needsLocalSave && !cloudUpdateError) {
                    responsePayload = {
                        success: true,
                        message: cloudSyncMessage.length > 0 ? `Profile saved locally. ${cloudSyncMessage}` : "Profile saved locally.",
                        updatedProfile: { profileName: identityToUpdate.profile_name, profilePictureUrl: identityToUpdate.profile_picture },
                    };
                } else if (cloudUpdateError) {
                    responsePayload = {
                        success: false,
                        message: `Local save successful. Cloud sync failed: ${cloudUpdateError}`,
                        updatedProfile: { profileName: identityToUpdate.profile_name, profilePictureUrl: identityToUpdate.profile_picture },
                        cloudUpdateError: cloudUpdateError,
                    };
                } else if (!needsLocalSave && !needsCloudSync) {
                    responsePayload = {
                        success: true,
                        message: "No changes to save.",
                        updatedProfile: { profileName: identityToUpdate.profile_name, profilePictureUrl: identityToUpdate.profile_picture },
                    };
                } else {
                    responsePayload = {
                        success: false,
                        message: "An unexpected state occurred during profile update.",
                        updatedProfile: { profileName: identityToUpdate.profile_name, profilePictureUrl: identityToUpdate.profile_picture },
                    };
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
                const serverIdentity = (await fetchResponse.json()) as Types.AgentIdentity;
                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (vaultData && vaultData.identities) {
                    const identityIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === did);
                    if (identityIndex !== -1) {
                        const localIdentity = vaultData.identities[identityIndex];
                        localIdentity.profile_name = serverIdentity.profile_name || localIdentity.profile_name;
                        localIdentity.profile_picture = serverIdentity.profile_picture || localIdentity.profile_picture;
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

                        SessionManager.setInMemoryDecryptedSeed(decryptedSeedAttempt);

                        const identityIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === did);
                        if (identityIndex === -1) {
                            SessionManager.setInMemoryDecryptedSeed(null);
                            throw new Error(`DID ${did} not found in vault.`);
                        }
                        await chrome.storage.session.set({
                            [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: identityIndex,
                        });
                        await SessionManager.loadActiveIdentity();
                        if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== did) {
                            SessionManager.setInMemoryDecryptedSeed(null);
                            throw new Error("Failed to unlock/set active identity.");
                        }
                    } else {
                        responseType = "VIBE_AGENT_RESPONSE_ERROR";
                        responsePayload = { error: { message: "Vault locked. Password required to login.", code: "VAULT_LOCKED_FOR_LOGIN", did: did } };
                        break;
                    }
                }
                const decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
                const activeIdx = (await chrome.storage.session.get(Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX))[
                    Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX
                ];

                if (!decryptedSeed || typeof activeIdx !== "number") {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = {
                        error: { message: "Internal error: In-memory seed or active index missing despite unlock.", code: "INTERNAL_ERROR_SEED_MISSING" },
                    };
                    break;
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

                if (SessionManager.isUnlocked) {
                    await SessionManager.loadActiveIdentity();
                    if (SessionManager.currentActiveDid !== targetDid) {
                        await SessionManager.lockVaultState();
                        throw new Error(`Failed to switch active identity in unlocked state. Expected ${targetDid}, got ${SessionManager.currentActiveDid}.`);
                    }
                } else {
                    SessionManager.setCurrentActiveDid(null);
                }

                await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: targetDid });

                if (previousActiveDid && previousActiveDid !== targetDid) {
                    await TokenManager.clearCpTokens(previousActiveDid);
                }
                await TokenManager.clearCpTokens(targetDid);

                responsePayload = {
                    success: true,
                    newActiveDid: SessionManager.isUnlocked ? SessionManager.currentActiveDid : targetDid,
                    message: `Switched active identity context to ${targetDid}.`,
                };
                await broadcastAppStateToSubscriptions();
                break;
            }

            case "CREATE_NEW_IDENTITY_FROM_SEED": {
                if (!SessionManager.isUnlocked) {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = { error: { message: "Vault must be unlocked to create a new identity.", code: "VAULT_LOCKED" } };
                    break;
                }
                const decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
                if (!decryptedSeed) {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = { error: { message: "Vault locked (in-memory seed missing).", code: "VAULT_LOCKED" } };
                    break;
                }
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
                try {
                    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                    const vault = vaultResult[Constants.STORAGE_KEY_VAULT];
                    if (!vault || !vault.settings || typeof vault.settings.nextAccountIndex !== "number") {
                        console.error("GET_NEXT_ACCOUNT_INDEX: Vault data/settings invalid or missing nextAccountIndex.", vault);
                        responseType = "VIBE_AGENT_RESPONSE_ERROR";
                        responsePayload = {
                            error: {
                                message: "Vault data or settings are invalid. Cannot determine next account index.",
                                code: "VAULT_SETTINGS_INVALID",
                            },
                        };
                    } else {
                        responsePayload = { accountIndex: vault.settings.nextAccountIndex };
                    }
                } catch (e: any) {
                    console.error("GET_NEXT_ACCOUNT_INDEX: Unexpected error:", e);
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    let detailedErrorMessage = "An unexpected error occurred while fetching the account index.";
                    if (e instanceof Error && e.message) {
                        detailedErrorMessage = e.message;
                    } else if (typeof e === "string") {
                        detailedErrorMessage = e;
                    } else {
                        detailedErrorMessage = `Unexpected error type (${typeof e}) while fetching account index. Details: ${String(e)}`;
                    }
                    responsePayload = {
                        error: {
                            message: detailedErrorMessage,
                            code: "GET_INDEX_UNEXPECTED_ERROR",
                        },
                    };
                }
                break;
            }

            case "SETUP_NEW_IDENTITY_AND_FINALIZE": {
                const { accountIndexToUse, identityName, identityPicture, cloudUrl, claimCode, password } = payload;

                if (typeof accountIndexToUse !== "number") {
                    throw new Error("Account index is required.");
                }

                let decryptedSeed = SessionManager.getInMemoryDecryptedSeed();

                if (!SessionManager.isUnlocked) {
                    if (!password) {
                        responseType = "VIBE_AGENT_RESPONSE_ERROR";
                        responsePayload = {
                            error: { message: "Vault is locked. Password is required to create a new identity.", code: "VAULT_LOCKED_PASSWORD_REQUIRED" },
                        };
                        break;
                    }
                    console.log("SETUP_NEW_IDENTITY_AND_FINALIZE: Vault locked, attempting unlock with provided password.");
                    const localData = await chrome.storage.local.get([Constants.STORAGE_KEY_VAULT, Constants.STORAGE_KEY_VAULT_SALT]);
                    const vaultDataForUnlock = localData[Constants.STORAGE_KEY_VAULT];
                    const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];

                    if (!vaultDataForUnlock || !saltHex) {
                        throw new Error("Vault or salt not found for unlock attempt. Setup may be incomplete.");
                    }
                    const salt = Buffer.from(saltHex, "hex");
                    const encryptionKey = await deriveEncryptionKey(password, salt);
                    const decryptedSeedAttempt = await decryptData(vaultDataForUnlock.encryptedSeedPhrase, encryptionKey);

                    if (!decryptedSeedAttempt) {
                        throw new Error("Decryption failed with the provided password.");
                    }
                    SessionManager.setInMemoryDecryptedSeed(decryptedSeedAttempt);
                    decryptedSeed = decryptedSeedAttempt;

                    if (!SessionManager.isUnlocked) {
                        throw new Error("Internal error: Vault unlock seemed successful but isUnlocked is still false.");
                    }
                    console.log("SETUP_NEW_IDENTITY_AND_FINALIZE: Vault unlocked successfully with provided password.");
                }

                if (!decryptedSeed) {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = {
                        error: { message: "Vault is locked or seed is unavailable after unlock attempt.", code: "VAULT_LOCKED_SEED_UNAVAILABLE" },
                    };
                    break;
                }

                const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
                let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
                if (!vaultData || !vaultData.settings || typeof vaultData.settings.nextAccountIndex !== "number") {
                    throw new Error("Vault data/settings invalid.");
                }
                const newAccountIndex = vaultData.settings.nextAccountIndex;
                let seedBuffer: Buffer | null = null;
                try {
                    seedBuffer = await seedFromMnemonic(decryptedSeed);
                    const masterHDKey = getMasterHDKeyFromSeed(seedBuffer);
                    const newKeyPair = deriveChildKeyPair(masterHDKey, newAccountIndex);
                    const newIdentityDid = didFromEd25519(newKeyPair.publicKey);
                    const newIdentityEntry: any = {
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
                        const serverIdentity = result.identity as Types.AgentIdentity;
                        const tokenDetails = result.tokenDetails as Types.TokenDetails;
                        await TokenManager.storeCpTokens(newIdentityDid, tokenDetails);
                        newIdentityEntry.profile_name = serverIdentity.profile_name || newIdentityEntry.profile_name;
                        newIdentityEntry.profile_picture = serverIdentity.profile_picture || newIdentityEntry.profile_picture;
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
                    await SessionManager.loadActiveIdentity();
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
                    await broadcastAppStateToSubscriptions();
                } finally {
                    if (seedBuffer) wipeMemory(seedBuffer);
                }
                break;
            }

            case "FINALIZE_NEW_IDENTITY_SETUP": {
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
                    SessionManager.setInMemoryDecryptedSeed(decryptedSeedAttempt);
                }

                const decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
                if (!decryptedSeed) {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = { error: { message: "Vault locked or in-memory seed missing after unlock attempt.", code: "VAULT_LOCKED" } };
                    break;
                }
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
                        const serverIdentity = result.identity as Types.AgentIdentity;
                        const tokenDetails = result.tokenDetails as Types.TokenDetails;
                        await TokenManager.storeCpTokens(didToFinalize, tokenDetails);
                        vaultData.identities[identityEntryIndex].profile_name = serverIdentity.profile_name;
                        vaultData.identities[identityEntryIndex].profile_picture = serverIdentity.profile_picture;
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
                await SessionManager.loadActiveIdentity();
                if (SessionManager.currentActiveDid) {
                    await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
                }
                responsePayload = {
                    success: true,
                    message: `Identity ${didToFinalize} finalized.`,
                    did: didToFinalize,
                    identityName: vaultData.identities[identityEntryIndex].profile_name,
                    newActiveDid: SessionManager.currentActiveDid,
                };
                await broadcastAppStateToSubscriptions();
                break;
            }

            case "DELETE_IDENTITY": {
                const { did: didToDelete } = payload;
                if (!didToDelete || typeof didToDelete !== "string") {
                    throw new Error("DID is required for DELETE_IDENTITY action.");
                }
                if (!SessionManager.isUnlocked || SessionManager.currentActiveDid !== didToDelete) {
                    console.warn(`DELETE_IDENTITY: Vault not unlocked for ${didToDelete} or it's not the active session DID. Frontend should ensure this.`);
                }

                console.info(`Attempting to delete identity: ${didToDelete}`);
                let accessToken: string;
                try {
                    accessToken = await TokenManager.getValidCpAccessToken(didToDelete);
                } catch (tokenError: any) {
                    console.error(`DELETE_IDENTITY: Failed to get access token for ${didToDelete}. Error: ${tokenError.message}`);
                    throw new Error(`Failed to authenticate for deletion: ${tokenError.message}`);
                }

                const deleteUrl = `${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${didToDelete}`;
                const apiResponse = await fetch(deleteUrl, {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                });

                if (!apiResponse.ok) {
                    const errorBody = await apiResponse.json().catch(() => ({ error: `API error: ${apiResponse.status}` }));
                    console.error(`DELETE_IDENTITY: API call failed for ${didToDelete}. Status: ${apiResponse.status}, Error: ${errorBody.error}`);
                    throw new Error(errorBody.error || `Failed to delete identity via API: ${apiResponse.status}`);
                }

                const responseJson = await apiResponse.json();
                console.info(`DELETE_IDENTITY: API call successful for ${didToDelete}. Message: ${responseJson.message}`);
                await TokenManager.clearCpTokens(didToDelete);

                const localData = await chrome.storage.local.get(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
                if (localData[Constants.STORAGE_KEY_LAST_ACTIVE_DID] === didToDelete) {
                    await chrome.storage.local.remove(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
                    console.info(`Cleared lastActiveDid as it was the deleted identity: ${didToDelete}`);
                }

                if (SessionManager.currentActiveDid === didToDelete) {
                    await SessionManager.lockVaultState();
                    console.info(`Locked vault as the deleted identity ${didToDelete} was active in session.`);
                }

                responsePayload = { success: true, message: responseJson.message || "Identity deletion process initiated." };
                break;
            }

            case "INITIALIZE_APP_SESSION": {
                const appManifest = payload?.manifest;
                const origin = sender.origin;
                const appIdFromManifestValue = appManifest?.appId; // This is string | undefined
                console.log(`[BG] INITIALIZE_APP_SESSION from origin: ${origin} for app: ${appManifest?.name}, ID: ${appIdFromManifestValue}`);

                const mockSubscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

                if (sender.tab?.id) {
                    appSubscriptions.set(mockSubscriptionId, { tabId: sender.tab.id, origin, appId: appIdFromManifestValue ?? undefined });
                    console.log(`[BG] Subscription added: ${mockSubscriptionId} for tab ${sender.tab.id}, origin ${origin}, appId ${appIdFromManifestValue}`);
                } else {
                    console.warn(`[BG] INITIALIZE_APP_SESSION from sender without tab ID. Origin: ${origin}, AppId: ${appIdFromManifestValue}`);
                    appSubscriptions.set(mockSubscriptionId, { origin, appId: appIdFromManifestValue ?? undefined });
                }

                const vaultData = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];
                const agentIdentitiesFromVault: Types.AgentIdentity[] = vaultData?.identities || [];

                const vibeIdentities: Types.VibeIdentity[] = agentIdentitiesFromVault.map((agentId: Types.AgentIdentity) => ({
                    did: agentId.identityDid,
                    label: agentId.profile_name || `Identity ${agentId.identityDid.substring(0, 12)}...`,
                    pictureUrl: agentId.profile_picture,
                }));

                const currentAgentActiveDid = SessionManager.currentActiveDid;
                let activeVibeIdentity: Types.VibeIdentity | null = null;
                if (currentAgentActiveDid) {
                    const foundActive = vibeIdentities.find((vid) => vid.did === currentAgentActiveDid);
                    activeVibeIdentity = foundActive || null;
                }

                const mockVibeState: Types.VibeState = {
                    isUnlocked: SessionManager.isUnlocked,
                    did: currentAgentActiveDid,
                    account: currentAgentActiveDid ? { did: currentAgentActiveDid } : null,
                    permissions: {
                        /* Mock permissions */
                    },
                    identities: vibeIdentities,
                    activeIdentity: activeVibeIdentity,
                };

                responsePayload = {
                    initialState: mockVibeState,
                    subscriptionId: mockSubscriptionId,
                };
                break;
            }

            case "UNSUBSCRIBE_APP_SESSION": {
                const { subscriptionId } = payload;
                if (appSubscriptions.has(subscriptionId)) {
                    appSubscriptions.delete(subscriptionId);
                    console.log(`[BG] Subscription removed: ${subscriptionId}`);
                    responsePayload = { success: true };
                } else {
                    console.warn(`[BG] UNSUBSCRIBE_APP_SESSION: Subscription ID not found: ${subscriptionId}`);
                    responsePayload = { success: false, error: "Subscription ID not found." };
                }
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
