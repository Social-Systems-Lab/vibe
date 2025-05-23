import PouchDB from "pouchdb-browser";
import PouchDBFind from "pouchdb-find";
import { Buffer } from "buffer";
import type { EncryptedData } from "./crypto"; // Assuming EncryptedData is exported
import { generateSalt, deriveEncryptionKey, encryptData, decryptData } from "./crypto";

import { getIdentityInstanceUrl } from "./utils"; // Actual import
import { getValidCpAccessToken } from "../background-modules/token-manager"; // Actual import
import { isUnlocked as isVaultUnlocked } from "../background-modules/session-manager"; // Actual import
// Note: getVaultPassword is not directly importable. It must be passed if available.

PouchDB.plugin(PouchDBFind); // Initialize pouchdb-find plugin

const COUCHDB_CONFIG_STORAGE_KEY = "couchDbConfig";

// In-memory cache for CouchDB configurations, keyed by userDid
const couchDbConfigCache = new Map<string, CouchDbConfig>();
// Map to store PouchDB instances, keyed by userDid
const localDbInstances = new Map<string, PouchDB.Database>();
// Map to store remote PouchDB instances for sync, keyed by userDid
const remoteDbInstances = new Map<string, PouchDB.Database>();
// Map to store sync handlers, keyed by userDid
const syncHandlers = new Map<string, PouchDB.Replication.Sync<{}>>();

export interface CouchDbConfig {
    userDid: string;
    url: string; // CouchDB URL
    username: string;
    encryptedPassword?: EncryptedData; // Encrypted CouchDB password
    passwordSalt?: string; // Salt used for encrypting the password (hex)
}

export function getLocalDbName(userDid: string): string {
    // Added export
    const sanitizedDid = userDid.replace(/:/g, "_").replace(/\./g, "-");
    return `user_data_${sanitizedDid}`;
}

/**
 * Retrieves CouchDB configuration from cache or chrome.storage.local.
 * Does not perform API calls or decryption.
 */
async function getCouchDbConfigFromStorage(userDid: string): Promise<CouchDbConfig | null> {
    if (couchDbConfigCache.has(userDid)) {
        return couchDbConfigCache.get(userDid)!;
    }

    const storageKey = `${COUCHDB_CONFIG_STORAGE_KEY}_${userDid}`;
    try {
        const result = await chrome.storage.local.get(storageKey);
        const storedConfig = result[storageKey] as CouchDbConfig | undefined;

        if (storedConfig) {
            console.log(`Loaded CouchDB config for ${userDid} from chrome.storage.local (encrypted)`);
            couchDbConfigCache.set(userDid, storedConfig);
            return storedConfig;
        }
        return null;
    } catch (error) {
        console.error(`Error retrieving CouchDB config for ${userDid} from storage:`, error);
        return null;
    }
}

console.info(`PouchDB service initialized for multi-identity support.`);

/**
 * Initializes PouchDB synchronization for a given user.
 * It will attempt to load stored credentials, decrypt if vault is unlocked,
 * or fetch live credentials from the Vibe Cloud API.
 * If live credentials are fetched and vault is unlocked, they will be encrypted and stored.
 * @param userDid The DID of the user for whom to initialize sync.
 * @param mainVaultPasswordIfAvailable The user's main vault password, if available (e.g., after unlock).
 *                                     Required for encrypting new credentials or decrypting stored ones.
 */
