console.log("[BACKGROUND_SCRIPT_RESTORING_CODE] Service worker script has started."); // Keep top-level log
import { Buffer } from "buffer"; // Standard import

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
    // importEd25519Key, // No longer used as it was causing errors and signMessage uses noble directly
    validateMnemonic, // Ensure validateMnemonic is imported for the test
    signMessage, // Assuming a function to sign a message with a private key
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
const OFFICIAL_VIBE_CLOUD_PROVISIONING_URL = "https://vibe-cloud-cp.vibeapp.dev";
const SETUP_URL = chrome.runtime.getURL("setup.html");
const STORAGE_KEY_SETUP_COMPLETE = "isSetupComplete";
const STORAGE_KEY_VAULT = "vibeVault";
const STORAGE_KEY_VAULT_SALT = "vibeVaultSalt";
const SESSION_STORAGE_DECRYPTED_SEED_PHRASE = "decryptedSeedPhrase";
const SESSION_STORAGE_ACTIVE_IDENTITY_INDEX = "activeIdentityIndex";
const GAP_LIMIT = 20; // Standard gap limit for address discovery

// --- Global State ---
// let activeSigningKey: CryptoKey | null = null; // This was causing issues and isn't used by the current signing flow
let currentActiveDid: string | null = null;
let isUnlocked: boolean = false;

// --- Utility Functions ---
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
                // activeSigningKey = await importEd25519Key(identityKeyPair.privateKey, false); // Removed: problematic and not used for noble/ed25519 signing
                currentActiveDid = didFromEd25519(identityKeyPair.publicKey);
                isUnlocked = true;
                console.log("Active identity loaded from session:", currentActiveDid);
                return true;
            } finally {
                if (seedBuffer) wipeMemory(seedBuffer);
            }
        }
    } catch (error) {
        console.error("Error loading active identity from session:", error);
        await clearSessionStateInternal(); // Ensure session is cleared on error
    }
    isUnlocked = false; // Ensure state is consistent if loading fails
    return false;
}

