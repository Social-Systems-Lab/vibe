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

// --- Constants ---
const OFFICIAL_VIBE_CLOUD_URL = "https://vibe-cloud-cp.vibeapp.dev"; // Renamed for clarity
const SETUP_URL = chrome.runtime.getURL("setup.html");
const STORAGE_KEY_SETUP_COMPLETE = "isSetupComplete";
const STORAGE_KEY_VAULT = "vibeVault";
const STORAGE_KEY_VAULT_SALT = "vibeVaultSalt";
const SESSION_STORAGE_DECRYPTED_SEED_PHRASE = "decryptedSeedPhrase";
const SESSION_STORAGE_ACTIVE_IDENTITY_INDEX = "activeIdentityIndex";
const STORAGE_KEY_LAST_ACTIVE_DID = "lastActiveDid"; // New constant
// const SESSION_STORAGE_JWT_PREFIX = "vibe_jwt_"; // Old, replaced by specific token keys
const GAP_LIMIT = 20;

// New Token Storage Keys
const SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX = "cp_access_token_";
const SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX = "cp_access_token_expires_at_";
const LOCAL_STORAGE_CP_REFRESH_TOKEN_PREFIX = "cp_refresh_token_";
const LOCAL_STORAGE_CP_REFRESH_TOKEN_EXPIRES_AT_PREFIX = "cp_refresh_token_expires_at_";

// API response type for tokenDetails (align with CP models.ts TokenResponseSchema)
interface TokenDetails {
    accessToken: string;
    accessTokenExpiresIn: number; // Absolute UNIX timestamp (seconds)
    refreshToken: string;
    refreshTokenExpiresAt: number; // Absolute UNIX timestamp (seconds)
    tokenType: "Bearer";
}

// --- Global State ---
let currentActiveDid: string | null = null;
let isUnlocked: boolean = false;

// --- Token Management Utility Functions ---

async function storeCpTokens(did: string, tokenDetails: TokenDetails): Promise<void> {
    const accessTokenKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${did}`;
    const accessTokenExpiresAtKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${did}`;
    const refreshTokenKey = `${LOCAL_STORAGE_CP_REFRESH_TOKEN_PREFIX}${did}`;
    const refreshTokenExpiresAtKey = `${LOCAL_STORAGE_CP_REFRESH_TOKEN_EXPIRES_AT_PREFIX}${did}`;

    await chrome.storage.session.set({
        [accessTokenKey]: tokenDetails.accessToken,
        [accessTokenExpiresAtKey]: tokenDetails.accessTokenExpiresIn,
    });
    await chrome.storage.local.set({
        [refreshTokenKey]: tokenDetails.refreshToken,
        [refreshTokenExpiresAtKey]: tokenDetails.refreshTokenExpiresAt,
    });
    console.info(`Stored CP tokens for DID: ${did}`);
}

async function clearCpTokens(did: string): Promise<void> {
    const accessTokenKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${did}`;
    const accessTokenExpiresAtKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${did}`;
    const refreshTokenKey = `${LOCAL_STORAGE_CP_REFRESH_TOKEN_PREFIX}${did}`;
    const refreshTokenExpiresAtKey = `${LOCAL_STORAGE_CP_REFRESH_TOKEN_EXPIRES_AT_PREFIX}${did}`;

    await chrome.storage.session.remove([accessTokenKey, accessTokenExpiresAtKey]);
    await chrome.storage.local.remove([refreshTokenKey, refreshTokenExpiresAtKey]);
    console.info(`Cleared CP tokens for DID: ${did}`);
}

async function getValidCpAccessToken(did: string): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. Try session access token
    const accessTokenKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${did}`;
    const accessTokenExpiresAtKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${did}`;
    const sessionData = await chrome.storage.session.get([accessTokenKey, accessTokenExpiresAtKey]);
    const sessionAccessToken = sessionData[accessTokenKey];
    const sessionAccessTokenExpiresAt = sessionData[accessTokenExpiresAtKey];

    if (sessionAccessToken && sessionAccessTokenExpiresAt && sessionAccessTokenExpiresAt > nowSeconds) {
        console.debug(`Using valid session CP access token for DID: ${did}`);
        return sessionAccessToken;
    }

    // 2. Try using refresh token from local storage
    const refreshTokenKey = `${LOCAL_STORAGE_CP_REFRESH_TOKEN_PREFIX}${did}`;
    const refreshTokenExpiresAtKey = `${LOCAL_STORAGE_CP_REFRESH_TOKEN_EXPIRES_AT_PREFIX}${did}`;
    const localData = await chrome.storage.local.get([refreshTokenKey, refreshTokenExpiresAtKey]);
    const storedRefreshToken = localData[refreshTokenKey];
    const storedRefreshTokenExpiresAt = localData[refreshTokenExpiresAtKey];

    if (storedRefreshToken && storedRefreshTokenExpiresAt && storedRefreshTokenExpiresAt > nowSeconds) {
        console.info(`Session CP access token missing or expired for ${did}. Attempting refresh...`);
        try {
            const refreshResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: storedRefreshToken }),
            });

            if (!refreshResponse.ok) {
                const errorBody = await refreshResponse.json().catch(() => ({ error: "Refresh failed with status: " + refreshResponse.status }));
                console.warn(`CP token refresh failed for ${did}: ${refreshResponse.status}, ${errorBody.error}`);
                if (refreshResponse.status === 401) {
                    // Unauthorized, refresh token likely invalid/revoked
                    await clearCpTokens(did); // Clear out bad tokens
                    throw new Error(`FULL_LOGIN_REQUIRED: Refresh token invalid for ${did}.`);
                }
                throw new Error(errorBody.error || `Token refresh failed: ${refreshResponse.status}`);
            }

            const newTokenDetails = (await refreshResponse.json()) as TokenDetails;
            await storeCpTokens(did, newTokenDetails);
            console.info(`CP token refreshed successfully for DID: ${did}`);
            return newTokenDetails.accessToken;
        } catch (error: any) {
            console.error(`Error during token refresh for ${did}:`, error);
            if (error.message.startsWith("FULL_LOGIN_REQUIRED")) throw error; // Re-throw specific error
            throw new Error(`Token refresh process failed for ${did}: ${error.message}`);
        }
    }

    // 3. No valid session token, no valid refresh token
    console.warn(`No valid CP session or refresh token for DID: ${did}. Full login required.`);
    throw new Error(`FULL_LOGIN_REQUIRED: No valid tokens for ${did}.`);
}

// --- Core Identity and Session Management ---