export async function initializeSync(userDid: string, mainVaultPasswordIfAvailable?: string): Promise<void> {
    if (!userDid) {
        console.error("initializeSync called without userDid.");
        return;
    }

    if (syncHandlers.has(userDid)) {
        console.log(`PouchDB sync for ${userDid} already initialized or in progress.`);
        return;
    }

    let couchDbUrl: string | null = null;
    let couchDbUsername: string | null = null;
    let couchDbPasswordPlaintext: string | null = null; // Plaintext password for current session

    const storedConfig = await getCouchDbConfigFromStorage(userDid);
    const vaultUnlocked = isVaultUnlocked; // Accessing the boolean variable directly

    // Use the provided password if available and vault is unlocked
    const mainVaultPasswordForCrypto: string | null = vaultUnlocked && mainVaultPasswordIfAvailable ? mainVaultPasswordIfAvailable : null;

    if (storedConfig?.encryptedPassword && storedConfig.passwordSalt) {
        if (mainVaultPasswordForCrypto) {
            // Check if we have the password to attempt decryption
            try {
                const saltBuffer = Buffer.from(storedConfig.passwordSalt, "hex");
                const key = await deriveEncryptionKey(
                    mainVaultPasswordForCrypto, // Known to be string here
                    new Uint8Array(saltBuffer.buffer, saltBuffer.byteOffset, saltBuffer.byteLength)
                );
                couchDbPasswordPlaintext = await decryptData(storedConfig.encryptedPassword, key);
                couchDbUrl = storedConfig.url;
                couchDbUsername = storedConfig.username;
                console.log(`Successfully decrypted stored CouchDB password for ${userDid}.`);
            } catch (decryptionError) {
                console.error(`Failed to decrypt stored CouchDB password for ${userDid}:`, decryptionError, "Will attempt to fetch live credentials.");
                // Clear potentially corrupted stored config? Or mark as needing re-encryption?
                // For now, just proceed to fetch live.
            }
        } else {
            console.log(`Vault is locked for ${userDid}. Stored CouchDB password cannot be decrypted. Attempting to fetch live credentials.`);
        }
    }

    // If credentials were not successfully decrypted from storage, try to fetch them live.
    if (!couchDbPasswordPlaintext) {
        console.log(`Attempting to fetch live CouchDB credentials for ${userDid}.`);
        const instanceUrl = await getIdentityInstanceUrl(userDid); // Using actual import
        if (!instanceUrl) {
            console.error(`Cannot fetch CouchDB credentials for ${userDid}: Vibe Cloud API instance URL not found.`);
            return;
        }

        try {
            // getValidCpAccessToken might throw if full login is required, so wrap in try-catch
            const accessToken = await getValidCpAccessToken(userDid); // Using actual import. Assumes it's valid for instanceUrl or instanceUrl is OFFICIAL_VIBE_CLOUD_URL.
            if (!accessToken) {
                // Should not happen if getValidCpAccessToken throws on failure
                console.error(`Cannot fetch CouchDB credentials for ${userDid}: Failed to get access token for ${instanceUrl}.`);
                return;
            }

            const response = await fetch(`${instanceUrl}/api/v1/instance/couchdb-details`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`Failed to fetch CouchDB details for ${userDid} from ${instanceUrl}. Status: ${response.status}. Body: ${errorBody}`);
                return;
            }

            const fetchedCloudApiConfig = await response.json();
            // Assuming API returns { url: string, username: string, password: string } for CouchDB
            if (!fetchedCloudApiConfig.url || !fetchedCloudApiConfig.username || !fetchedCloudApiConfig.password) {
                console.error(`Fetched CouchDB config for ${userDid} is incomplete:`, fetchedCloudApiConfig);
                return;
            }

            couchDbUrl = fetchedCloudApiConfig.url;
            couchDbUsername = fetchedCloudApiConfig.username;
            couchDbPasswordPlaintext = fetchedCloudApiConfig.password; // Use live password for this session
            console.log(`Successfully fetched live CouchDB credentials for ${userDid}.`);

            // If vault is unlocked, encrypt and store these newly fetched credentials
            if (vaultUnlocked && mainVaultPasswordForCrypto && couchDbPasswordPlaintext) {
                // mainVaultPasswordForCrypto is confirmed not null by the if condition
                // couchDbPasswordPlaintext is also confirmed not null
                try {
                    const newSaltBytes = generateSalt(); // generateSalt returns Uint8Array
                    const saltHex = Buffer.from(newSaltBytes).toString("hex");

                    // Explicit non-null assertions for TypeScript, guarded by the outer if condition
                    if (!mainVaultPasswordForCrypto) {
                        throw new Error("Assertion failed: mainVaultPasswordForCrypto should be non-null here.");
                    }
                    if (!couchDbPasswordPlaintext) {
                        throw new Error("Assertion failed: couchDbPasswordPlaintext should be non-null here.");
                    }
                    // Assign to new consts to help TypeScript's control flow analysis
                    const finalMainVaultPassword = mainVaultPasswordForCrypto;
                    const finalPlaintextPassword = couchDbPasswordPlaintext;

                    const key = await deriveEncryptionKey(finalMainVaultPassword!, newSaltBytes); // Added non-null assertion
                    const encryptedData = await encryptData(finalPlaintextPassword!, key); // Kept non-null assertion

                    // Call a modified setRemoteCouchDbCredentials that doesn't re-trigger initializeSync
                    if (!couchDbUrl || !couchDbUsername) {
                        // Add checks for these as well before calling internalSetRemote...
                        throw new Error("couchDbUrl or couchDbUsername became null unexpectedly before storing credentials.");
                    }
                    await internalSetRemoteCouchDbCredentials(userDid, couchDbUrl, couchDbUsername, encryptedData, saltHex, false);
                    console.log(`Encrypted and stored fetched CouchDB credentials for ${userDid}.`);
                } catch (encryptionError) {
                    console.error(`Failed to encrypt and store fetched CouchDB credentials for ${userDid}:`, encryptionError);
                    // Continue with plaintext password for this session anyway
                }
            } else {
                console.log(
                    `Vault is locked for ${userDid}. Fetched CouchDB credentials will be used in-memory for this session only and not stored encrypted.`
                );
            }
        } catch (fetchError) {
            console.error(`Error fetching CouchDB credentials for ${userDid}:`, fetchError);
            return;
        }
    }

    if (!couchDbUrl || !couchDbUsername || couchDbPasswordPlaintext === null) {
        // Check explicitly for null if password can be empty string
        console.error(`Failed to obtain CouchDB credentials for ${userDid}. Cannot initialize sync.`);
        return;
    }

    const localDb = getLocalUserDataDb(userDid);
    if (!localDb) {
        console.error(`Failed to get local PouchDB instance for ${userDid}. Cannot initialize sync.`);
        return;
    }

    console.log(`Initializing PouchDB sync for ${userDid} with remote: ${couchDbUrl}`);
    const remoteDbOpts: PouchDB.Configuration.RemoteDatabaseConfiguration = {
        auth: {
            username: couchDbUsername,
            password: couchDbPasswordPlaintext,
        },
        skip_setup: true,
    };
    // Add fetch options for timeout if needed, e.g. remoteDbOpts.fetch = (url, opts) => { opts.timeout = 10000; return PouchDB.fetch(url, opts); };

    const remoteDb = new PouchDB(couchDbUrl, remoteDbOpts);
    remoteDbInstances.set(userDid, remoteDb);

    const currentSyncHandler = localDb.sync(remoteDb, {
        live: true,
        retry: true,
    });
    syncHandlers.set(userDid, currentSyncHandler);

    currentSyncHandler
        .on("change", (info) => {
            console.log(`PouchDB sync [${userDid}]: Data changed`, info);
        })
        .on("paused", (err) => {
            console.warn(`PouchDB sync [${userDid}]: Paused`, err || "(idle)");
        })
        .on("active", () => {
            console.log(`PouchDB sync [${userDid}]: Active`);
        })
        .on("denied", (err) => {
            console.error(`PouchDB sync [${userDid}]: Denied`, err);
            syncHandlers.get(userDid)?.cancel();
            syncHandlers.delete(userDid);
            remoteDbInstances.delete(userDid);
        })
        .on("complete", (info) => {
            console.log(`PouchDB sync [${userDid}]: Complete`, info);
            syncHandlers.delete(userDid);
            remoteDbInstances.delete(userDid);
        })
        .on("error", (err) => {
            console.error(`PouchDB sync [${userDid}]: Error`, err);
        });

    console.log(`PouchDB live sync initiated for ${userDid}.`);
}

