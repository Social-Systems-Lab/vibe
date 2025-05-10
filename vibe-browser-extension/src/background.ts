// Vibe Browser Extension - Background Service Worker
import { Buffer } from "buffer";
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
    importEd25519Key, // For importing signing key
} from "./lib/crypto"; // Adjusted path
import { didFromEd25519 } from "./lib/identity"; // Adjusted path

console.log("Vibe Background Service Worker started.");

// --- Constants ---
const SETUP_URL = chrome.runtime.getURL("setup.html");
// Persistent Storage (chrome.storage.local)
const STORAGE_KEY_SETUP_COMPLETE = "isSetupComplete";
const STORAGE_KEY_VAULT = "vibeVault";
const STORAGE_KEY_VAULT_SALT = "vibeVaultSalt";
// Session Storage (chrome.storage.session) - for data that should be cleared when the session ends
const SESSION_STORAGE_DECRYPTED_SEED_PHRASE = "decryptedSeedPhrase"; // Store with caution
const SESSION_STORAGE_ACTIVE_IDENTITY_INDEX = "activeIdentityIndex"; // Store index, derive DID

// --- Global State (Service Worker In-Memory) ---
// These are lost when the service worker becomes inactive.
// They should be re-populated from chrome.storage.session or derived when the worker starts/message received.
let activeSigningKey: CryptoKey | null = null;
let currentActiveDid: string | null = null;
let isUnlocked: boolean = false;