async function loadActiveIdentityFromSessionInternal() {
    try {
        const sessionData = await chrome.storage.session.get([SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]);
        const decryptedSeed = sessionData[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
        const activeIndex = sessionData[SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]; // Can be -1

        if (decryptedSeed) {
            // Seed is present, so vault is considered "unlocked" at a basic level
            isUnlocked = true; // Set this based on seed presence
            if (typeof activeIndex === "number" && activeIndex >= 0) {
                // Only proceed if activeIndex is valid
                let seedBuffer: Buffer | null = null;
                try {
                    seedBuffer = await seedFromMnemonic(decryptedSeed);
                    const masterKey = getMasterHDKeyFromSeed(seedBuffer);
                    const identityKeyPair = deriveChildKeyPair(masterKey, activeIndex);
                    currentActiveDid = didFromEd25519(identityKeyPair.publicKey);
                    console.log("Active identity loaded from session:", currentActiveDid);
                    return true; // Successfully loaded an active DID
                } finally {
                    if (seedBuffer) wipeMemory(seedBuffer);
                }
            } else {
                // Seed is present, but no valid active identity index (e.g., -1 or undefined)
                currentActiveDid = null;
                console.log("Vault unlocked (seed in session), but no valid active identity index set.");
                return true; // Still true in the sense that session is partially loaded (unlocked)
            }
        }
    } catch (error) {
        console.error("Error loading active identity from session:", error);
        await clearSessionStateInternal(); // This will also clear access tokens from session
    }
    // If we reach here, it's an error or no seed
    isUnlocked = false;
    currentActiveDid = null; // Ensure currentActiveDid is null if isUnlocked is false
    return false;
}

async function clearSessionStateInternal() {
    currentActiveDid = null; // Keep this
    isUnlocked = false; // Keep this

    // Clear decrypted seed and active index
    const itemsToClearFromSession = [SESSION_STORAGE_DECRYPTED_SEED_PHRASE, SESSION_STORAGE_ACTIVE_IDENTITY_INDEX];

    // Also clear all CP Access Tokens from session storage
    const allSessionItems = await chrome.storage.session.get(null);
    for (const key in allSessionItems) {
        if (key.startsWith(SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX) || key.startsWith(SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX)) {
            itemsToClearFromSession.push(key);
        }
    }
    // Note: Refresh tokens in chrome.storage.local are NOT cleared here. They persist until explicitly cleared by clearCpTokens or logout.
    await chrome.storage.session.remove(itemsToClearFromSession);
    console.log("Session state (seed, active index, all CP access tokens) cleared.");
}

// --- Event Listeners ---
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        console.log("Vibe extension installed.");
        // Set initial side panel state for existing tabs
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.id) {
                try {
                    await chrome.sidePanel.setOptions({
                        tabId: tab.id,
                        path: "sidepanel.html",
                        enabled: true,
                    });
                } catch (error) {
                    console.warn(`Could not set side panel options for tab ${tab.id}:`, error);
                }
            }
        }
    } else if (details.reason === "update") {
        console.log("Vibe extension updated to version:", chrome.runtime.getManifest().version);
        // Also ensure side panel is available on update
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.id) {
                try {
                    await chrome.sidePanel.setOptions({
                        tabId: tab.id,
                        path: "sidepanel.html",
                        enabled: true,
                    });
                } catch (error) {
                    console.warn(`Could not set side panel options for tab ${tab.id} on update:`, error);
                }
            }
        }
    }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error("Failed to set panel behavior:", error));

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (info.status === "complete") {
        try {
            await chrome.sidePanel.setOptions({
                tabId,
                path: "sidepanel.html",
                enabled: true,
            });
        } catch (error) {
            console.warn(`Could not set side panel options for tab ${tabId} on update:`, error);
        }
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
                    case "init":
                        // Attempt to load from session first (checks for decrypted seed)
                        if (!isUnlocked) {
                            await loadActiveIdentityFromSessionInternal();
                        }

                        if (isUnlocked && currentActiveDid) {
                            // Successfully loaded an active identity from session (vault is unlocked)
                            responsePayload = {
                                did: currentActiveDid,
                                permissions: { "profile:read": "always" }, // Example permission
                                message: "Successfully initialized.",
                                code: "INITIALIZED_UNLOCKED",
                            };
                        } else {
                            // Vault is locked, or no active identity could be loaded from session
                            const localData = await chrome.storage.local.get(STORAGE_KEY_LAST_ACTIVE_DID);
                            const lastActiveDid = localData[STORAGE_KEY_LAST_ACTIVE_DID];

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
                                const setupCompleteResult = await chrome.storage.local.get(STORAGE_KEY_SETUP_COMPLETE);
                                const vaultAfterSetupCheck = (await chrome.storage.local.get(STORAGE_KEY_VAULT))[STORAGE_KEY_VAULT];

                                if (!setupCompleteResult[STORAGE_KEY_SETUP_COMPLETE]) {
                                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                                    responsePayload = { error: { message: "Setup not complete.", code: "SETUP_NOT_COMPLETE" } };
                                } else if (
                                    setupCompleteResult[STORAGE_KEY_SETUP_COMPLETE] &&
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
                        const localData = await chrome.storage.local.get([STORAGE_KEY_VAULT, STORAGE_KEY_VAULT_SALT, STORAGE_KEY_LAST_ACTIVE_DID]);
                        const vaultData = localData[STORAGE_KEY_VAULT];
                        const saltHex = localData[STORAGE_KEY_VAULT_SALT];
                        const lastActiveDidFromStorage = localData[STORAGE_KEY_LAST_ACTIVE_DID];

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
                                        await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vaultData });
                                        console.log(`Persisted activeIdentityIndex updated to match lastActiveDid: ${lastActiveDidFromStorage}`);
                                    }
                                } else {
                                    console.warn(
                                        `Last active DID ${lastActiveDidFromStorage} not found in current vault identities. Defaulting to index ${activeIdentityIndexToSet}.`
                                    );
                                }
                            }

                            await chrome.storage.session.set({
                                [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt,
                                [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: activeIdentityIndexToSet,
                            });
                            await loadActiveIdentityFromSessionInternal(); // This sets currentActiveDid and isUnlocked
                            if (!isUnlocked || !currentActiveDid) throw new Error("Failed to load active identity into global state after unlock.");

                            // Persist this successfully unlocked DID as the last active one
                            if (currentActiveDid) {
                                await chrome.storage.local.set({ [STORAGE_KEY_LAST_ACTIVE_DID]: currentActiveDid });
                            }

                            // JWT is no longer proactively checked here. It will be handled by getValidCpAccessToken on demand.
                            console.info(`Vault unlocked for ${currentActiveDid}. API calls will attempt to use/refresh tokens.`);

                            responsePayload = { success: true, did: currentActiveDid, message: "Vault unlocked." };
                        } catch (error) {
                            // This catch belongs to the try block above
                            await clearSessionStateInternal(); // Clear session on any unlock error
                            throw new Error(`Failed to unlock vault. ${error instanceof Error ? error.message : String(error)}`);
                        } finally {
                            // This finally belongs to the try block above
                            // encryptionKey is a CryptoKey object, no explicit wipe method. It will be garbage collected.
                            if (decryptedSeedAttempt) decryptedSeedAttempt = null; // Clear sensitive data from memory
                        }
                        break;
                    }

                    case "LOCK_VAULT":
                        await clearSessionStateInternal(); // This clears seed, active index, and all JWTs
                        responsePayload = { success: true, message: "Vault locked." };
                        break;

                    case "GET_LOCK_STATE":
                        // isUnlocked reflects the state of the seed phrase being in session.
                        // For full functionality (cloud), a JWT for currentActiveDid is also needed.
                        responsePayload = { isUnlocked, did: currentActiveDid };
                        break;

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
                            // const firstIdentityKeys = deriveChildKeyPair(masterHDKey, 0); // No longer creating first identity here
                            // const firstDid = didFromEd25519(firstIdentityKeys.publicKey); // No firstDid at this stage
                            const vaultData = {
                                encryptedSeedPhrase: encryptedMnemonicData,
                                identities: [], // Initialize with an empty identities array
                                settings: { nextAccountIndex: 0, activeIdentityIndex: -1 }, // Adjusted settings
                            };
                            await chrome.storage.local.set({
                                [STORAGE_KEY_VAULT_SALT]: saltHex,
                                [STORAGE_KEY_VAULT]: vaultData,
                                [STORAGE_KEY_SETUP_COMPLETE]: true,
                            });

                            // Pre-unlock the vault for the first identity creation flow
                            await chrome.storage.session.set({
                                [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: mnemonic,
                                [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: -1, // Set to -1 as no identity is active yet
                            });
                            // Set global state
                            currentActiveDid = null; // No active DID yet
                            isUnlocked = true; // Vault is "unlocked" because seed is in session
                            console.log("SETUP_CREATE_VAULT: Vault created, pre-unlocked (seed in session), no identities yet.");

                            responsePayload = { mnemonic }; // Return mnemonic for user to backup
                        } finally {
                            if (seed) wipeMemory(seed);
                            // encryptionKey will be garbage collected
                        }
                        break;
                    }

                    case "SETUP_IMPORT_VAULT": {
                        // Simpler import: new vault from existing mnemonic
                        const { importedMnemonic, password } = payload;
                        if (!importedMnemonic || !password) throw new Error("Mnemonic and password required.");
                        if (!validateMnemonic(importedMnemonic)) throw new Error("Invalid mnemonic provided.");

                        await clearSessionStateInternal(); // Clear previous session
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
                                        profile_name: "Imported Identity", // Placeholder name
                                        profile_picture: null,
                                        cloudUrl: null,
                                    },
                                ],
                                settings: { nextAccountIndex: 1, activeIdentityIndex: 0 },
                            };
                            await chrome.storage.local.set({ [STORAGE_KEY_VAULT_SALT]: saltHex, [STORAGE_KEY_VAULT]: vaultData });
                            // Do not mark setup complete here, user needs to go through finalization for this identity
                            responsePayload = {
                                success: true,
                                did: firstDid,
                                message: "Vault imported with provided seed. Proceed to finalize setup for this identity.",
                            };
                        } finally {
                            if (seed) wipeMemory(seed);
                        }
                        break;
                    }

                    case "GET_ACTIVE_IDENTITY_DETAILS": {
                        console.log("Processing 'GET_ACTIVE_IDENTITY_DETAILS'");
                        if (!isUnlocked || !currentActiveDid) {
                            throw new Error("Vault is locked or no active DID.");
                        }
                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        const vault = vaultResult[STORAGE_KEY_VAULT];
                        if (!vault || !vault.identities) {
                            throw new Error("Vault data not found or identities array is missing.");
                        }
                        const activeIdentityData = vault.identities.find((idObj: any) => idObj.did === currentActiveDid);
                        if (!activeIdentityData) {
                            throw new Error(`Active DID ${currentActiveDid} not found in vault identities.`);
                        }
                        // Return data consistent with local vault structure (snake_case)
                        responsePayload = {
                            did: activeIdentityData.did,
                            profileName: activeIdentityData.profile_name,
                            profilePictureUrl: activeIdentityData.profile_picture,
                            cloudUrl: activeIdentityData.cloudUrl, // This is the instanceUrl
                            instanceStatus: (activeIdentityData as any).instanceStatus, // If stored
                            isAdmin: (activeIdentityData as any).isAdmin, // If stored
                        };
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

                    // --- Refactored Cloud-Interacting Cases Follow ---

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
                                    // We will attempt to log in and get tokens immediately
                                });
                                consecutiveInactiveCount = 0;

                                // Attempt to login and get tokens for this active DID
                                console.log(`Attempting proactive login for recovered active DID: ${currentDid} at index ${currentIndex}`);
                                try {
                                    // Keys are derived using masterHDKey and currentIndex
                                    // const keyPairForLogin = deriveChildKeyPair(masterHDKey, currentIndex); // Already have keyPair from above

                                    const nonce = crypto.randomUUID().toString();
                                    const timestamp = new Date().toISOString();
                                    const messageToSign = `${currentDid}|${nonce}|${timestamp}`;
                                    const signature = await signMessage(keyPair.privateKey, messageToSign);

                                    const loginApiPayload = { did: currentDid, nonce, timestamp, signature };
                                    const loginResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/login`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(loginApiPayload),
                                    });

                                    if (loginResponse.ok) {
                                        const result = await loginResponse.json();
                                        const tokenDetails = result.tokenDetails as TokenDetails;
                                        if (tokenDetails) {
                                            await storeCpTokens(currentDid, tokenDetails);
                                            console.info(`Proactive login successful, tokens stored for DID: ${currentDid}`);
                                        } else {
                                            console.warn(`Proactive login for ${currentDid} succeeded but no tokenDetails received.`);
                                        }
                                    } else {
                                        const errBody = await loginResponse
                                            .json()
                                            .catch(() => ({ error: `Proactive login failed with status ${loginResponse.status}` }));
                                        console.warn(`Proactive login failed for DID ${currentDid}: ${errBody.error || loginResponse.status}`);
                                    }
                                } catch (loginError: any) {
                                    console.error(`Error during proactive login attempt for ${currentDid}:`, loginError.message);
                                }
                                // End of proactive login attempt

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

                                const registerPayload: any = {
                                    // Use 'any' for easier conditional property adding
                                    did: identityDid,
                                    nonce,
                                    timestamp,
                                    signature,
                                };
                                if (identityName) registerPayload.profileName = identityName;
                                if (identityPicture) registerPayload.profilePictureUrl = identityPicture; // Only add if truthy (not null/undefined/empty string)
                                if (claimCode) registerPayload.claimCode = claimCode; // Only add if truthy

                                const registerResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(registerPayload),
                                });

                                if (!registerResponse.ok) {
                                    const errBody = await registerResponse.json().catch(() => ({ error: "Unknown registration error" }));
                                    throw new Error(`Registration failed: ${errBody.error}`);
                                }
                                const result = await registerResponse.json(); // This now returns { identity, tokenDetails }
                                const serverIdentity = result.identity as Identity; // This is IdentitySchema
                                const tokenDetails = result.tokenDetails as TokenDetails;

                                await storeCpTokens(identityDid, tokenDetails); // Store new access and refresh tokens

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

                            let accessTokenToUse: string;
                            try {
                                accessTokenToUse = await getValidCpAccessToken(did);
                            } catch (tokenError: any) {
                                // If token fetch fails (e.g. needs login), this operation cannot proceed.
                                throw new Error(`Authentication required to update profile: ${tokenError.message}`);
                            }

                            const updateUrl = `${OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${did}`;
                            const updateResponse = await fetch(updateUrl, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessTokenToUse}` },
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

                            // The CP's updateIdentity endpoint currently does not return new tokens.
                            // If it did, we would call storeCpTokens here with the full tokenDetails.
                            // For now, if updatedServerIdentity.token (old field) were present, it's an access token only.
                            // This part is less likely to be hit now as CP doesn't return 'token' on this response.
                            if ((updatedServerIdentity as any).token) {
                                console.warn(
                                    "Received a standalone token on profile update, which is deprecated. Full tokenDetails expected for refresh logic."
                                );
                                // Storing it directly to session as a fallback, but this won't have refresh capabilities.
                                const sessionAccessTokenKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${did}`;
                                const sessionAccessTokenExpiresAtKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${did}`;
                                // Assume a short default expiry if only token is provided
                                const defaultExpiry = Math.floor(Date.now() / 1000) + 900; // 15 mins
                                await chrome.storage.session.set({
                                    [sessionAccessTokenKey]: (updatedServerIdentity as any).token,
                                    [sessionAccessTokenExpiresAtKey]: defaultExpiry,
                                });
                                console.log("Stored standalone access token from profile update to session.");
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
                        console.log("Processing 'FETCH_FULL_IDENTITY_DETAILS'");
                        const { did } = payload;
                        if (!did || typeof did !== "string") {
                            throw new Error("DID is required for FETCH_FULL_IDENTITY_DETAILS.");
                        }

                        let accessToken: string;
                        try {
                            accessToken = await getValidCpAccessToken(did);
                        } catch (error: any) {
                            // Propagate specific errors like FULL_LOGIN_REQUIRED
                            if (error.message.startsWith("FULL_LOGIN_REQUIRED")) {
                                responseType = "VIBE_AGENT_RESPONSE_ERROR";
                                responsePayload = { error: { message: error.message, code: "LOGIN_REQUIRED" } };
                                sendResponse({ type: responseType, requestId, error: responsePayload.error });
                                return; // Important to return here
                            }
                            throw error; // Re-throw other errors
                        }

                        const fetchUrl = `${OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${did}`;
                        const fetchResponse = await fetch(fetchUrl, {
                            method: "GET",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${accessToken}`,
                            },
                        });

                        if (!fetchResponse.ok) {
                            const errorBody = await fetchResponse.json().catch(() => ({
                                error: `Failed to fetch identity details for ${did}. Status: ${fetchResponse.status}`,
                            }));
                            // Check for 401 specifically, could mean token expired despite refresh attempt (e.g. clock skew, or refresh failed silently before)
                            if (fetchResponse.status === 401) {
                                await clearCpTokens(did); // Clear potentially bad tokens
                                throw new Error(`FULL_LOGIN_REQUIRED: Access token rejected for ${did}.`);
                            }
                            throw new Error(errorBody.error || `API error: ${fetchResponse.status}`);
                        }

                        const serverIdentity = (await fetchResponse.json()) as Identity;

                        // Update local vault with the fetched details
                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        let vaultData = vaultResult[STORAGE_KEY_VAULT];

                        if (vaultData && vaultData.identities) {
                            const identityIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === did);
                            if (identityIndex !== -1) {
                                const localIdentity = vaultData.identities[identityIndex];
                                localIdentity.profile_name = serverIdentity.profileName || localIdentity.profile_name;
                                localIdentity.profile_picture = serverIdentity.profilePictureUrl || localIdentity.profile_picture; // Keep existing if server sends null/undefined
                                localIdentity.cloudUrl = serverIdentity.instanceUrl || localIdentity.cloudUrl; // instanceUrl from server maps to cloudUrl in vault

                                // Ensure these fields exist before assigning, or cast to any if flexible
                                (localIdentity as any).instanceStatus = serverIdentity.instanceStatus;
                                (localIdentity as any).instanceId = serverIdentity.instanceId;
                                (localIdentity as any).isAdmin = serverIdentity.isAdmin;
                                (localIdentity as any).instanceCreatedAt = serverIdentity.instanceCreatedAt;
                                (localIdentity as any).instanceUpdatedAt = serverIdentity.instanceUpdatedAt;
                                (localIdentity as any).instanceErrorDetails = serverIdentity.instanceErrorDetails;

                                await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vaultData });
                                console.log(`Local vault updated for DID ${did} with new details.`);
                            } else {
                                console.warn(`DID ${did} not found in local vault during FETCH_FULL_IDENTITY_DETAILS. Cannot update.`);
                            }
                        } else {
                            console.warn("Vault data not found. Cannot update identity details.");
                        }

                        responsePayload = { success: true, identity: serverIdentity };
                        break;
                    }

                    case "REQUEST_LOGIN_FLOW": {
                        // This will now attempt a full login
                        const { did, password } = payload; // UI might pass password if vault was locked
                        if (!did) throw new Error("DID is required for login flow.");

                        console.log(`REQUEST_LOGIN_FLOW received for DID: ${did}.`);

                        if (!isUnlocked || currentActiveDid !== did) {
                            // Attempt to unlock if password provided
                            if (password) {
                                console.log("Vault locked or DID not active, attempting unlock with provided password...");
                                // Simplified unlock sequence for login context
                                const localData = await chrome.storage.local.get([STORAGE_KEY_VAULT, STORAGE_KEY_VAULT_SALT]);
                                const vaultData = localData[STORAGE_KEY_VAULT];
                                const saltHex = localData[STORAGE_KEY_VAULT_SALT];
                                if (!vaultData || !saltHex) throw new Error("Vault or salt not found for unlock.");
                                const salt = Buffer.from(saltHex, "hex");
                                const encryptionKey = await deriveEncryptionKey(password, salt);
                                const decryptedSeedAttempt = await decryptData(vaultData.encryptedSeedPhrase, encryptionKey);
                                if (!decryptedSeedAttempt) throw new Error("Decryption failed, invalid password for unlock.");

                                const identityIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === did);
                                if (identityIndex === -1) throw new Error(`DID ${did} not found in vault for unlock.`);

                                await chrome.storage.session.set({
                                    [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt,
                                    [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: identityIndex,
                                });
                                await loadActiveIdentityFromSessionInternal(); // This sets currentActiveDid and isUnlocked
                                if (!isUnlocked || currentActiveDid !== did) {
                                    throw new Error("Failed to unlock or set active identity correctly for login.");
                                }
                                console.log(`Vault unlocked successfully for ${did} during login flow.`);
                            } else {
                                // Vault is locked, and no password provided by UI yet.
                                // Signal UI to request password with a more specific error.
                                console.warn(`REQUEST_LOGIN_FLOW for ${did}: Vault is locked and password not provided. Throwing VAULT_LOCKED_FOR_LOGIN.`);
                                throw { message: "Vault is locked. Password required to perform login.", code: "VAULT_LOCKED_FOR_LOGIN" }; // Throw an object similar to other errors
                            }
                        }

                        // At this point, vault should be unlocked and seed phrase available in session
                        const decryptedSeed = (await chrome.storage.session.get(SESSION_STORAGE_DECRYPTED_SEED_PHRASE))[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                        const activeIdx = (await chrome.storage.session.get(SESSION_STORAGE_ACTIVE_IDENTITY_INDEX))[SESSION_STORAGE_ACTIVE_IDENTITY_INDEX];

                        if (!decryptedSeed || typeof activeIdx !== "number") {
                            throw new Error("Critical: Decrypted seed or active index not found in session despite unlock.");
                        }

                        let seedForSigning: Buffer | null = null;
                        try {
                            seedForSigning = await seedFromMnemonic(decryptedSeed);
                            const masterKey = getMasterHDKeyFromSeed(seedForSigning);
                            const keyPair = deriveChildKeyPair(masterKey, activeIdx);

                            const nonce = crypto.randomUUID().toString();
                            const timestamp = new Date().toISOString();
                            const messageToSign = `${did}|${nonce}|${timestamp}`; // Login signature does not include claimCode
                            const signature = await signMessage(keyPair.privateKey, messageToSign);

                            const loginApiPayload = { did, nonce, timestamp, signature };
                            const loginResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/login`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(loginApiPayload),
                            });

                            if (!loginResponse.ok) {
                                const errorStatus = loginResponse.status;
                                const errBody = await loginResponse
                                    .json()
                                    .catch(() => ({ error: "Unknown login API error", message: `Login failed with status ${errorStatus}` })); // Provide a fallback message
                                const errorMessage = errBody.error || errBody.message; // Prefer .error, fallback to .message
                                console.warn(`Login API call failed for ${did}: Status ${errorStatus} - ${errorMessage}`);
                                throw new Error(`Login API call failed: ${errorMessage}`);
                            }
                            const result = await loginResponse.json(); // Expects { identity, tokenDetails }
                            const tokenDetails = result.tokenDetails as TokenDetails;
                            await storeCpTokens(did, tokenDetails);

                            responsePayload = { success: true, message: "Successfully logged in and tokens refreshed.", identity: result.identity };
                        } finally {
                            if (seedForSigning) wipeMemory(seedForSigning);
                        }
                        break;
                    }

                    case "GET_ALL_IDENTITIES": {
                        console.log("Processing 'GET_ALL_IDENTITIES'");
                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        const vault = vaultResult[STORAGE_KEY_VAULT];
                        if (vault && vault.identities && Array.isArray(vault.identities)) {
                            // Return a mapped version if needed, or direct if structure is fine
                            // For now, returning as stored. Ensure UI can handle snake_case (profile_name)
                            responsePayload = { identities: vault.identities };
                        } else {
                            console.warn("No vault found or identities array missing/invalid during GET_ALL_IDENTITIES.");
                            responsePayload = { identities: [] }; // Return empty array if no identities found
                        }
                        break;
                    }

                    case "SWITCH_ACTIVE_IDENTITY": {
                        console.log("Processing 'SWITCH_ACTIVE_IDENTITY'");
                        const { did: targetDid } = payload;
                        if (!targetDid) throw new Error("Target DID is required for SWITCH_ACTIVE_IDENTITY.");
                        // Removed: if (!isUnlocked) throw new Error("Vault must be unlocked to switch identities.");
                        // Switching the active identity pointer is allowed even if vault is locked.
                        // Operations requiring the private key for the new identity will trigger unlock if needed.

                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        const vault = vaultResult[STORAGE_KEY_VAULT];
                        if (!vault || !vault.identities || !Array.isArray(vault.identities)) {
                            throw new Error("Vault data not found or identities array is missing.");
                        }

                        const targetIdentityIndex = vault.identities.findIndex((idObj: any) => idObj.did === targetDid);
                        if (targetIdentityIndex === -1) {
                            throw new Error(`Target DID ${targetDid} not found in vault.`);
                        }

                        const previousActiveDid = currentActiveDid; // Capture before it's changed by loadActiveIdentityFromSessionInternal

                        // Update active index in session storage
                        await chrome.storage.session.set({ [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: targetIdentityIndex });

                        // Update active index in local storage vault settings as well for persistence
                        vault.settings.activeIdentityIndex = targetIdentityIndex;
                        await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vault });

                        // Reload active identity based on new index, this updates currentActiveDid and isUnlocked
                        await loadActiveIdentityFromSessionInternal();

                        if (currentActiveDid !== targetDid) {
                            // This should not happen if logic is correct, but as a safeguard:
                            console.error(
                                `Failed to switch active identity. Expected ${targetDid}, got ${currentActiveDid}. Attempting to clear session and relock.`
                            );
                            await clearSessionStateInternal(); // Clear potentially inconsistent session
                            throw new Error(`Failed to switch active identity. Expected ${targetDid}, got ${currentActiveDid}.`);
                        }

                        // Persist this newly switched DID as the last active one
                        if (currentActiveDid) {
                            await chrome.storage.local.set({ [STORAGE_KEY_LAST_ACTIVE_DID]: currentActiveDid });
                        }

                        // Clear session tokens for the PREVIOUSLY active DID
                        if (previousActiveDid && previousActiveDid !== targetDid) {
                            const prevAccessTokenKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${previousActiveDid}`;
                            const prevAccessTokenExpiresAtKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${previousActiveDid}`;
                            await chrome.storage.session.remove([prevAccessTokenKey, prevAccessTokenExpiresAtKey]);
                            console.info(`Cleared session CP access tokens for previously active DID: ${previousActiveDid}`);
                        }
                        // Also clear session tokens for the NEWLY active DID to force re-evaluation/login if needed
                        const newAccessTokenKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${targetDid}`;
                        const newAccessTokenExpiresAtKey = `${SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${targetDid}`;
                        await chrome.storage.session.remove([newAccessTokenKey, newAccessTokenExpiresAtKey]);
                        console.info(`Cleared session CP access tokens for newly active DID: ${targetDid} to ensure fresh state.`);

                        responsePayload = { success: true, newActiveDid: currentActiveDid, message: `Switched active identity to ${currentActiveDid}.` };
                        break;
                    }

                    case "CREATE_NEW_IDENTITY_FROM_SEED": {
                        console.log("Processing 'CREATE_NEW_IDENTITY_FROM_SEED'");
                        if (!isUnlocked) {
                            throw new Error("Vault must be unlocked to create a new identity.");
                        }

                        const sessionData = await chrome.storage.session.get(SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                        const decryptedSeed = sessionData[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                        if (!decryptedSeed) {
                            // This case should ideally be caught by isUnlocked check, but good to be defensive
                            throw new Error("Decrypted seed phrase not found in session. Vault may be locked or session cleared.");
                        }

                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        const vault = vaultResult[STORAGE_KEY_VAULT];
                        if (!vault || !vault.settings || typeof vault.settings.nextAccountIndex !== "number") {
                            throw new Error("Vault data or settings (nextAccountIndex) not found or invalid.");
                        }

                        const newAccountIndex = vault.settings.nextAccountIndex;
                        let seedBuffer: Buffer | null = null;
                        let newIdentityDid = "";
                        let newIdentityDerivationPath = "";

                        try {
                            seedBuffer = await seedFromMnemonic(decryptedSeed);
                            const masterHDKey = getMasterHDKeyFromSeed(seedBuffer);
                            const newKeyPair = deriveChildKeyPair(masterHDKey, newAccountIndex);
                            newIdentityDid = didFromEd25519(newKeyPair.publicKey);
                            newIdentityDerivationPath = newKeyPair.derivationPath;

                            const newIdentityEntry = {
                                did: newIdentityDid,
                                derivationPath: newIdentityDerivationPath,
                                profile_name: `Identity ${newAccountIndex + 1}`, // Default name
                                profile_picture: null,
                                cloudUrl: null, // Not registered yet
                                // Other fields like instanceStatus, etc., will be populated after registration
                            };

                            vault.identities.push(newIdentityEntry);
                            vault.settings.nextAccountIndex = newAccountIndex + 1;

                            await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vault });

                            console.log(
                                `New identity created: ${newIdentityDid} at index ${newAccountIndex}. Next account index is now ${vault.settings.nextAccountIndex}.`
                            );
                            responsePayload = {
                                success: true,
                                message: "New identity created successfully.",
                                newIdentity: newIdentityEntry, // Send back the newly created identity object
                            };
                        } finally {
                            if (seedBuffer) wipeMemory(seedBuffer);
                        }
                        break;
                    }

                    case "GET_NEXT_ACCOUNT_INDEX": {
                        console.log("Processing 'GET_NEXT_ACCOUNT_INDEX'");
                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        const vault = vaultResult[STORAGE_KEY_VAULT];
                        if (!vault || !vault.settings || typeof vault.settings.nextAccountIndex !== "number") {
                            throw new Error("Vault data or settings (nextAccountIndex) not found or invalid.");
                        }
                        responsePayload = { accountIndex: vault.settings.nextAccountIndex };
                        break;
                    }

                    case "SETUP_NEW_IDENTITY_AND_FINALIZE": {
                        console.log("Processing 'SETUP_NEW_IDENTITY_AND_FINALIZE'");
                        const { accountIndexToUse, identityName, identityPicture, cloudUrl, claimCode, password } = payload;

                        // Password is required only if the vault is currently locked.
                        // isUnlocked is a global flag reflecting if seed is in session.
                        if (typeof accountIndexToUse !== "number" || (!isUnlocked && !password)) {
                            throw new Error("Account index is required. Password is required if vault is locked.");
                        }

                        // 1. Ensure vault is unlocked (or unlock it if password was provided because it was locked)
                        if (!isUnlocked && password) {
                            // Only attempt unlock if it was locked AND password was provided
                            console.log("Vault locked, attempting unlock with provided password for SETUP_NEW_IDENTITY_AND_FINALIZE...");
                            const localDataForUnlock = await chrome.storage.local.get([STORAGE_KEY_VAULT, STORAGE_KEY_VAULT_SALT]);
                            const vaultDataForUnlock = localDataForUnlock[STORAGE_KEY_VAULT];
                            const saltHexForUnlock = localDataForUnlock[STORAGE_KEY_VAULT_SALT];
                            if (!vaultDataForUnlock || !saltHexForUnlock) throw new Error("Vault or salt not found for unlock.");
                            const saltForUnlock = Buffer.from(saltHexForUnlock, "hex");
                            const encryptionKeyForUnlock = await deriveEncryptionKey(password, saltForUnlock);
                            const decryptedSeedAttempt = await decryptData(vaultDataForUnlock.encryptedSeedPhrase, encryptionKeyForUnlock);
                            if (!decryptedSeedAttempt) throw new Error("Decryption failed, invalid password for unlock.");
                            await chrome.storage.session.set({ [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt });
                            // Update global isUnlocked state after successful temporary unlock
                            isUnlocked = true;
                            console.log("Vault temporarily unlocked for new identity creation. Global isUnlocked set to true.");
                        }
                        // If isUnlocked was already true, or became true above, we can proceed.
                        // If it was locked and no password provided, the initial check would have thrown.

                        const sessionDataForSeed = await chrome.storage.session.get(SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                        const decryptedSeed = sessionDataForSeed[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                        if (!decryptedSeed) {
                            throw new Error("Vault is locked or seed phrase not available in session. Unlock is required.");
                        }

                        // 2. Create the new identity locally
                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        let vaultData = vaultResult[STORAGE_KEY_VAULT];
                        if (!vaultData || !vaultData.settings || typeof vaultData.settings.nextAccountIndex !== "number") {
                            throw new Error("Vault data or settings (nextAccountIndex) not found or invalid.");
                        }
                        // Ensure the provided accountIndexToUse matches the expected nextAccountIndex
                        if (accountIndexToUse !== vaultData.settings.nextAccountIndex) {
                            console.warn(
                                `Provided accountIndexToUse (${accountIndexToUse}) does not match vault's nextAccountIndex (${vaultData.settings.nextAccountIndex}). Using vault's value.`
                            );
                            // Potentially throw an error or use vault.settings.nextAccountIndex
                            // For now, let's be strict, this implies a mismatch in frontend logic or stale data.
                            // throw new Error(`Account index mismatch. Expected ${vaultData.settings.nextAccountIndex}, got ${accountIndexToUse}.`);
                        }
                        const newAccountIndex = vaultData.settings.nextAccountIndex; // Use the one from vault to be safe

                        let seedBuffer: Buffer | null = null;
                        let newIdentityDid = "";
                        let newIdentityDerivationPath = "";

                        try {
                            seedBuffer = await seedFromMnemonic(decryptedSeed);
                            const masterHDKey = getMasterHDKeyFromSeed(seedBuffer);
                            const newKeyPair = deriveChildKeyPair(masterHDKey, newAccountIndex);
                            newIdentityDid = didFromEd25519(newKeyPair.publicKey);
                            newIdentityDerivationPath = newKeyPair.derivationPath;

                            const newIdentityEntry = {
                                did: newIdentityDid,
                                derivationPath: newIdentityDerivationPath,
                                profile_name: identityName || `Identity ${newAccountIndex + 1}`, // Use provided name or default
                                profile_picture: identityPicture || null,
                                cloudUrl: null, // Will be set after registration
                            };

                            vaultData.identities.push(newIdentityEntry);
                            vaultData.settings.nextAccountIndex = newAccountIndex + 1;
                            // Do not set activeIdentityIndex yet, will do after successful cloud registration

                            // 3. Register with cloud (if applicable) and update local entry
                            let finalCloudUrl: string | undefined = undefined;
                            if (cloudUrl === OFFICIAL_VIBE_CLOUD_URL) {
                                console.log(`Official Vibe Cloud: Registering new DID: ${newIdentityDid}`);
                                const nonce = crypto.randomUUID().toString();
                                const timestamp = new Date().toISOString();
                                const messageToSign = `${newIdentityDid}|${nonce}|${timestamp}|${claimCode || ""}`;
                                const signature = await signMessage(newKeyPair.privateKey, messageToSign);

                                const registerPayload: any = { did: newIdentityDid, nonce, timestamp, signature };
                                if (identityName) registerPayload.profileName = identityName;
                                if (identityPicture) registerPayload.profilePictureUrl = identityPicture;
                                if (claimCode) registerPayload.claimCode = claimCode;

                                const registerResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(registerPayload),
                                });

                                if (!registerResponse.ok) {
                                    const errBody = await registerResponse.json().catch(() => ({ error: "Unknown registration error" }));
                                    throw new Error(`Registration for ${newIdentityDid} failed: ${errBody.error}`);
                                }
                                const result = await registerResponse.json();
                                const serverIdentity = result.identity as Identity; // Assuming Identity type is defined
                                const tokenDetails = result.tokenDetails as TokenDetails; // Assuming TokenDetails type

                                await storeCpTokens(newIdentityDid, tokenDetails);

                                // Update the newIdentityEntry with server data before saving to vault
                                newIdentityEntry.profile_name = serverIdentity.profileName || newIdentityEntry.profile_name;
                                newIdentityEntry.profile_picture = serverIdentity.profilePictureUrl || newIdentityEntry.profile_picture;
                                newIdentityEntry.cloudUrl = serverIdentity.instanceUrl;
                                (newIdentityEntry as any).instanceId = serverIdentity.instanceId;
                                (newIdentityEntry as any).instanceStatus = serverIdentity.instanceStatus;
                                (newIdentityEntry as any).isAdmin = serverIdentity.isAdmin;
                                finalCloudUrl = serverIdentity.instanceUrl;
                            } else if (cloudUrl) {
                                console.warn(`Custom cloud URL ${cloudUrl} for ${newIdentityDid}. No automatic registration.`);
                                newIdentityEntry.cloudUrl = cloudUrl;
                            }

                            // 4. Set new identity as active
                            const newIdentityEntryIndexInVault = vaultData.identities.length - 1; // It's the last one pushed
                            vaultData.settings.activeIdentityIndex = newIdentityEntryIndexInVault;
                            await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vaultData });

                            // Update session storage for active identity
                            await chrome.storage.session.set({ [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: newIdentityEntryIndexInVault });
                            // The decryptedSeed should still be in session from the unlock check
                            await loadActiveIdentityFromSessionInternal(); // This will set currentActiveDid to the new one and isUnlocked to true

                            if (currentActiveDid) {
                                await chrome.storage.local.set({ [STORAGE_KEY_LAST_ACTIVE_DID]: currentActiveDid });
                            }

                            // Mark setup as complete now that the first identity is successfully created and finalized
                            await chrome.storage.local.set({ [STORAGE_KEY_SETUP_COMPLETE]: true });
                            console.log("SETUP_NEW_IDENTITY_AND_FINALIZE: Setup marked as complete.");

                            responsePayload = {
                                success: true,
                                message: `New identity ${newIdentityDid} created, finalized, and set as active.`,
                                did: newIdentityDid,
                                identityName: newIdentityEntry.profile_name,
                            };
                        } finally {
                            if (seedBuffer) wipeMemory(seedBuffer);
                            // If vault was temporarily unlocked for this operation (i.e., password was provided in payload
                            // AND the global isUnlocked was initially false), we might consider re-locking.
                            // However, the current flow sets the new identity as active, which implies the vault
                            // should remain unlocked with this new active identity.
                            // The `isUnlocked = true` after a successful temporary unlock handles this.
                            // No explicit re-locking here seems correct if the user is now active with the new identity.
                        }
                        break;
                    }

                    case "FINALIZE_NEW_IDENTITY_SETUP": {
                        // This case might become deprecated or less used if SETUP_NEW_IDENTITY_AND_FINALIZE is preferred.
                        // For now, keeping it as it might be used by the initial full setup.
                        console.log("Processing 'FINALIZE_NEW_IDENTITY_SETUP'");
                        const { didToFinalize, accountIndex, identityName, identityPicture, cloudUrl, claimCode, password } = payload;

                        if (!didToFinalize || typeof accountIndex !== "number" || !password) {
                            throw new Error("DID, accountIndex, and password are required for finalizing new identity setup.");
                        }
                        if (!isUnlocked) {
                            // Ensure vault is unlocked to get the seed for signing
                            // Attempt to unlock if password provided, similar to UNLOCK_VAULT but more direct
                            console.log("Vault locked, attempting unlock with provided password for FINALIZE_NEW_IDENTITY_SETUP...");
                            const localData = await chrome.storage.local.get([STORAGE_KEY_VAULT, STORAGE_KEY_VAULT_SALT]);
                            const vaultDataForUnlock = localData[STORAGE_KEY_VAULT];
                            const saltHex = localData[STORAGE_KEY_VAULT_SALT];
                            if (!vaultDataForUnlock || !saltHex) throw new Error("Vault or salt not found for unlock during finalization.");
                            const salt = Buffer.from(saltHex, "hex");
                            const encryptionKey = await deriveEncryptionKey(password, salt);
                            const decryptedSeedAttempt = await decryptData(vaultDataForUnlock.encryptedSeedPhrase, encryptionKey);
                            if (!decryptedSeedAttempt) throw new Error("Decryption failed, invalid password for unlock during finalization.");
                            // Temporarily store in session to allow key derivation
                            await chrome.storage.session.set({ [SESSION_STORAGE_DECRYPTED_SEED_PHRASE]: decryptedSeedAttempt });
                            // No need to call loadActiveIdentityFromSessionInternal() here as we are not changing the *global* active identity yet.
                            console.log("Vault temporarily unlocked for signing during finalization.");
                        }

                        const sessionData = await chrome.storage.session.get(SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                        const decryptedSeed = sessionData[SESSION_STORAGE_DECRYPTED_SEED_PHRASE];
                        if (!decryptedSeed) {
                            throw new Error("Vault is locked or seed phrase not available in session. Unlock is required to finalize identity.");
                        }

                        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
                        let vaultData = vaultResult[STORAGE_KEY_VAULT];
                        if (!vaultData || !vaultData.identities) {
                            throw new Error("Vault data not found or identities array is missing.");
                        }

                        const identityEntryIndex = vaultData.identities.findIndex((idObj: any) => idObj.did === didToFinalize);
                        if (identityEntryIndex === -1) {
                            throw new Error(`Identity with DID ${didToFinalize} not found in vault for finalization.`);
                        }

                        let finalCloudUrl: string | undefined = undefined;

                        if (cloudUrl === OFFICIAL_VIBE_CLOUD_URL) {
                            console.log(`Official Vibe Cloud: Registering new DID: ${didToFinalize}`);
                            let seedForSigning: Buffer | null = null;
                            try {
                                seedForSigning = await seedFromMnemonic(decryptedSeed);
                                const masterKey = getMasterHDKeyFromSeed(seedForSigning);
                                // Use the specific accountIndex passed in payload for the new identity
                                const keyPair = deriveChildKeyPair(masterKey, accountIndex);

                                if (didFromEd25519(keyPair.publicKey) !== didToFinalize) {
                                    throw new Error("Derived DID does not match didToFinalize. Account index might be incorrect.");
                                }

                                const nonce = crypto.randomUUID().toString();
                                const timestamp = new Date().toISOString();
                                const messageToSign = `${didToFinalize}|${nonce}|${timestamp}|${claimCode || ""}`;
                                const signature = await signMessage(keyPair.privateKey, messageToSign);

                                const registerPayload: any = { did: didToFinalize, nonce, timestamp, signature };
                                if (identityName) registerPayload.profileName = identityName;
                                if (identityPicture) registerPayload.profilePictureUrl = identityPicture;
                                if (claimCode) registerPayload.claimCode = claimCode;

                                const registerResponse = await fetch(`${OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(registerPayload),
                                });

                                if (!registerResponse.ok) {
                                    const errBody = await registerResponse.json().catch(() => ({ error: "Unknown registration error" }));
                                    throw new Error(`Registration for ${didToFinalize} failed: ${errBody.error}`);
                                }
                                const result = await registerResponse.json();
                                const serverIdentity = result.identity as Identity;
                                const tokenDetails = result.tokenDetails as TokenDetails;

                                await storeCpTokens(didToFinalize, tokenDetails);

                                vaultData.identities[identityEntryIndex].profile_name = serverIdentity.profileName;
                                vaultData.identities[identityEntryIndex].profile_picture = serverIdentity.profilePictureUrl;
                                vaultData.identities[identityEntryIndex].cloudUrl = serverIdentity.instanceUrl;
                                (vaultData.identities[identityEntryIndex] as any).instanceId = serverIdentity.instanceId;
                                (vaultData.identities[identityEntryIndex] as any).instanceStatus = serverIdentity.instanceStatus;
                                (vaultData.identities[identityEntryIndex] as any).isAdmin = serverIdentity.isAdmin;
                                finalCloudUrl = serverIdentity.instanceUrl;
                            } finally {
                                if (seedForSigning) wipeMemory(seedForSigning);
                            }
                        } else if (cloudUrl) {
                            console.warn(`Custom cloud URL ${cloudUrl} for ${didToFinalize}. No automatic registration.`);
                            vaultData.identities[identityEntryIndex].profile_name = identityName;
                            vaultData.identities[identityEntryIndex].profile_picture = identityPicture;
                            vaultData.identities[identityEntryIndex].cloudUrl = cloudUrl;
                        } else {
                            // No cloud URL provided, just update local name/pic
                            vaultData.identities[identityEntryIndex].profile_name = identityName;
                            vaultData.identities[identityEntryIndex].profile_picture = identityPicture;
                        }

                        // Set this newly finalized identity as active
                        vaultData.settings.activeIdentityIndex = identityEntryIndex;
                        await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vaultData });

                        // Update session storage for active identity
                        // The decryptedSeed should still be in session from the unlock check or initial unlock
                        await chrome.storage.session.set({ [SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: identityEntryIndex });
                        await loadActiveIdentityFromSessionInternal(); // This will set currentActiveDid to the new one

                        // Persist this newly finalized and active DID as the last active one
                        if (currentActiveDid) {
                            await chrome.storage.local.set({ [STORAGE_KEY_LAST_ACTIVE_DID]: currentActiveDid });
                        }

                        // Clear the temporary seed from session if it was only put there for this operation and the vault was originally locked
                        // However, if the vault was already unlocked, leave the seed. This logic is tricky.
                        // For simplicity, if password was provided in payload, assume it was locked and clear.
                        if (payload.password) {
                            await chrome.storage.session.remove(SESSION_STORAGE_DECRYPTED_SEED_PHRASE);
                            isUnlocked = false; // Reflect that the temporary unlock is over
                            console.log("Temporary unlock for finalization reverted.");
                        }

                        responsePayload = {
                            success: true,
                            message: `Identity ${didToFinalize} finalized and set as active.`,
                            did: didToFinalize,
                            identityName: vaultData.identities[identityEntryIndex].profile_name,
                            newActiveDid: currentActiveDid, // Reflects the switch
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