/**
 * Internal function to set credentials without re-triggering initializeSync.
 * @param triggerInitializeSync If true, will call initializeSync. Should be false if called from within initializeSync.
 */
async function internalSetRemoteCouchDbCredentials(
    userDid: string,
    url: string,
    username: string,
    encryptedPasswordData: EncryptedData,
    saltHex: string,
    triggerInitializeSync: boolean = true
) {
    if (!userDid) {
        console.error("internalSetRemoteCouchDbCredentials called without userDid.");
        return;
    }
    console.log(`Attempting to set and store remote CouchDB credentials for ${userDid}. Encrypted.`);

    const newConfig: CouchDbConfig = {
        userDid,
        url,
        username,
        encryptedPassword: encryptedPasswordData,
        passwordSalt: saltHex,
    };
    const storageKey = `${COUCHDB_CONFIG_STORAGE_KEY}_${userDid}`;

    try {
        await chrome.storage.local.set({ [storageKey]: newConfig });
        couchDbConfigCache.set(userDid, newConfig);
        console.log(`Encrypted CouchDB credentials for ${userDid} stored. Key:`, storageKey);

        if (syncHandlers.has(userDid)) {
            console.log(`Cancelling existing sync handler for ${userDid} before re-initializing with new credentials.`);
            syncHandlers.get(userDid)?.cancel();
            syncHandlers.delete(userDid);
            remoteDbInstances.delete(userDid);
        }
        if (triggerInitializeSync) {
            await initializeSync(userDid); // Re-initialize with new (potentially decrypted) credentials
        }
    } catch (error) {
        console.error(`Error storing encrypted CouchDB credentials for ${userDid}:`, error);
        couchDbConfigCache.delete(userDid); // Clear cache on error
    }
}