async function clearSessionStateInternal() {
    // activeSigningKey = null; // No longer used
    currentActiveDid = null;
    isUnlocked = false;
    await chrome.storage.session.remove([SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]);
    console.log("Session state cleared.");
}

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
    // Logging removed for brevity in this reconstruction, but would be present
    if (message && typeof message === "object" && message.type === "VIBE_AGENT_REQUEST" && message.action) {
        const { action, payload, requestId } = message;
        // let origin = sender.origin || (sender.tab && sender.tab.url ? new URL(sender.tab.url).origin : "unknown_origin");

        (async () => {
            let responsePayload: any;
            let responseType = "VIBE_AGENT_RESPONSE";
            try {
                switch (action) {
                    case "init":
                        // ... (existing init logic)
                        if (!isUnlocked) await loadActiveIdentityFromSessionInternal();
                        if (!isUnlocked || !currentActiveDid) {
                            responseType = "VIBE_AGENT_RESPONSE_ERROR";
                            responsePayload = { error: { message: "Vault is locked. Please unlock.", code: "VAULT_LOCKED" } };
                        } else {
                            responsePayload = { did: currentActiveDid, permissions: { "profile:read": "always" }, message: "Successfully initialized." };
                        }
                        break;

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
                        try {
                            encryptionKey = await deriveEncryptionKey(password, salt);
                            decryptedSeedAttempt = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);
                            if (!decryptedSeedAttempt) throw new Error("Decryption failed, returned null seed.");
                            const activeIdentityIndex = vaultData.settings?.activeIdentityIndex || 0; // Use stored or default
                            await chrome.storage.session.set({
                                [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt,
                                [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: activeIdentityIndex,
                            });
                            await loadActiveIdentityFromSessionInternal();
                            if (!isUnlocked) throw new Error("Failed to load active identity into global state after unlock.");
                            responsePayload = { success: true, did: currentActiveDid, message: "Vault unlocked." };
                        } catch (error) {
                            await clearSessionStateInternal();
                            throw new Error(`Failed to unlock vault. ${error instanceof Error ? error.message : String(error)}`);
                        } finally {
                            if (encryptionKey) encryptionKey = null;
                        }
                        break;
                    }
                    // ... (other existing cases like LOCK_VAULT, GET_LOCK_STATE, SETUP_CREATE_VAULT, SETUP_IMPORT_VAULT) ...
                    case "SETUP_CREATE_VAULT": {
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
                                identities: [
                                    {
                                        did: firstDid,
                                        derivationPath: firstIdentityKeys.derivationPath,
                                        profile_name: null,
                                        profile_picture: null,
                                        cloudUrl: null,
                                    },
                                ],
                                settings: { nextAccountIndex: 1, activeIdentityIndex: 0 },
                            };
                            await chrome.storage.local.set({ [STORAGE_KEY_VAULT_SALT]: saltHex, [STORAGE_KEY_VAULT]: vaultData });
                            responsePayload = { mnemonic };
                        } finally {
                            if (encryptionKey) encryptionKey = null;
                            if (seed) wipeMemory(seed);
                        }
                        break;
                    }
                    case "SETUP_IMPORT_VAULT": {
                        // This is the older direct import, might be deprecated by the new flow
                        const { importedMnemonic, password } = payload;
                        if (!importedMnemonic || !password) throw new Error("Mnemonic and password required.");
                        // Simplified: assumes this creates a new vault, overwriting existing.
                        // For full recovery, use SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES
                        const salt = generateSalt();
                        const saltHex = Buffer.from(salt).toString("hex");
                        const encryptionKey = await deriveEncryptionKey(password, salt);
                        const encryptedMnemonicData = await encryptData(importedMnemonic, encryptionKey);
                        const seed = await seedFromMnemonic(importedMnemonic);
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
                        await chrome.storage.local.set({ [STORAGE_KEY_VAULT_SALT]: saltHex, [STORAGE_KEY_VAULT]: vaultData });
                        wipeMemory(seed);
                        responsePayload = { success: true, did: firstDid, message: "Vault imported. Proceed to identity setup." };
                        break;
                    }
                    case "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES": {
                        console.log("Processing 'SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES'");
                        const { importedMnemonic, password } = payload;

                        if (!importedMnemonic || typeof importedMnemonic !== "string" || !validateMnemonic(importedMnemonic)) {
                            throw new Error("Valid imported mnemonic is required.");
                        }
                        if (!password || typeof password !== "string") {
                            throw new Error("Password for local vault encryption is required.");
                        }

                        await clearSessionStateInternal();

                        const salt = generateSalt();
                        const saltHex = Buffer.from(salt).toString("hex");
                        let encryptionKey: CryptoKey | null = null;
                        let masterSeedBuffer: Buffer | null = null;

                        try {
                            encryptionKey = await deriveEncryptionKey(password, salt);
                            const encryptedMnemonicData = await encryptData(importedMnemonic, encryptionKey);

                            const initialVaultData = {
                                encryptedSeedPhrase: encryptedMnemonicData,
                                identities: [],
                                settings: { nextAccountIndex: 0, activeIdentityIndex: 0 },
                            };
                            await chrome.storage.local.set({
                                [STORAGE_KEY_VAULT_SALT]: saltHex,
                                [STORAGE_KEY_VAULT]: initialVaultData,
                            });
                            console.log("Initial vault created with encrypted imported seed.");

                            masterSeedBuffer = await seedFromMnemonic(importedMnemonic);
                            const masterHDKey = getMasterHDKeyFromSeed(masterSeedBuffer);

                            const recoveredIdentities: any[] = [];
                            let consecutiveInactiveCount = 0;
                            let currentIndex = 0;
                            let nextAccountIndexToStore = 0;
                            const controlPlaneBaseUrl = OFFICIAL_VIBE_CLOUD_PROVISIONING_URL;

                            const fetchIdentityStatus = async (didToCheck: string): Promise<{ isActive: boolean }> => {
                                const url = `${controlPlaneBaseUrl}/api/v1/identity/${didToCheck}/status`;
                                try {
                                    console.log(`[Discovery] Checking status for DID: ${didToCheck} at ${url}`);
                                    const response = await fetch(url);
                                    if (response.ok) {
                                        const data = await response.json();
                                        console.log(`[Discovery] Status for ${didToCheck}: ${data.isActive ? "ACTIVE" : "INACTIVE"}`);
                                        return { isActive: data.isActive || false };
                                    }
                                    if (response.status === 404) {
                                        console.log(`[Discovery] Status for ${didToCheck}: NOT FOUND (INACTIVE)`);
                                        return { isActive: false };
                                    }
                                    console.warn(`[Discovery] Status check for ${didToCheck} failed: ${response.status} ${response.statusText}`);
                                    return { isActive: false };
                                } catch (error) {
                                    console.error(`[Discovery] Network error fetching status for ${didToCheck}:`, error);
                                    return { isActive: false };
                                }
                            };

                            const fetchIdentityMetadata = async (
                                didToFetch: string,
                                keyPairForSigning: { derivationPath: string; privateKey: Uint8Array }
                            ): Promise<any> => {
                                console.log(`[Discovery] Fetching metadata for active DID: ${didToFetch}`);
                                const metadataUrl = `${controlPlaneBaseUrl}/api/v1/identity/${didToFetch}`;

                                try {
                                    const nonce = crypto.randomUUID().toString();
                                    const timestamp = new Date().toISOString();
                                    // Payload to sign: DID, nonce, timestamp. Concatenated with a delimiter.
                                    const messageToSign = `${didToFetch}|${nonce}|${timestamp}`;

                                    const signature = await signMessage(keyPairForSigning.privateKey, messageToSign);

                                    console.log(`[Discovery] Attempting to fetch metadata from ${metadataUrl} with signature`);
                                    const response = await fetch(metadataUrl, {
                                        headers: {
                                            // Example custom auth scheme; CP needs to support this
                                            Authorization: `VibeAuth did="${didToFetch}",nonce="${nonce}",timestamp="${timestamp}",signature="${signature}"`,
                                        },
                                    });

                                    if (response.ok) {
                                        const data = await response.json();
                                        console.log(`[Discovery] Metadata received for ${didToFetch}:`, data);
                                        return {
                                            did: data.did || didToFetch, // Ensure DID is present
                                            derivationPath: keyPairForSigning.derivationPath,
                                            profile_name: data.profile_name,
                                            profile_picture: data.profile_picture,
                                            cloudUrl: data.cloudUrl, // Specific Vibe Cloud instance URL for this DID
                                        };
                                    } else {
                                        console.warn(
                                            `[Discovery] Metadata fetch for ${didToFetch} failed: ${response.status} ${
                                                response.statusText
                                            }. Body: ${await response.text().catch(() => "")}`
                                        );
                                        return null;
                                    }
                                } catch (error) {
                                    console.error(`[Discovery] Network or signing error fetching metadata for ${didToFetch}:`, error);
                                    return null;
                                }
                            };

                            console.log("[Discovery] Starting identity discovery process...");
                            while (consecutiveInactiveCount < GAP_LIMIT) {
                                const derivationPath = `m/0'/0'/${currentIndex}'`;
                                const keyPair = deriveChildKeyPair(masterHDKey, currentIndex);
                                const currentDid = didFromEd25519(keyPair.publicKey);

                                const status = await fetchIdentityStatus(currentDid);

                                if (status.isActive) {
                                    const metadata = await fetchIdentityMetadata(currentDid, { ...keyPair, derivationPath });
                                    if (metadata) {
                                        recoveredIdentities.push({
                                            did: metadata.did,
                                            derivationPath: metadata.derivationPath,
                                            profile_name: metadata.profile_name,
                                            profile_picture: metadata.profile_picture,
                                            cloudUrl: metadata.cloudUrl,
                                        });
                                        consecutiveInactiveCount = 0;
                                        nextAccountIndexToStore = currentIndex + 1;
                                    } else {
                                        // If metadata fetch fails for an active DID, still count as inactive for gap
                                        consecutiveInactiveCount++;
                                    }
                                } else {
                                    consecutiveInactiveCount++;
                                }
                                currentIndex++;
                            }
                            console.log(
                                `[Discovery] Completed. Found ${recoveredIdentities.length} active identities. Next account index: ${nextAccountIndexToStore}`
                            );

                            const finalVaultData = {
                                ...initialVaultData,
                                identities: recoveredIdentities,
                                settings: { nextAccountIndex: nextAccountIndexToStore, activeIdentityIndex: 0 }, // Default to first recovered
                            };
                            await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: finalVaultData });

                            if (recoveredIdentities.length > 0) {
                                await chrome.storage.local.set({
                                    [STORAGE_KEY_SETUP_COMPLETE]: true,
                                    currentIdentityDID: recoveredIdentities[0].did,
                                });
                                await chrome.storage.session.set({
                                    [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: importedMnemonic,
                                    [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0,
                                });
                                await loadActiveIdentityFromSessionInternal();
                                responsePayload = {
                                    success: true,
                                    message: `Successfully imported and recovered ${recoveredIdentities.length} identities.`,
                                    recoveredCount: recoveredIdentities.length,
                                    primaryDid: recoveredIdentities[0].did,
                                };
                            } else {
                                await chrome.storage.local.set({ [STORAGE_KEY_SETUP_COMPLETE]: true });
                                responsePayload = { success: true, message: "Seed imported, but no active identities found.", recoveredCount: 0 };
                            }
                            console.log("SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES processed.");
                        } catch (error) {
                            console.error("Error during SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES specific logic:", error);
                            throw error;
                        } finally {
                            if (encryptionKey) encryptionKey = null;
                            if (masterSeedBuffer) wipeMemory(masterSeedBuffer);
                            await chrome.storage.session.remove(SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                        }
                        break;
                    }
                    case "IMPORT_IDENTITY_FROM_SEED": {
                        // This was the post-setup import, may need review/removal
                        console.log("Processing 'IMPORT_IDENTITY_FROM_SEED'");
                        const { mnemonic, password: importPassword } = payload;

                        if (!mnemonic || typeof mnemonic !== "string" || !validateMnemonic(mnemonic)) {
                            throw new Error("Valid mnemonic is required for IMPORT_IDENTITY_FROM_SEED.");
                        }
                        if (!importPassword || typeof importPassword !== "string") {
                            // Made password mandatory here
                            throw new Error("A password is required to encrypt the imported identity in the local vault.");
                        }

                        await clearSessionStateInternal();

                        const salt = generateSalt();
                        const saltHex = Buffer.from(salt).toString("hex");
                        let encryptionKey: CryptoKey | null = null;
                        let seed: Buffer | null = null;

                        try {
                            encryptionKey = await deriveEncryptionKey(importPassword, salt);
                            const encryptedMnemonicData = await encryptData(mnemonic, encryptionKey);
                            seed = await seedFromMnemonic(mnemonic);
                            const masterHDKey = getMasterHDKeyFromSeed(seed);
                            const firstIdentityKeys = deriveChildKeyPair(masterHDKey, 0);
                            const firstDid = didFromEd25519(firstIdentityKeys.publicKey);

                            const newVaultData = {
                                encryptedSeedPhrase: encryptedMnemonicData,
                                identities: [
                                    {
                                        did: firstDid,
                                        derivationPath: firstIdentityKeys.derivationPath,
                                        profile_name: `Imported Identity ${firstDid.substring(0, 8)}...`,
                                        profile_picture: null,
                                        cloudUrl: null, // Default, assuming one-cloud-per-DID needs provisioning
                                    },
                                ],
                                settings: { nextAccountIndex: 1, activeIdentityIndex: 0 },
                            };
                            await chrome.storage.local.set({
                                [STORAGE_KEY_VAULT_SALT]: saltHex,
                                [STORAGE_KEY_VAULT]: newVaultData,
                                [STORAGE_KEY_SETUP_COMPLETE]: true,
                                currentIdentityDID: firstDid,
                            });
                            await chrome.storage.session.set({
                                [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: mnemonic,
                                [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0,
                            });
                            await loadActiveIdentityFromSessionInternal();
                            responsePayload = { success: true, message: "Identity imported successfully and vault updated.", did: firstDid };
                        } finally {
                            if (encryptionKey) encryptionKey = null;
                            if (seed) wipeMemory(seed);
                            await chrome.storage.session.remove(SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
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
                                        {
                                            did: firstDid,
                                            derivationPath: firstIdentityKeys.derivationPath,
                                            profile_name: null,
                                            profile_picture: null,
                                            cloudUrl: null, // Ensure cloudUrl is part of the identity object
                                        },
                                    ],
                                    settings: { nextAccountIndex: 1, activeIdentityIndex: 0 }, // Ensure activeIdentityIndex is set
                                };
                                await chrome.storage.local.set({ [STORAGE_KEY_VAULT_SALT]: saltHex, [STORAGE_KEY_VAULT]: vaultData });
                                console.log("Basic vault structure reconstructed and saved.");
                            } finally {
                                if (encryptionKeyRecon) encryptionKeyRecon = null;
                                if (seedRecon) wipeMemory(seedRecon);
                            }
                        }

                        const userDid = vaultData.identities[0].did;
                        let finalCloudUrl = cloudUrl; // Default to provided cloudUrl

                        // Check if provisioning is needed (Official Vibe Cloud URL and no claim code)
                        if (cloudUrl === OFFICIAL_VIBE_CLOUD_PROVISIONING_URL && !claimCode) {
                            console.log(`Official Vibe Cloud selected. Initiating provisioning for DID: ${userDid}`);
                            let seedForSigning: Buffer | null = null;
                            let privateKeyBytes: Uint8Array | null = null;
                            try {
                                seedForSigning = await seedFromMnemonic(mnemonic);
                                const masterKey = getMasterHDKeyFromSeed(seedForSigning);
                                const keyPair = deriveChildKeyPair(masterKey, vaultData.settings.activeIdentityIndex || 0);
                                privateKeyBytes = keyPair.privateKey;

                                if (!privateKeyBytes) {
                                    throw new Error("Failed to derive private key for signing.");
                                }

                                const nonce = crypto.randomUUID().toString();
                                const timestamp = new Date().toISOString();
                                // Corrected message format for provisioning, matching control plane expectation
                                const messageToSign = `${userDid}|${nonce}|${timestamp}`;
                                const signature = await signMessage(privateKeyBytes, messageToSign);

                                const provisionRequestPayload = { did: userDid, nonce, timestamp, signature };
                                console.log("Sending provisioning request:", provisionRequestPayload);

                                const provisionResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_PROVISIONING_URL}/api/v1/provision/instance`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(provisionRequestPayload),
                                });

                                if (!provisionResponse.ok) {
                                    const errorBody = await provisionResponse.json().catch(() => ({ error: "Failed to parse error response." }));
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

                                // Polling for status
                                let attempts = 0;
                                const maxAttempts = 30; // 5 minutes (30 * 10s)
                                const pollInterval = 10000; // 10 seconds
                                while (attempts < maxAttempts) {
                                    attempts++;
                                    console.log(`Polling status for ${provisionResult.instanceIdentifier}, attempt ${attempts}`);
                                    await new Promise((resolve) => setTimeout(resolve, pollInterval));

                                    const statusResponse = await fetch(
                                        `${OFFICIAL_VIBE_CLOUD_PROVISIONING_URL}/api/v1/provision/status/${provisionResult.instanceIdentifier}`
                                    );
                                    if (!statusResponse.ok) {
                                        console.warn(`Status poll failed: ${statusResponse.status} ${statusResponse.statusText}. Retrying...`);
                                        continue;
                                    }
                                    const statusData = await statusResponse.json();
                                    console.log("Status poll response:", statusData);

                                    if (statusData.status === "completed") {
                                        if (!statusData.instanceUrl) {
                                            throw new Error("Provisioning completed but instance URL is missing.");
                                        }
                                        finalCloudUrl = statusData.instanceUrl; // Update finalCloudUrl with the one from CP
                                        console.log(`Provisioning successful! Instance URL: ${finalCloudUrl}`);
                                        break;
                                    } else if (statusData.status === "failed") {
                                        throw new Error(`Provisioning failed: ${statusData.errorDetails || "Unknown error from control plane."}`);
                                    }
                                }
                                if (attempts >= maxAttempts && finalCloudUrl === cloudUrl) {
                                    // Check if still default
                                    throw new Error("Provisioning timed out after several attempts.");
                                }
                            } finally {
                                if (seedForSigning) wipeMemory(seedForSigning);
                                if (privateKeyBytes) privateKeyBytes.fill(0);
                            }
                        } else if (claimCode) {
                            console.log(`TODO: Implement Vibe Cloud claim with URL: ${cloudUrl} and Code: ${claimCode}`);
                            // Assuming claim code implies the provided cloudUrl is final or will be handled by a different flow.
                            finalCloudUrl = cloudUrl;
                        }
                        // If it's a custom URL without a claim code, finalCloudUrl is already set from payload.cloudUrl

                        // Update vault with identity details and final cloud URL
                        vaultData.identities[0].profile_name = identityName || null;
                        vaultData.identities[0].profile_picture = identityPicture || null;
                        vaultData.identities[0].cloudUrl = finalCloudUrl || null; // Store the final URL

                        // Persist updated vault and mark setup as complete
                        await chrome.storage.local.set({
                            [STORAGE_KEY_VAULT]: vaultData,
                            [STORAGE_KEY_SETUP_COMPLETE]: true,
                            currentIdentityDID: vaultData.identities[0].did, // Store current DID for quick access
                        });

                        // Set session for immediate unlock
                        await chrome.storage.session.set({
                            [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: mnemonic,
                            [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: vaultData.settings.activeIdentityIndex || 0,
                        });
                        await loadActiveIdentityFromSessionInternal(); // Load into global state

                        responsePayload = {
                            success: true,
                            message: "Setup finalized and marked complete." + (finalCloudUrl ? ` Connected to ${finalCloudUrl}.` : ""),
                            identityName: vaultData.identities[0].profile_name,
                            did: vaultData.identities[0].did,
                        };
                        console.log("Setup finalized, vault updated, and setup marked complete.");
                        break;
                    }
                    case "CLOSE_SETUP_TAB": {
                        if (sender.tab && sender.tab.id) {
                            chrome.tabs.remove(sender.tab.id);
                            responsePayload = { success: true, message: "Setup tab closed." };
                        } else {
                            responsePayload = { success: false, message: "No tab ID to close." };
                            responseType = "VIBE_AGENT_RESPONSE_ERROR";
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
        })();
        return true;
    } else if (message && typeof message === "object" && message.type === "MARK_SETUP_COMPLETE") {
        // ... (existing MARK_SETUP_COMPLETE logic) ...
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
        // console.log("[BG_LOG_OTHER] Unhandled message structure or type:", message);
        return false; // Indicate that sendResponse will not be called asynchronously
    }
});

console.log("Vibe Background Service Worker listeners attached.");
