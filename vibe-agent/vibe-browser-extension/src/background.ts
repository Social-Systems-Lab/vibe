console.log("[BACKGROUND_SCRIPT_RESTORING_CODE] Service worker script has started."); // Keep top-level log
import { Buffer } from "buffer"; // Standard import

// Placeholder Identity type - should align with control plane's IdentitySchema
interface Identity {
    identityDid: string;
    isAdmin: boolean;
    profileName?: string;
    profilePictureUrl?: string;
    instanceId?: string;
    instanceStatus?: string; // Should match IdentityInstanceStatus type from CP models
    instanceUrl?: string;
    instanceCreatedAt?: string;
    instanceUpdatedAt?: string;
    instanceErrorDetails?: string;
    // Add other fields as needed from control plane's IdentitySchema
}

// Explicitly make Buffer available on self, for environments where it might be needed globally.
if (typeof self !== "undefined" && typeof (self as any).Buffer === "undefined") {
    console.log("[BACKGROUND_SCRIPT_BUFFER_POLYFILL] Assigning imported Buffer to self.Buffer");
    (self as any).Buffer = Buffer;
} else if (typeof self !== "undefined") {
    console.log("[BACKGROUND_SCRIPT_BUFFER_POLYFILL] self.Buffer already exists or self is defined.");
} else {
    console.log("[BACKGROUND_SCRIPT_BUFFER_POLYFILL] self is not defined. Cannot assign Buffer to self.Buffer.");
}

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
} from "./lib/crypto";
import { didFromEd25519 } from "./lib/identity";

console.log("Vibe Background Service Worker started.");

// --- BIP39 Self-Test ---
try {
    console.log("[BIP39 TEST] Running self-test...");
    const testMnemonic = generateMnemonic(12);
    console.log(`[BIP39 TEST] Generated test mnemonic: "${testMnemonic}"`);
    const isValid = validateMnemonic(testMnemonic);
    console.log(`[BIP39 TEST] Validation result for generated mnemonic: ${isValid}`);
    if (!isValid) {
        console.error("[BIP39 TEST] CRITICAL: bip39.validateMnemonic failed for a freshly generated mnemonic!");
    } else {
        console.log("[BIP39 TEST] Self-test PASSED.");
    }
} catch (e) {
    console.error("[BIP39 TEST] CRITICAL: Error during bip39 self-test:", e);
}
// --- End BIP39 Self-Test ---

// --- Constants ---
const OFFICIAL_VIBE_CLOUD_URL = "https://vibe-cloud-cp.vibeapp.dev"; // Renamed for clarity
const SETUP_URL = chrome.runtime.getURL("setup.html");
const STORAGE_KEY_SETUP_COMPLETE = "isSetupComplete";
const STORAGE_KEY_VAULT = "vibeVault";
const STORAGE_KEY_VAULT_SALT = "vibeVaultSalt";
const SESSION_STORAGE_DECRYPTED_SEED_PHRASE = "decryptedSeedPhrase";
const SESSION_STORAGE_ACTIVE_IDENTITY_INDEX = "activeIdentityIndex";
const SESSION_STORAGE_JWT_PREFIX = "vibe_jwt_"; // For storing JWTs per DID
const GAP_LIMIT = 20;

// --- Global State ---
let currentActiveDid: string | null = null;
let isUnlocked: boolean = false;

// --- Utility Functions ---
async function getStoredJwt(identityDid: string): Promise<string | null> {
    const key = `${SESSION_STORAGE_JWT_PREFIX}${identityDid}`;
    try {
        const result = await chrome.storage.session.get(key);
        return result[key] || null;
    } catch (error) {
        console.error(`Error getting JWT for ${identityDid}:`, error);
        return null;
    }
}