// --- Utility Functions ---
async function loadActiveIdentityFromSession() {
    try {
        const sessionData = await chrome.storage.session.get([SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]);
        const decryptedSeed = sessionData[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
        const activeIndex = sessionData[SESSION_STORAGE_ACTIVE_IDENTITY_INDEX];

        if (decryptedSeed && typeof activeIndex === "number") {
            const seedBuffer = await seedFromMnemonic(decryptedSeed);
            const masterKey = getMasterHDKeyFromSeed(seedBuffer);
            const identityKeyPair = deriveChildKeyPair(masterKey, activeIndex);
            activeSigningKey = await importEd25519Key(identityKeyPair.privateKey, false); // non-extractable
            currentActiveDid = didFromEd25519(identityKeyPair.publicKey);
            isUnlocked = true;
            wipeMemory(seedBuffer); // Wipe intermediate seed buffer
            console.log("Active identity loaded from session:", currentActiveDid);
            return true;
        }
    } catch (error) {
        console.error("Error loading active identity from session:", error);
        await clearSessionState(); // Clear potentially corrupted session state
    }
    isUnlocked = false;
    return false;
}

async function clearSessionState() {
    activeSigningKey = null;
    currentActiveDid = null;
    isUnlocked = false;
    await chrome.storage.session.remove([SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]);
    console.log("Session state cleared.");
}

// Attempt to load identity when service worker starts
loadActiveIdentityFromSession();

// --- Event Listeners ---

/**
 * Opens the setup page in a new tab if the extension has just been installed
 * and setup is not marked as complete.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        console.log("Vibe extension installed.");

        // Check if setup is already complete (e.g., from a previous partial install)
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY_SETUP_COMPLETE);
            if (!result[STORAGE_KEY_SETUP_COMPLETE]) {
                console.log("Setup not complete, opening setup page:", SETUP_URL);
                // Open the setup page in a new tab
                await chrome.tabs.create({ url: SETUP_URL });
            } else {
                console.log("Setup already marked as complete.");
            }
        } catch (error) {
            console.error("Error checking setup status:", error);
            // Fallback: try opening setup page anyway if storage check fails
            try {
                await chrome.tabs.create({ url: SETUP_URL });
            } catch (tabError) {
                console.error("Error opening setup tab:", tabError);
            }
        }
    } else if (details.reason === "update") {
        console.log("Vibe extension updated to version:", chrome.runtime.getManifest().version);
        // Handle updates if needed in the future
    }
});

// --- Other Background Logic (to be added later) ---

// Listener for messages from content scripts (originating from window.vibe) or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background script received message:", message, "from sender:", sender);

    if (message.type === "VIBE_AGENT_REQUEST" && message.action) {
        const { action, payload, requestId } = message;
        const origin = sender.origin || (sender.tab && sender.tab.url ? new URL(sender.tab.url).origin : "unknown_origin");

        console.log(`Action: ${action}, Origin: ${origin}, Payload:`, payload);

        // Async processing
        (async () => {
            try {
                let responsePayload: any;
                let responseType = "VIBE_AGENT_RESPONSE"; // Default success response type

                switch (action) {
                    // --- Vibe API Actions ---
                    case "init": {
                        console.log(`Processing 'init' for app: ${payload?.name} from ${origin}`);
                        if (!isUnlocked) {
                            // Attempt to load from session again, in case worker restarted
                            await loadActiveIdentityFromSession();
                        }

                        if (!isUnlocked || !currentActiveDid) {
                            responseType = "VIBE_AGENT_RESPONSE_ERROR";
                            responsePayload = { error: { message: "Vault is locked. Please unlock.", code: "VAULT_LOCKED" } };
                            break;
                        }
                        // TODO: Get actual granted permissions for this origin and DID
                        const grantedPermissions = { "profile:read": "always" }; // Placeholder
                        responsePayload = {
                            did: currentActiveDid,
                            permissions: grantedPermissions,
                            message: `Successfully initialized with ${payload?.name}. Active DID: ${currentActiveDid}`,
                        };
                        break;
                    }
                    case "readOnce": {
                        // Added braces for scope
                        console.log(`Processing 'readOnce' for collection: ${payload?.collection} from ${origin}`);
                        responsePayload = { data: { message: `Data for ${payload?.collection} would be here.` }, success: true };
                        // TODO: Add permission check and actual data fetching using activeSigningKey if needed
                        break;
                    }
                    case "write": {
                        console.log(`Processing 'write' for collection: ${payload?.collection} from ${origin} with data:`, payload?.data);
                        responsePayload = { success: true, id: "mock_document_id_123" };
                        // TODO: Add permission check and actual data writing using activeSigningKey
                        break;
                    }

                    // --- Auth/Session Actions ---
                    case "UNLOCK_VAULT": {
                        console.log("Processing 'UNLOCK_VAULT'");
                        const { password } = payload;
                        if (!password || typeof password !== "string") {
                            throw new Error("Password is required for UNLOCK_VAULT.");
                        }

                        const localData = await chrome.storage.local.get([STORAGE_KEY_VAULT, STORAGE_KEY_VAULT_SALT]);
                        const vaultData = localData[STORAGE_KEY_VAULT];
                        const saltHex = localData[STORAGE_KEY_VAULT_SALT];

                        if (!vaultData || !saltHex) {
                            throw new Error("Vault or salt not found. Setup may not be complete.");
                        }

                        const salt = Buffer.from(saltHex, "hex");
                        let encryptionKey: CryptoKey | null = null;
                        let decryptedSeedAttempt: string | null = null;
                        let seedBufferAttempt: Buffer | null = null;

                        try {
                            encryptionKey = await deriveEncryptionKey(password, salt);
                            decryptedSeedAttempt = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);

                            if (!decryptedSeedAttempt) {
                                // Should not happen if decryptData throws on failure
                                throw new Error("Decryption failed, returned null seed.");
                            }

                            // Successfully decrypted, now store in session and set active identity
                            // For MVP, assume first identity (index 0) is active
                            const activeIdentityIndex = 0; // TODO: Allow selection later

                            await chrome.storage.session.set({
                                [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt,
                                [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: activeIdentityIndex,
                            });

                            // Load into global state
                            await loadActiveIdentityFromSession();

                            if (!isUnlocked) {
                                // Should be unlocked now if loadActiveIdentityFromSession succeeded
                                throw new Error("Failed to load active identity into global state after unlock.");
                            }

                            responsePayload = { success: true, did: currentActiveDid, message: "Vault unlocked." };
                            console.log("Vault unlocked successfully. Active DID:", currentActiveDid);
                        } catch (error) {
                            console.error("Failed to unlock vault:", error);
                            await clearSessionState(); // Ensure session is cleared on failed unlock
                            throw new Error("Failed to unlock vault. Invalid password or corrupted data.");
                        } finally {
                            if (encryptionKey) encryptionKey = null; // Clear derived key
                            // decryptedSeedAttempt is stored in session or discarded
                            if (seedBufferAttempt) wipeMemory(seedBufferAttempt);
                        }
                        break;
                    }
                    case "LOCK_VAULT": {
                        console.log("Processing 'LOCK_VAULT'");
                        await clearSessionState();
                        responsePayload = { success: true, message: "Vault locked." };
                        break;
                    }
                    case "GET_LOCK_STATE": {
                        console.log("Processing 'GET_LOCK_STATE'");
                        // Ensure global state reflects session state, especially if worker just restarted
                        if (!isUnlocked) await loadActiveIdentityFromSession();
                        responsePayload = { isUnlocked, activeDid: currentActiveDid };
                        break;
                    }

                    // --- Setup Actions ---
                    case "SETUP_CREATE_VAULT": {
                        console.log("Processing 'SETUP_CREATE_VAULT'");
                        await clearSessionState(); // Ensure any previous session is cleared before new setup
                        const { password } = payload;
                        if (!password || typeof password !== "string") {
                            throw new Error("Password is required for SETUP_CREATE_VAULT.");
                        }

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
                                identities: [
                                    {
                                        did: firstDid,
                                        derivationPath: firstIdentityKeys.derivationPath,
                                        profile_name: null, // To be set in a later step
                                        profile_picture: null, // To be set in a later step
                                    },
                                ],
                                settings: {
                                    nextAccountIndex: 1,
                                    cloudUrl: null, // To be set in a later step
                                    // claimCode: null // Claim code is ephemeral, not stored in vault
                                },
                            };

                            await chrome.storage.local.set({
                                [STORAGE_KEY_VAULT_SALT]: saltHex,
                                [STORAGE_KEY_VAULT]: vaultData,
                            });

                            responsePayload = { mnemonic }; // Return the generated mnemonic to the frontend
                            console.log("Vault created and stored successfully. Mnemonic returned.");
                        } finally {
                            // Securely wipe sensitive data
                            if (encryptionKey) encryptionKey = null; // CryptoKey objects are not directly wipeable but ensure no refs
                            if (seed) wipeMemory(seed);
                            // The mnemonic itself is returned, frontend should handle wiping it after display
                        }
                        break;
                    }
                    case "SETUP_IMPORT_VAULT": {
                        console.log("Processing 'SETUP_IMPORT_VAULT'");
                        const { importedMnemonic, password } = payload;
                        if (!importedMnemonic || typeof importedMnemonic !== "string") {
                            throw new Error("Imported mnemonic is required for SETUP_IMPORT_VAULT.");
                        }
                        if (!password || typeof password !== "string") {
                            throw new Error("Password is required for SETUP_IMPORT_VAULT.");
                        }

                        const salt = generateSalt(); // New salt for this device
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
                                        profile_name: null, // To be set later
                                        profile_picture: null, // To be set later
                                    },
                                ],
                                settings: {
                                    nextAccountIndex: 1,
                                    cloudUrl: null, // To be set later
                                },
                            };

                            await chrome.storage.local.set({
                                [STORAGE_KEY_VAULT_SALT]: saltHex,
                                [STORAGE_KEY_VAULT]: vaultData,
                            });

                            responsePayload = { success: true, message: "Vault imported successfully." };
                            console.log("Vault imported and stored successfully.");
                        } finally {
                            if (encryptionKey) encryptionKey = null;
                            if (seed) wipeMemory(seed);
                            // Frontend should wipe importedMnemonic from its state
                        }
                        break;
                    }
                    case "SETUP_COMPLETE_AND_FINALIZE": {
                        // Combines cloud config and marking setup complete
                        console.log("Processing 'SETUP_COMPLETE_AND_FINALIZE'");
                        const { identityName, identityPicture, cloudUrl, claimCode } = payload;
                        // TODO: Validate inputs

                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        const vaultData = vaultResult[STORAGE_KEY_VAULT];

                        if (!vaultData || !vaultData.identities || vaultData.identities.length === 0) {
                            throw new Error("Vault not found or no identities in vault during finalization.");
                        }

                        // Update first identity and settings
                        vaultData.identities[0].profile_name = identityName || null;
                        vaultData.identities[0].profile_picture = identityPicture || null;
                        vaultData.settings.cloudUrl = cloudUrl || null;
                        // vaultData.settings.claimCode = claimCode; // Claim code is not stored long-term

                        await chrome.storage.local.set({
                            [STORAGE_KEY_VAULT]: vaultData,
                            [STORAGE_KEY_SETUP_COMPLETE]: true, // Mark setup as complete
                        });

                        // TODO: If claimCode is present, perform Vibe Cloud registration/claim
                        if (claimCode) {
                            console.log(`TODO: Implement Vibe Cloud claim with URL: ${cloudUrl} and Code: ${claimCode}`);
                            // This would involve an API call to the Vibe Cloud server
                        }

                        responsePayload = { success: true, message: "Setup finalized and marked complete." };
                        console.log("Setup finalized, vault updated, and setup marked complete.");

                        // Optionally, close the setup tab
                        if (sender.tab && sender.tab.id && sender.tab.url?.includes(SETUP_URL)) {
                            console.log("Closing setup tab:", sender.tab.id);
                            chrome.tabs.remove(sender.tab.id);
                        }
                        break;
                    }

                    default:
                        console.warn(`Unknown action: ${action}`);
                        console.warn(`Unknown action: ${action}`);
                        // Ensure responsePayload is an object with an error property for unknown actions
                        responsePayload = { error: { message: `Unknown action: ${action}` } };
                        responseType = "VIBE_AGENT_RESPONSE_ERROR"; // Set response type to error
                        // No 'return' here, sendResponse will be called outside the switch
                        break; // Added break
                }

                // Unified sendResponse call
                if (responseType === "VIBE_AGENT_RESPONSE_ERROR") {
                    sendResponse({ type: responseType, requestId, error: responsePayload.error });
                } else {
                    sendResponse({ type: responseType, requestId, payload: responsePayload });
                }
            } catch (error: any) {
                console.error(`Error processing action ${action}:`, error);
                sendResponse({ type: "VIBE_AGENT_RESPONSE_ERROR", requestId, error: { message: error.message || "Unknown error occurred" } });
            }
        })();
        return true; // Indicates that sendResponse will be called asynchronously
    } else if (message.type === "MARK_SETUP_COMPLETE") {
        // Message from SetupWizard after import flow
        (async () => {
            try {
                await chrome.storage.local.set({ [STORAGE_KEY_SETUP_COMPLETE]: true });
                console.log("Setup marked as complete via MARK_SETUP_COMPLETE.");
                sendResponse({ success: true }); // This sendResponse is specific to this message type

                // Optionally, close the setup tab if the sender is the setup page
                if (sender.tab && sender.tab.id && sender.tab.url?.includes(SETUP_URL)) {
                    console.log("Closing setup tab:", sender.tab.id);
                    chrome.tabs.remove(sender.tab.id);
                }
            } catch (error: any) {
                console.error("Error marking setup complete:", error);
                sendResponse({ success: false, error: error.message }); // Specific error response
            }
        })();
        return true; // Async response for MARK_SETUP_COMPLETE
    } else {
        console.log("Received unhandled message type or message without action:", message);
        // If not VIBE_AGENT_REQUEST or MARK_SETUP_COMPLETE, and not sending async response, return false.
        return false;
    }
    // This line should ideally not be reached if all paths return true/false correctly.
    // However, to satisfy TypeScript, ensure all code paths in the listener return a boolean.
    // If message.type was VIBE_AGENT_REQUEST, 'true' was already returned.
    // If it was MARK_SETUP_COMPLETE, 'true' was already returned.
    // If it was something else, 'false' was returned.
});

console.log("Vibe Background Service Worker listeners attached.");