/**
 * Sets and stores encrypted remote CouchDB credentials for a user.
 * This function is intended to be called externally when new credentials (already encrypted) are available.
 * It will typically re-initialize the sync for that user.
 */
export async function setRemoteCouchDbCredentials(
    userDid: string,
    url: string,
    username: string,
    encryptedPasswordData: EncryptedData,
    saltHex: string
): Promise<void> {
    await internalSetRemoteCouchDbCredentials(userDid, url, username, encryptedPasswordData, saltHex, true);
}

/**
 * Clears CouchDB credentials from memory and storage for a specific user.
 * Should be called on user logout or when an identity is removed.
 */
export async function clearRemoteCouchDbCredentials(userDid: string) {
    if (!userDid) {
        console.error("clearRemoteCouchDbCredentials called without userDid.");
        return;
    }
    console.log(`Clearing CouchDB credentials for ${userDid}.`);
    couchDbConfigCache.delete(userDid);

    if (syncHandlers.has(userDid)) {
        syncHandlers.get(userDid)?.cancel();
        syncHandlers.delete(userDid);
    }
    if (remoteDbInstances.has(userDid)) {
        remoteDbInstances.delete(userDid);
    }
    if (localDbInstances.has(userDid)) {
        try {
            await localDbInstances.get(userDid)?.destroy();
            console.log(`Local PouchDB instance for ${userDid} destroyed.`);
        } catch (destroyError) {
            console.error(`Error destroying local PouchDB instance for ${userDid}:`, destroyError);
        }
        localDbInstances.delete(userDid);
    }

    const storageKey = `${COUCHDB_CONFIG_STORAGE_KEY}_${userDid}`;
    try {
        await chrome.storage.local.remove(storageKey);
        console.log(`CouchDB credentials for ${userDid} cleared from chrome.storage.local.`);
    } catch (error) {
        console.error(`Error clearing CouchDB credentials for ${userDid} from storage:`, error);
    }
}

