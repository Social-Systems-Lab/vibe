// --- Constants ---
export const OFFICIAL_VIBE_CLOUD_URL = "https://vibe-cloud-cp.vibeapp.dev"; // Renamed for clarity
export const SETUP_URL = chrome.runtime.getURL("setup.html");
export const STORAGE_KEY_SETUP_COMPLETE = "isSetupComplete";
export const STORAGE_KEY_VAULT = "vibeVault";
export const STORAGE_KEY_VAULT_SALT = "vibeVaultSalt";
export const SESSION_STORAGE_DECRYPTED_SEED_PHRASE = "decryptedSeedPhrase";
export const SESSION_STORAGE_ACTIVE_IDENTITY_INDEX = "activeIdentityIndex";
export const STORAGE_KEY_LAST_ACTIVE_DID = "lastActiveDid"; // New constant
export const GAP_LIMIT = 20;

// New Token Storage Keys
export const SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX = "cp_access_token_";
export const SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX = "cp_access_token_expires_at_";
export const LOCAL_STORAGE_CP_REFRESH_TOKEN_PREFIX = "cp_refresh_token_";
export const LOCAL_STORAGE_CP_REFRESH_TOKEN_EXPIRES_AT_PREFIX = "cp_refresh_token_expires_at_";
