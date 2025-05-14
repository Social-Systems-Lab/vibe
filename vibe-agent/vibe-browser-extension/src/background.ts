console.log("[BACKGROUND_SCRIPT_RESTORING_CODE] Service worker script has started."); // Keep top-level log
import { Buffer } from "buffer"; // Standard import

// Explicitly make Buffer available on self, for environments where it might be needed globally.
// This should ideally be handled by the bundler's polyfilling for browser/service worker targets,
// but we're adding it defensively due to previous "Buffer is not defined" errors.
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
    importEd25519Key, // Ensure this is imported
    validateMnemonic, // Ensure validateMnemonic is imported for the test
    signMessage, // Assuming a function to sign a message with a private key
} from "./lib/crypto";
import { didFromEd25519 } from "./lib/identity";
// Removed incorrect import of öffentlicheVibeCloudUrl

console.log("Vibe Background Service Worker started."); // Original log line

// --- BIP39 Self-Test ---
try {
    console.log("[BIP39 TEST] Running self-test...");
    const testMnemonic = generateMnemonic(12); // Generate a 12-word for quick test
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
const OFFICIAL_VIBE_CLOUD_PROVISIONING_URL = "https://vibe-cloud-cp.vibeapp.dev"; // Define this constant
const SETUP_URL = chrome.runtime.getURL("setup.html");
const STORAGE_KEY_SETUP_COMPLETE = "isSetupComplete";
const STORAGE_KEY_VAULT = "vibeVault";
const STORAGE_KEY_VAULT_SALT = "vibeVaultSalt";
const SESSION_STORAGE_DECRYPTED_SEED_PHRASE = "decryptedSeedPhrase";
const SESSION_STORAGE_ACTIVE_IDENTITY_INDEX = "activeIdentityIndex";

// --- Global State ---
let activeSigningKey: CryptoKey | null = null;
let currentActiveDid: string | null = null;
let isUnlocked: boolean = false;

// --- Utility Functions ---
async function loadActiveIdentityFromSessionInternal() {
    // Renamed to avoid conflict if uncommented later
    try {
        const sessionData = await chrome.storage.session.get([SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]);
        const decryptedSeed = sessionData[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
        const activeIndex = sessionData[SESSION_STORAGE_ACTIVE_IDENTITY_INDEX];

        if (decryptedSeed && typeof activeIndex === "number") {
            const seedBuffer = await seedFromMnemonic(decryptedSeed);
            const masterKey = getMasterHDKeyFromSeed(seedBuffer);
            const identityKeyPair = deriveChildKeyPair(masterKey, activeIndex);
            activeSigningKey = await importEd25519Key(identityKeyPair.privateKey, false);
            currentActiveDid = didFromEd25519(identityKeyPair.publicKey);
            isUnlocked = true;
            wipeMemory(seedBuffer);
            console.log("Active identity loaded from session:", currentActiveDid);
            return true;
        }
    } catch (error) {
        console.error("Error loading active identity from session:", error);
        await clearSessionStateInternal(); // Use renamed version
    }
    isUnlocked = false;
    return false;
}

async function clearSessionStateInternal() {
    // Renamed
    activeSigningKey = null;
    currentActiveDid = null;
    isUnlocked = false;
    await chrome.storage.session.remove([SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]);
    console.log("Session state cleared.");
}

// loadActiveIdentityFromSessionInternal(); // Keep commented out for now

// --- Event Listeners ---
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        console.log("Vibe extension installed.");
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY_SETUP_COMPLETE);
            if (!result[STORAGE_KEY_SETUP_COMPLETE]) {
                console.log("Setup not complete, opening setup page:", SETUP_URL);
                await chrome.tabs.create({ url: SETUP_URL });
            } else {
                console.log("Setup already marked as complete.");
            }
        } catch (error) {
            console.error("Error checking setup status:", error);
            try {
                await chrome.tabs.create({ url: SETUP_URL });
            } catch (tabError) {
                console.error("Error opening setup tab:", tabError);
            }
        }
    } else if (details.reason === "update") {
        console.log("Vibe extension updated to version:", chrome.runtime.getManifest().version);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        console.log("[BG_LOG_1_RAW_MSG] Raw message received:", JSON.stringify(message));
    } catch (e) {
        console.log("[BG_LOG_1_RAW_MSG_ERROR] Error stringifying message. Message object:", message);
    }
    console.log("[BG_LOG_1_SENDER] Sender:", sender);
    console.log("[BG_LOG_1_MSG_VALID_CHECK] message is truthy:", !!message);
    console.log("[BG_LOG_1_MSG_TYPEOF_CHECK] typeof message:", typeof message);

    if (message && typeof message === "object") {
        console.log("[BG_LOG_1A_MSG_IS_OBJECT] Message is an object.");
        console.log("[BG_LOG_1B_MSG_PROP_TYPE_VALUE] message.type value:", message.type);
        console.log("[BG_LOG_1C_MSG_PROP_ACTION_VALUE] message.action value:", message.action);
        console.log("[BG_LOG_1D_COND_TYPE_EVAL] (message.type === 'VIBE_AGENT_REQUEST'):", message.type === "VIBE_AGENT_REQUEST");
        console.log("[BG_LOG_1E_COND_ACTION_EVAL] (!!message.action):", !!message.action);
    } else {
        console.log("[BG_LOG_1F_MSG_NOT_OBJECT_OR_NULL] Message is null or not an object, or not typeof 'object'.");
    }

    if (message && typeof message === "object" && message.type === "VIBE_AGENT_REQUEST" && message.action) {
        console.log("[BG_LOG_2] VIBE_AGENT_REQUEST outer condition met. Action from message.action:", message.action);
        const { action, payload, requestId } = message;
        console.log("[BG_LOG_3] Destructured message. Action:", action);
        let origin;
        try {
            origin = sender.origin || (sender.tab && sender.tab.url ? new URL(sender.tab.url).origin : "unknown_origin");
            console.log("[BG_LOG_4] Calculated origin:", origin);
        } catch (e: any) {
            console.error("[BG_ERROR_ORIGIN] Error calculating origin:", e.message, e.stack);
            return false;
        }
        console.log(`[BG_LOG_5] Full action details: Action: ${action}, Origin: ${origin}, Payload:`, payload);

        (async () => {
            console.log(`[BG_LOG_6] Entered async IIFE for action: ${action}`);
            let responsePayload: any;
            let responseType = "VIBE_AGENT_RESPONSE";
            try {
                switch (action) {
                    case "init": {
                        console.log(`Processing 'init' for app: ${payload?.name} from ${origin}`);
                        if (!isUnlocked) await loadActiveIdentityFromSessionInternal();
                        if (!isUnlocked || !currentActiveDid) {
                            responseType = "VIBE_AGENT_RESPONSE_ERROR";
                            responsePayload = { error: { message: "Vault is locked. Please unlock.", code: "VAULT_LOCKED" } };
                            break;
                        }
                        const grantedPermissions = { "profile:read": "always" };
                        responsePayload = {
                            did: currentActiveDid,
                            permissions: grantedPermissions,
                            message: `Successfully initialized with ${payload?.name}. Active DID: ${currentActiveDid}`,
                        };
                        break;
                    }
                    case "readOnce": {
                        console.log(`Processing 'readOnce' for collection: ${payload?.collection} from ${origin}`);
                        responsePayload = { data: { message: `Data for ${payload?.collection} would be here.` }, success: true };
                        break;
                    }
                    case "write": {
                        console.log(`Processing 'write' for collection: ${payload?.collection} from ${origin} with data:`, payload?.data);
                        responsePayload = { success: true, id: "mock_document_id_123" };
                        break;
                    }
                    case "UNLOCK_VAULT": {
                        console.log("Processing 'UNLOCK_VAULT'");
                        const { password } = payload;
                        if (!password || typeof password !== "string") throw new Error("Password is required for UNLOCK_VAULT.");
                        const localData = await chrome.storage.local.get([STORAGE_KEY_VAULT, STORAGE_KEY_VAULT_SALT]);
                        const vaultData = localData[STORAGE_KEY_VAULT];
                        const saltHex = localData[STORAGE_KEY_VAULT_SALT];
                        if (!vaultData || !saltHex) throw new Error("Vault or salt not found. Setup may not be complete.");
                        const salt = Buffer.from(saltHex, "hex");
                        let encryptionKey: CryptoKey | null = null;
                        let decryptedSeedAttempt: string | null = null;
                        let seedBufferAttempt: Buffer | null = null;
                        try {
                            encryptionKey = await deriveEncryptionKey(password, salt);
                            decryptedSeedAttempt = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);
                            if (!decryptedSeedAttempt) throw new Error("Decryption failed, returned null seed.");
                            const activeIdentityIndex = 0;
                            await chrome.storage.session.set({
                                [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt,
                                [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: activeIdentityIndex,
                            });
                            await loadActiveIdentityFromSessionInternal();
                            if (!isUnlocked) throw new Error("Failed to load active identity into global state after unlock.");
                            responsePayload = { success: true, did: currentActiveDid, message: "Vault unlocked." };
                            console.log("Vault unlocked successfully. Active DID:", currentActiveDid);
                        } catch (error) {
                            console.error("Failed to unlock vault:", error);
                            await clearSessionStateInternal();
                            throw new Error("Failed to unlock vault. Invalid password or corrupted data.");
                        } finally {
                            if (encryptionKey) encryptionKey = null;
                            if (seedBufferAttempt) wipeMemory(seedBufferAttempt);
                        }
                        break;
                    }
                    case "LOCK_VAULT": {
                        console.log("Processing 'LOCK_VAULT'");
                        await clearSessionStateInternal();
                        responsePayload = { success: true, message: "Vault locked." };
                        break;
                    }
                    case "GET_LOCK_STATE": {
                        console.log("Processing 'GET_LOCK_STATE'");
                        if (!isUnlocked) await loadActiveIdentityFromSessionInternal();
                        responsePayload = { isUnlocked, activeDid: currentActiveDid };
                        break;
                    }
                    case "SETUP_CREATE_VAULT": {
                        console.log("[BG_LOG_7_CV_Start] Processing 'SETUP_CREATE_VAULT'");
                        await clearSessionStateInternal();
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
                            const masterHDKey = getMasterHDKeyFromSeed(seed);
                            const firstIdentityKeys = deriveChildKeyPair(masterHDKey, 0);
                            const firstDid = didFromEd25519(firstIdentityKeys.publicKey);
                            const vaultData = {
                                encryptedSeedPhrase: encryptedMnemonicData,
                                identities: [{ did: firstDid, derivationPath: firstIdentityKeys.derivationPath, profile_name: null, profile_picture: null }],
                                settings: { nextAccountIndex: 1, cloudUrl: null },
                            };
                            await chrome.storage.local.set({ [STORAGE_KEY_VAULT_SALT]: saltHex, [STORAGE_KEY_VAULT]: vaultData });
                            responsePayload = { mnemonic };
                            console.log("[BG_LOG_7_CV_Success] Vault created. Mnemonic:", mnemonic.substring(0, 10) + "...");
                        } finally {
                            if (encryptionKey) encryptionKey = null;
                            if (seed) wipeMemory(seed);
                        }
                        break;
                    }
                    case "SETUP_IMPORT_VAULT": {
                        console.log("Processing 'SETUP_IMPORT_VAULT'");
                        const { importedMnemonic, password } = payload;
                        if (!importedMnemonic || typeof importedMnemonic !== "string") throw new Error("Imported mnemonic is required.");
                        if (!password || typeof password !== "string") throw new Error("Password is required.");
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
                                identities: [{ did: firstDid, derivationPath: firstIdentityKeys.derivationPath, profile_name: null, profile_picture: null }],
                                settings: { nextAccountIndex: 1, cloudUrl: null },
                            };
                            await chrome.storage.local.set({ [STORAGE_KEY_VAULT_SALT]: saltHex, [STORAGE_KEY_VAULT]: vaultData });
                            // Do not mark setup as complete here. Frontend will proceed to SetupIdentityStep.
                            responsePayload = { success: true, did: firstDid, message: "Vault imported. Proceed to identity setup." };
                            console.log("Vault imported and stored successfully. First DID:", firstDid);
                        } finally {
                            if (encryptionKey) encryptionKey = null;
                            if (seed) wipeMemory(seed);
                        }
                        break;
                    }
                    case "SETUP_COMPLETE_AND_FINALIZE": {
                        console.log("Processing 'SETUP_COMPLETE_AND_FINALIZE'");
                        const { identityName, identityPicture, cloudUrl, claimCode, password, mnemonic } = payload;

                        if (!password || !mnemonic) {
                            throw new Error("Password and mnemonic are required for finalization.");
                        }

                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        let vaultData = vaultResult[STORAGE_KEY_VAULT];

                        if (!vaultData || !vaultData.identities || vaultData.identities.length === 0) {
                            // This case implies SETUP_CREATE_VAULT or SETUP_IMPORT_VAULT might not have run or saved correctly.
                            // For robustness, let's try to re-create the basic vault structure if missing,
                            // using the provided mnemonic and password.
                            console.warn("Vault data not found or incomplete during finalization. Attempting to reconstruct basic vault.");

                            const salt = generateSalt();
                            const saltHex = Buffer.from(salt).toString("hex");
                            let encryptionKeyRecon: CryptoKey | null = null;
                            let seedRecon: Buffer | null = null;
                            try {
                                encryptionKeyRecon = await deriveEncryptionKey(password, salt);
                                const encryptedMnemonicData = await encryptData(mnemonic, encryptionKeyRecon);
                                seedRecon = await seedFromMnemonic(mnemonic);
                                const masterHDKey = getMasterHDKeyFromSeed(seedRecon);
                                const firstIdentityKeys = deriveChildKeyPair(masterHDKey, 0);
                                const firstDid = didFromEd25519(firstIdentityKeys.publicKey);

                                vaultData = {
                                    encryptedSeedPhrase: encryptedMnemonicData,
                                    identities: [
                                        { did: firstDid, derivationPath: firstIdentityKeys.derivationPath, profile_name: null, profile_picture: null },
                                    ],
                                    settings: { nextAccountIndex: 1, cloudUrl: null },
                                };
                                await chrome.storage.local.set({ [STORAGE_KEY_VAULT_SALT]: saltHex, [STORAGE_KEY_VAULT]: vaultData });
                                console.log("Basic vault structure reconstructed and saved.");
                            } finally {
                                if (encryptionKeyRecon) encryptionKeyRecon = null; // Clear key from memory
                                if (seedRecon) wipeMemory(seedRecon);
                            }
                        }

                        const userDid = vaultData.identities[0].did;
                        let finalCloudUrl = cloudUrl;

                        if (cloudUrl === OFFICIAL_VIBE_CLOUD_PROVISIONING_URL && !claimCode) {
                            console.log(`Official Vibe Cloud selected. Initiating provisioning for DID: ${userDid}`);

                            // 1. Derive private key for signing
                            // We need the raw private key bytes.
                            // The `activeSigningKey` (CryptoKey) is for WebCrypto API, but we might need direct access
                            // to the private key bytes if `signMessage` expects that, or use WebCrypto's sign.
                            // Let's assume `deriveChildKeyPair` gives us the raw private key.
                            let seedForSigning: Buffer | null = null;
                            let privateKeyBytes: Uint8Array | null = null;
                            try {
                                seedForSigning = await seedFromMnemonic(mnemonic);
                                const masterKey = getMasterHDKeyFromSeed(seedForSigning);
                                const keyPair = deriveChildKeyPair(masterKey, 0); // Assuming first identity
                                privateKeyBytes = keyPair.privateKey;

                                if (!privateKeyBytes) {
                                    throw new Error("Failed to derive private key for signing.");
                                }

                                const nonce = crypto.randomUUID();
                                const timestamp = new Date().toISOString();
                                const messageToSign = nonce + timestamp;

                                // The signMessage function needs to be implemented in lib/crypto.ts
                                // It should take Uint8Array privateKey and string message, return base64 signature
                                const signature = await signMessage(privateKeyBytes, messageToSign);

                                const provisionRequestPayload = {
                                    did: userDid,
                                    nonce,
                                    timestamp,
                                    signature,
                                };

                                console.log("Sending provisioning request:", provisionRequestPayload);
                                const provisionResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_PROVISIONING_URL}/api/v1/provision/instance`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(provisionRequestPayload),
                                });

                                if (!provisionResponse.ok) {
                                    const errorBody = await provisionResponse
                                        .json()
                                        .catch(() => ({ error: "Failed to parse error response from provisioning server." }));
                                    throw new Error(
                                        `Provisioning request failed: ${provisionResponse.status} ${provisionResponse.statusText} - ${
                                            errorBody.error || "Unknown error"
                                        }`
                                    );
                                }

                                const provisionResult = await provisionResponse.json();
                                if (provisionResponse.status !== 202 || !provisionResult.instanceIdentifier) {
                                    throw new Error(`Provisioning not accepted: ${provisionResult.message || "Missing instance identifier"}`);
                                }

                                console.log("Provisioning accepted, instanceIdentifier:", provisionResult.instanceIdentifier);

                                // Poll for status
                                let attempts = 0;
                                const maxAttempts = 30; // Poll for 5 minutes (30 attempts * 10 seconds)
                                const pollInterval = 10000; // 10 seconds

                                while (attempts < maxAttempts) {
                                    attempts++;
                                    console.log(`Polling status for ${provisionResult.instanceIdentifier}, attempt ${attempts}`);
                                    await new Promise((resolve) => setTimeout(resolve, pollInterval));

                                    const statusResponse = await fetch(
                                        `${OFFICIAL_VIBE_CLOUD_PROVISIONING_URL}/api/v1/provision/status/${provisionResult.instanceIdentifier}`
                                    );
                                    if (!statusResponse.ok) {
                                        // Non-fatal, continue polling unless it's a clear permanent error
                                        console.warn(`Status poll failed: ${statusResponse.status} ${statusResponse.statusText}. Retrying...`);
                                        continue;
                                    }
                                    const statusData = await statusResponse.json();
                                    console.log("Status poll response:", statusData);

                                    if (statusData.status === "completed") {
                                        if (!statusData.instanceUrl) {
                                            throw new Error("Provisioning completed but instance URL is missing.");
                                        }
                                        finalCloudUrl = statusData.instanceUrl;
                                        console.log(`Provisioning successful! Instance URL: ${finalCloudUrl}`);
                                        break;
                                    } else if (statusData.status === "failed") {
                                        throw new Error(`Provisioning failed: ${statusData.errorDetails || "Unknown error from control plane."}`);
                                    }
                                    // If "pending" or "provisioning", continue loop
                                }

                                if (attempts >= maxAttempts) {
                                    throw new Error("Provisioning timed out after several attempts.");
                                }
                            } finally {
                                if (seedForSigning) wipeMemory(seedForSigning);
                                if (privateKeyBytes) privateKeyBytes.fill(0); // Clear private key bytes
                            }
                        } else if (claimCode) {
                            // Handle claim code logic if necessary (currently a TODO)
                            console.log(`TODO: Implement Vibe Cloud claim with URL: ${cloudUrl} and Code: ${claimCode}`);
                            // For now, if there's a claim code, we assume the provided cloudUrl is the final one.
                            // This part might need adjustment based on how claim codes affect the final instance URL.
                            finalCloudUrl = cloudUrl;
                        }
                        // If it's a custom URL without a claim code, finalCloudUrl is already set from payload.cloudUrl

                        vaultData.identities[0].profile_name = identityName || null;
                        vaultData.identities[0].profile_picture = identityPicture || null;
                        vaultData.settings.cloudUrl = finalCloudUrl || null; // Use the potentially updated finalCloudUrl

                        await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vaultData, [STORAGE_KEY_SETUP_COMPLETE]: true });

                        responsePayload = {
                            success: true,
                            message: "Setup finalized and marked complete." + (finalCloudUrl ? ` Connected to ${finalCloudUrl}.` : ""),
                            identityName: vaultData.identities[0].profile_name,
                        };
                        console.log("Setup finalized, vault updated, and setup marked complete.");
                        break;
                    }
                    case "CLOSE_SETUP_TAB": {
                        console.log("Processing 'CLOSE_SETUP_TAB'");
                        if (sender.tab && sender.tab.id) {
                            console.log("Closing tab:", sender.tab.id);
                            chrome.tabs.remove(sender.tab.id);
                            responsePayload = { success: true, message: "Setup tab closed." };
                        } else {
                            console.warn("No sender tab ID found to close.");
                            responsePayload = { success: false, message: "No tab ID to close." };
                            responseType = "VIBE_AGENT_RESPONSE_ERROR";
                        }
                        break;
                    }
                    default:
                        console.warn(`[BG_WARN_UnknownAction] Unknown action: ${action}`);
                        responsePayload = { error: { message: `Unknown action: ${action}` } };
                        responseType = "VIBE_AGENT_RESPONSE_ERROR";
                        break;
                }
                console.log(
                    `[BG_LOG_8_PreSend] About to send response for ${action}. Type: ${responseType}, Payload defined: ${responsePayload !== undefined}`
                );
                if (responseType === "VIBE_AGENT_RESPONSE_ERROR") {
                    sendResponse({ type: responseType, requestId, error: responsePayload.error });
                } else {
                    sendResponse({ type: responseType, requestId, payload: responsePayload });
                }
                console.log(`[BG_LOG_9_PostSend] Response sent for ${action}.`);
            } catch (error: any) {
                console.error(`[BG_ERROR_IIFE] Error in async IIFE for ${action}:`, error.message, error.stack);
                const errPayload = error instanceof Error ? { message: error.message } : { message: "Unknown error occurred" };
                sendResponse({ type: "VIBE_AGENT_RESPONSE_ERROR", requestId, error: errPayload });
            }
        })();
        console.log("[BG_LOG_10] Returning true for async VIBE_AGENT_REQUEST for action:", action);
        return true;
    } else if (message && typeof message === "object" && message.type === "MARK_SETUP_COMPLETE") {
        console.log("[BG_LOG_MSC_Start] Processing MARK_SETUP_COMPLETE");
        (async () => {
            try {
                await chrome.storage.local.set({ [STORAGE_KEY_SETUP_COMPLETE]: true });
                console.log("[BG_LOG_MSC_Success] Setup marked as complete.");
                sendResponse({ success: true });
                if (sender.tab && sender.tab.id && sender.tab.url?.includes(SETUP_URL)) {
                    console.log("[BG_LOG_MSC_ClosingTab] Closing setup tab:", sender.tab.id);
                    chrome.tabs.remove(sender.tab.id);
                }
            } catch (error: any) {
                console.error("[BG_ERROR_MSC] Error marking setup complete:", error.message, error.stack);
                sendResponse({ success: false, error: { message: error.message || "Unknown error" } });
            }
        })();
        console.log("[BG_LOG_MSC_ReturnTrue] Returning true for async MARK_SETUP_COMPLETE.");
        return true;
    } else {
        console.log("[BG_LOG_OTHER] Unhandled message structure or type:", message);
        return false;
    }
});

console.log("Vibe Background Service Worker listeners attached.");