export function getLocalUserDataDb(userDid: string): PouchDB.Database | null {
    if (!userDid) {
        console.error("getLocalUserDataDb called without userDid.");
        return null;
    }
    if (!localDbInstances.has(userDid)) {
        const dbName = getLocalDbName(userDid);
        console.info(`Initializing local PouchDB database "${dbName}" for user ${userDid}.`);
        localDbInstances.set(userDid, new PouchDB(dbName));
    }
    return localDbInstances.get(userDid)!;
}

export interface AppPermissionDoc {
    _id: string;
    _rev?: string;
    type: "app_permission";
    appId: string;
    userDid: string;
    grants: Record<string, "always" | "never" | "ask">;
    createdAt: string;
    updatedAt: string;
}

// Note-specific CRUD functions (NoteDoc, upsertNote, getNoteById, getAllNotes, deleteNoteById)
// have been removed as per architectural feedback.
// data.handler.ts will now use the generic PouchDB instance methods directly.

export async function upsertAppPermission(
    userDid: string,
    appId: string,
    grants: Record<string, "always" | "never" | "ask">
): Promise<PouchDB.Core.Response | PouchDB.Core.Error> {
    const db = getLocalUserDataDb(userDid);
    if (!db) {
        throw new Error(`PouchDB instance not found for user ${userDid}`);
    }
    const docId = `app_permission:${appId}`;
    const now = new Date().toISOString();

    try {
        const existingDoc = await db.get<AppPermissionDoc>(docId);
        return await db.put({
            ...existingDoc,
            userDid,
            grants,
            updatedAt: now,
        });
    } catch (error: any) {
        if (error.name === "not_found") {
            return await db.put<AppPermissionDoc>({
                _id: docId,
                type: "app_permission",
                appId,
                userDid,
                grants,
                createdAt: now,
                updatedAt: now,
            });
        } else {
            console.error(`Error upserting app permission for ${appId} (user ${userDid}):`, error);
            throw error;
        }
    }
}

export async function getAppPermissions(userDid: string, appId: string): Promise<AppPermissionDoc | null> {
    const db = getLocalUserDataDb(userDid);
    if (!db) {
        console.warn(`PouchDB instance not found for user ${userDid} when trying to get permissions for ${appId}.`);
        return null;
    }
    const docId = `app_permission:${appId}`;
    try {
        const doc = await db.get<AppPermissionDoc>(docId);
        if (doc.userDid !== userDid && doc._id.startsWith("app_permission:")) {
            console.warn(`Permissions doc for ${appId} found, but userDid mismatch. Doc UserDID: ${doc.userDid}, Requested UserDID: ${userDid}`);
        }
        return doc;
    } catch (error: any) {
        if (error.name === "not_found") {
            return null;
        }
        console.error(`Error fetching app permission for ${appId} (user ${userDid}):`, error);
        throw error;
    }
}

export function clearAllPouchDbCachesAndHandlers(): void {
    console.log("Clearing all PouchDB in-memory caches and cancelling sync handlers.");
    // localDbInstances are PouchDB.Database instances.
    // It's good practice to attempt to close them if they have a close method,
    // though PouchDB instances are generally robust.
    // For simplicity in a nuke operation, clearing the map is the primary goal.
    localDbInstances.clear();
    remoteDbInstances.clear();

    syncHandlers.forEach((handler) => {
        try {
            handler.cancel();
        } catch (e) {
            console.warn("Error cancelling sync handler during global clear:", e);
        }
    });
    syncHandlers.clear();
    couchDbConfigCache.clear();
    console.log("Successfully cleared PouchDB caches and sync handlers.");
}