async function loadActiveIdentityFromSessionInternal() {
    try {
        const sessionData = await chrome.storage.session.get([SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]);
        const decryptedSeed = sessionData[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
        const activeIndex = sessionData[SESSION_STORAGE_ACTIVE_IDENTITY_INDEX];

        if (decryptedSeed && typeof activeIndex === "number") {
            let seedBuffer: Buffer | null = null;
            try {
                seedBuffer = await seedFromMnemonic(decryptedSeed);
                const masterKey = getMasterHDKeyFromSeed(seedBuffer);
                const identityKeyPair = deriveChildKeyPair(masterKey, activeIndex);
                currentActiveDid = didFromEd25519(identityKeyPair.publicKey);
                isUnlocked = true; // Requires JWT to be also present for full "cloud unlocked" state
                console.log("Active identity loaded from session:", currentActiveDid);
                // Check for JWT for this DID
                const jwt = await getStoredJwt(currentActiveDid);
                if (!jwt) {
                    console.warn(`Identity ${currentActiveDid} loaded, but no JWT found in session. User may need to login.`);
                    // isUnlocked might be true for local operations, but cloud operations will fail/require login.
                }
                return true;
            } finally {
                if (seedBuffer) wipeMemory(seedBuffer);
            }
        }
    } catch (error) {
        console.error("Error loading active identity from session:", error);
        await clearSessionStateInternal();
    }
    isUnlocked = false;
    return false;
}

async function clearSessionStateInternal() {
    currentActiveDid = null;
    isUnlocked = false;
    // Clear all JWTs as well
    const allSessionItems = await chrome.storage.session.get(null);
    const jwtKeysToRemove = Object.keys(allSessionItems).filter((key) => key.startsWith(SESSION_STORAGE_JWT_PREFIX));
    await chrome.storage.session.remove([SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX, ...jwtKeysToRemove]);
    console.log("Session state (seed, active index, all JWTs) cleared.");
}

// --- Event Listeners ---
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        console.log("Vibe extension installed.");
        // ... (rest of onInstalled logic remains similar) ...
    } else if (details.reason === "update") {
        console.log("Vibe extension updated to version:", chrome.runtime.getManifest().version);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && typeof message === "object" && message.type === "VIBE_AGENT_REQUEST" && message.action) {
        const { action, payload, requestId } = message;

        (async () => {
            let responsePayload: any;
            let responseType = "VIBE_AGENT_RESPONSE";
            try {
                switch (action) {
                    // ... (init, UNLOCK_VAULT, SETUP_CREATE_VAULT, SETUP_IMPORT_VAULT remain largely similar for local vault ops) ...
                    // Cases to refactor: SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES, SETUP_COMPLETE_AND_FINALIZE, UPDATE_IDENTITY_PROFILE

                    case "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES": {
                        console.log("Processing 'SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES'");
                        const { importedMnemonic, password } = payload;
                        if (!importedMnemonic || !validateMnemonic(importedMnemonic)) throw new Error("Valid mnemonic required.");
                        if (!password) throw new Error("Password required.");

                        await clearSessionStateInternal();
                        const salt = generateSalt();
                        const saltHex = Buffer.from(salt).toString("hex");
                        const encryptionKey = await deriveEncryptionKey(password, salt);
                        const encryptedMnemonicData = await encryptData(importedMnemonic, encryptionKey);

                        await chrome.storage.local.set({
                            [STORAGE_KEY_VAULT_SALT]: saltHex,
                            [STORAGE_KEY_VAULT]: {
                                encryptedSeedPhrase: encryptedMnemonicData,
                                identities: [],
                                settings: { nextAccountIndex: 0, activeIdentityIndex: -1 },
                            },
                        });
                        console.log("Initial vault created with imported seed.");

                        const masterSeedBuffer = await seedFromMnemonic(importedMnemonic);
                        const masterHDKey = getMasterHDKeyFromSeed(masterSeedBuffer);
                        const recoveredIdentities: any[] = [];
                        let consecutiveInactiveCount = 0;
                        let currentIndex = 0;
                        let nextAccountIndexToStore = 0;

                        while (consecutiveInactiveCount < GAP_LIMIT) {
                            const derivationPath = `m/0'/0'/${currentIndex}'`;
                            const keyPair = deriveChildKeyPair(masterHDKey, currentIndex);
                            const currentDid = didFromEd25519(keyPair.publicKey);

                            const statusUrl = `${OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${currentDid}/status`;
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
                                // For recovery, we just note it's active and its derivation path.
                                // Full details (profile, instanceURL) will be fetched after user logs into this specific identity.
                                recoveredIdentities.push({
                                    did: currentDid,
                                    derivationPath: derivationPath,
                                    profile_name: `Recovered Identity ${currentIndex + 1}`, // Placeholder
                                    instanceStatus: instanceStatus, // Store initial status
                                });
                                consecutiveInactiveCount = 0;
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
                        await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: finalVaultData, [STORAGE_KEY_SETUP_COMPLETE]: true });

                        if (recoveredIdentities.length > 0) {
                            // Set session for the first recovered identity to allow immediate login
                            await chrome.storage.session.set({
                                [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: importedMnemonic,
                                [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0,
                            });
                            await loadActiveIdentityFromSessionInternal(); // Sets currentActiveDid
                            responsePayload = {
                                success: true,
                                message: `Recovered ${recoveredIdentities.length} identities. Please login to sync full details.`,
                                recoveredCount: recoveredIdentities.length,
                                primaryDid: recoveredIdentities[0].did,
                            };
                        } else {
                            responsePayload = { success: true, message: "Seed imported, no active identities found on cloud.", recoveredCount: 0 };
                        }
                        break;
                    }

                    case "SETUP_COMPLETE_AND_FINALIZE": {
                        // This is effectively the new identity registration flow
                        console.log("Processing 'SETUP_COMPLETE_AND_FINALIZE' (Register Identity)");
                        const { identityName, identityPicture, cloudUrl, claimCode, password, mnemonic } = payload;
                        if (!password || !mnemonic) throw new Error("Password and mnemonic required.");

                        // Vault should have been created in a prior step (SETUP_CREATE_VAULT)
                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        let vaultData = vaultResult[STORAGE_KEY_VAULT];
                        if (!vaultData || !vaultData.identities || vaultData.identities.length === 0) {
                            throw new Error("Vault not properly initialized before finalization.");
                        }

                        const identityDid = vaultData.identities[0].did; // Assuming first identity is being finalized
                        let finalCloudUrl: string | undefined = undefined; // This will be instanceUrl

                        if (cloudUrl === OFFICIAL_VIBE_CLOUD_URL) {
                            console.log(`Official Vibe Cloud: Calling /auth/register for DID: ${identityDid}`);
                            let seedForSigning: Buffer | null = null;
                            try {
                                seedForSigning = await seedFromMnemonic(mnemonic);
                                const masterKey = getMasterHDKeyFromSeed(seedForSigning);
                                const keyPair = deriveChildKeyPair(masterKey, vaultData.settings.activeIdentityIndex || 0);

                                const nonce = crypto.randomUUID().toString();
                                const timestamp = new Date().toISOString();
                                const messageToSign = `${identityDid}|${nonce}|${timestamp}|${claimCode || ""}`;
                                const signature = await signMessage(keyPair.privateKey, messageToSign);

                                const registerPayload = {
                                    did: identityDid,
                                    nonce,
                                    timestamp,
                                    signature,
                                    profileName: identityName,
                                    profilePictureUrl: identityPicture,
                                    claimCode,
                                };

                                const registerResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(registerPayload),
                                });

                                if (!registerResponse.ok) {
                                    const errBody = await registerResponse.json().catch(() => ({ error: "Unknown registration error" }));
                                    throw new Error(`Registration failed: ${errBody.error}`);
                                }
                                const result = await registerResponse.json();
                                const serverIdentity = result.identity as Identity;
                                const token = result.token;

                                await chrome.storage.session.set({ [`${SESSION_STORAGE_JWT_PREFIX}${identityDid}`]: token });

                                // Update local vault with server data
                                vaultData.identities[0].profile_name = serverIdentity.profileName;
                                vaultData.identities[0].profile_picture = serverIdentity.profilePictureUrl;
                                vaultData.identities[0].cloudUrl = serverIdentity.instanceUrl; // Store instance URL
                                (vaultData.identities[0] as any).instanceId = serverIdentity.instanceId;
                                (vaultData.identities[0] as any).instanceStatus = serverIdentity.instanceStatus;
                                (vaultData.identities[0] as any).isAdmin = serverIdentity.isAdmin; // Reflect admin status
                                finalCloudUrl = serverIdentity.instanceUrl;
                            } finally {
                                if (seedForSigning) wipeMemory(seedForSigning);
                            }
                        } else if (cloudUrl) {
                            // Custom cloud
                            console.warn(`Custom cloud URL ${cloudUrl} provided. No automatic registration performed by extension.`);
                            vaultData.identities[0].profile_name = identityName;
                            vaultData.identities[0].profile_picture = identityPicture;
                            vaultData.identities[0].cloudUrl = cloudUrl; // Store custom URL as is
                        }

                        await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vaultData, [STORAGE_KEY_SETUP_COMPLETE]: true, currentIdentityDID: identityDid });
                        await chrome.storage.session.set({ [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: mnemonic, [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0 });
                        await loadActiveIdentityFromSessionInternal();

                        responsePayload = { success: true, message: "Setup finalized.", did: identityDid, identityName: vaultData.identities[0].profile_name };
                        break;
                    }

                    case "UPDATE_IDENTITY_PROFILE": {
                        console.log("Processing 'UPDATE_IDENTITY_PROFILE'");
                        const { did, profileName, profilePictureUrl, claimCode } = payload; // claimCode might be part of this for promotion
                        if (!did) throw new Error("DID required.");
                        if (!isUnlocked || currentActiveDid !== did) throw new Error("Target identity not active or vault locked.");

                        const sessionData = await chrome.storage.session.get(SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                        const decryptedSeed = sessionData[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                        if (!decryptedSeed) throw new Error("Vault locked.");

                        const localVault = (await chrome.storage.local.get(STORAGE_KEY_VAULT))[STORAGE_KEY_VAULT];
                        const identityIndex = localVault.identities.findIndex((idObj: any) => idObj.did === did);
                        if (identityIndex === -1) throw new Error("Identity not found in vault.");

                        let seedBuffer: Buffer | null = null;
                        try {
                            seedBuffer = await seedFromMnemonic(decryptedSeed);
                            const masterKey = getMasterHDKeyFromSeed(seedBuffer);
                            const keyPair = deriveChildKeyPair(masterKey, identityIndex);

                            const nonce = crypto.randomUUID().toString();
                            const timestamp = new Date().toISOString();

                            // Payload for PUT /identities/:did by owner
                            const updateOwnerPayload: any = { nonce, timestamp };
                            if (profileName !== undefined) updateOwnerPayload.profileName = profileName;
                            if (profilePictureUrl !== undefined) updateOwnerPayload.profilePictureUrl = profilePictureUrl;
                            if (claimCode !== undefined) updateOwnerPayload.claimCode = claimCode;

                            // Signature must cover all fields being sent in body, including nonce, timestamp, claimCode
                            // Example: did|nonce|timestamp|claimCode|profileName|profilePictureUrl
                            // The exact fields depend on UpdateIdentityOwnerRequestSchema and how server expects signature
                            const fieldsToSign = [claimCode || "", updateOwnerPayload.profileName || "", updateOwnerPayload.profilePictureUrl || ""];
                            const messageToSign = `${did}|${nonce}|${timestamp}|${fieldsToSign.join("|")}`;
                            updateOwnerPayload.signature = await signMessage(keyPair.privateKey, messageToSign);

                            const jwtToken = await getStoredJwt(did);
                            if (!jwtToken) throw new Error("Not logged in to cloud for this identity.");

                            const updateUrl = `${OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${did}`;
                            const updateResponse = await fetch(updateUrl, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwtToken}` },
                                body: JSON.stringify(updateOwnerPayload),
                            });

                            if (!updateResponse.ok) {
                                const errBody = await updateResponse.json().catch(() => ({ error: "Unknown update error" }));
                                throw new Error(`Profile update failed: ${errBody.error}`);
                            }
                            const updatedServerIdentity = (await updateResponse.json()) as Identity & { token?: string };

                            // Update local vault
                            localVault.identities[identityIndex].profile_name = updatedServerIdentity.profileName;
                            localVault.identities[identityIndex].profile_picture = updatedServerIdentity.profilePictureUrl;
                            if (updatedServerIdentity.isAdmin) (localVault.identities[identityIndex] as any).isAdmin = true; // Update admin status
                            await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: localVault });

                            // If a new token was issued (e.g., due to admin promotion)
                            if (updatedServerIdentity.token) {
                                await chrome.storage.session.set({ [`${SESSION_STORAGE_JWT_PREFIX}${did}`]: updatedServerIdentity.token });
                                console.log("New JWT stored after profile update/promotion.");
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
                    // ... (GET_ACTIVE_IDENTITY_DETAILS, CLOSE_SETUP_TAB, default remain similar) ...
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
        })();
        return true;
    } else if (message && typeof message === "object" && message.type === "MARK_SETUP_COMPLETE") {
        (async () => {
            try {
                await chrome.storage.local.set({ [STORAGE_KEY_SETUP_COMPLETE]: true });
                sendResponse({ success: true });
                if (sender.tab && sender.tab.id && sender.tab.url?.includes(SETUP_URL)) {
                    chrome.tabs.remove(sender.tab.id);
                }
            } catch (error: any) {
                sendResponse({ success: false, error: { message: error.message || "Unknown error" } });
            }
        })();
        return true;
    } else {
        return false;
    }
});

console.log("Vibe Background Service Worker listeners attached.");
