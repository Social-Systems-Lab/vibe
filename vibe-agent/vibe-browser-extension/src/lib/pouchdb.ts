import PouchDB from "pouchdb-browser";

const COUCHDB_CONFIG_STORAGE_KEY = "couchDbConfig";

// In-memory cache for CouchDB configurations, keyed by userDid
const couchDbConfigCache = new Map<string, CouchDbConfig>();
// Map to store PouchDB instances, keyed by userDid
const localDbInstances = new Map<string, PouchDB.Database>();
// Map to store remote PouchDB instances for sync, keyed by userDid
const remoteDbInstances = new Map<string, PouchDB.Database>();
// Map to store sync handlers, keyed by userDid
const syncHandlers = new Map<string, PouchDB.Replication.Sync<{}>>();

interface CouchDbConfig {
    userDid: string; // Added userDid to associate config
    url: string;
    username: string;
    password?: string; // Storing actual password temporarily. TODO: Encrypt this.
}

function getLocalDbName(userDid: string): string {
    // Sanitize DID if necessary, e.g., replace colons
    const sanitizedDid = userDid.replace(/:/g, "_").replace(/\./g, "-");
    return `user_data_${sanitizedDid}`;
}

async function getCouchDbConfig(userDid: string): Promise<CouchDbConfig | null> {
    if (couchDbConfigCache.has(userDid)) {
        return couchDbConfigCache.get(userDid)!;
    }

    const storageKey = `${COUCHDB_CONFIG_STORAGE_KEY}_${userDid}`;
    try {
        const result = await chrome.storage.local.get(storageKey);
        const storedConfig = result[storageKey];

        if (storedConfig) {
            console.log(`Loaded CouchDB config for ${userDid} from chrome.storage.local`);
            // TODO: Decrypt 'password' field here if it was encrypted
            const config = storedConfig as CouchDbConfig;
            couchDbConfigCache.set(userDid, config);
            return config;
        } else {
            console.warn(
                `CouchDB config not found for ${userDid} in chrome.storage.local using key: ${storageKey}. ` +
                    `User needs to login or re-fetch config from API.`
            );
            // TODO: Implement API call to /api/v1/instance/couchdb-details for this userDid
            // This would be the place to call:
            // const fetchedConfig = await callVibeCloudApiForCouchDbDetails(userDid);
            // if (fetchedConfig) {
            //     await setRemoteCouchDbCredentials(userDid, fetchedConfig.url, fetchedConfig.username, fetchedConfig.password);
            //     return fetchedConfig; // setRemoteCouchDbCredentials will cache it
            // }
            return null;
        }
    } catch (error) {
        console.error(`Error retrieving CouchDB config for ${userDid} from storage:`, error);
        return null;
    }
}

console.info(`PouchDB service initialized for multi-identity support.`);

async function initializeSync(userDid: string) {
    if (!userDid) {
        console.error("initializeSync called without userDid.");
        return;
    }
    const config = await getCouchDbConfig(userDid);
    if (!config) {
        console.error(`Failed to initialize PouchDB sync for ${userDid}: CouchDB config missing.`);
        return;
    }

    if (syncHandlers.has(userDid)) {
        console.log(`PouchDB sync for ${userDid} already initialized or in progress.`);
        return;
    }

    const localDb = getLocalUserDataDb(userDid); // Get specific DB instance
    if (!localDb) {
        console.error(`Failed to get local PouchDB instance for ${userDid}. Cannot initialize sync.`);
        return;
    }

    console.log(`Initializing PouchDB sync for ${userDid} with remote: ${config.url}`);
    const remoteDb = new PouchDB(config.url, {
        auth: {
            username: config.username,
            password: config.password,
        },
        skip_setup: true,
    });
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
            if (err) {
                console.warn(`PouchDB sync [${userDid}]: Paused due to error (will retry)`, err);
            } else {
                console.log(`PouchDB sync [${userDid}]: Paused (idle)`);
            }
        })
        .on("active", () => {
            console.log(`PouchDB sync [${userDid}]: Active`);
        })
        .on("denied", (err) => {
            console.error(`PouchDB sync [${userDid}]: Denied (authentication error or insufficient permissions)`, err);
            if (syncHandlers.has(userDid)) {
                syncHandlers.get(userDid)?.cancel();
                syncHandlers.delete(userDid);
            }
            if (remoteDbInstances.has(userDid)) {
                remoteDbInstances.delete(userDid);
            }
        })
        .on("complete", (info) => {
            console.log(`PouchDB sync [${userDid}]: Complete (live sync may have been cancelled)`, info);
            if (syncHandlers.has(userDid)) {
                syncHandlers.delete(userDid);
            }
            if (remoteDbInstances.has(userDid)) {
                remoteDbInstances.delete(userDid);
            }
        })
        .on("error", (err) => {
            console.error(`PouchDB sync [${userDid}]: An unhandled error occurred`, err);
        });

    console.log(`PouchDB live sync initiated for ${userDid}.`);
}

// Function to be called when user logs in and CouchDB details are available from API
export async function setRemoteCouchDbCredentials(userDid: string, url: string, username: string, password?: string) {
    if (!userDid) {
        console.error("setRemoteCouchDbCredentials called without userDid.");
        return;
    }
    console.log(`Attempting to set and store remote CouchDB credentials for ${userDid}.`);

    const newConfig: CouchDbConfig = { userDid, url, username, password };
    const storageKey = `${COUCHDB_CONFIG_STORAGE_KEY}_${userDid}`;

    try {
        // TODO: Encrypt the 'password' field before storing
        await chrome.storage.local.set({ [storageKey]: newConfig });
        couchDbConfigCache.set(userDid, newConfig); // Update in-memory cache
        console.log(`CouchDB credentials for ${userDid} stored in chrome.storage.local (unencrypted for now). Key:`, storageKey);

        if (syncHandlers.has(userDid)) {
            console.log(`Cancelling existing sync handler for ${userDid} before re-initializing with new credentials.`);
            syncHandlers.get(userDid)?.cancel();
            syncHandlers.delete(userDid);
            remoteDbInstances.delete(userDid);
        }
        await initializeSync(userDid);
    } catch (error) {
        console.error(`Error storing CouchDB credentials for ${userDid}:`, error);
        couchDbConfigCache.delete(userDid);
    }
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
    // Also destroy the local PouchDB instance if it exists
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

// Function to get the local PouchDB database instance for a specific user
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

/**
 * Defines the structure for an application permission document stored in PouchDB.
 */
export interface AppPermissionDoc {
    _id: string; // Document ID, typically `app_permission:${appId}`
    _rev?: string; // Document revision, managed by PouchDB
    type: "app_permission"; // To distinguish from other document types
    appId: string; // The unique identifier for the application
    userDid: string; // The DID of the user these permissions belong to
    grants: Record<string, "always" | "never" | "ask">; // Permission grants
    createdAt: string; // ISO date string of creation
    updatedAt: string; // ISO date string of last update
}

/**
 * Creates or updates an application's permission grants in the local PouchDB for a specific user.
 * @param userDid The DID of the user.
 * @param appId The unique identifier for the application.
 * @param grants An object mapping permission strings to their grant status ('always', 'never', 'ask').
 * @returns A promise that resolves when the operation is complete.
 */
export async function upsertAppPermission(
    userDid: string,
    appId: string,
    grants: Record<string, "always" | "never" | "ask">
): Promise<PouchDB.Core.Response | PouchDB.Core.Error> {
    const db = getLocalUserDataDb(userDid);
    if (!db) {
        throw new Error(`PouchDB instance not found for user ${userDid}`);
    }
    const docId = `app_permission:${appId}`; // AppId should be unique across users for this doc structure
    const now = new Date().toISOString();

    try {
        const existingDoc = await db.get<AppPermissionDoc>(docId);
        return await db.put({
            ...existingDoc,
            userDid, // Ensure userDid is correctly set on update
            grants,
            updatedAt: now,
        });
    } catch (error: any) {
        if (error.name === "not_found") {
            // Document doesn't exist, create it
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
            // Another error occurred
            console.error(`Error upserting app permission for ${appId} (user ${userDid}):`, error);
            throw error; // Re-throw the error to be handled by the caller
        }
    }
}

/**
 * Retrieves an application's permission grants from the local PouchDB for a specific user.
 * @param userDid The DID of the user.
 * @param appId The unique identifier for the application.
 * @returns A promise that resolves with the AppPermissionDoc or null if not found.
 */
export async function getAppPermissions(userDid: string, appId: string): Promise<AppPermissionDoc | null> {
    const db = getLocalUserDataDb(userDid);
    if (!db) {
        console.warn(`PouchDB instance not found for user ${userDid} when trying to get permissions for ${appId}.`);
        return null;
    }
    const docId = `app_permission:${appId}`;
    try {
        const doc = await db.get<AppPermissionDoc>(docId);
        // Ensure the document belongs to the correct user, though docId structure might make this redundant
        // if appId is globally unique for permissions. If appId can be the same for different users' permissions
        // on that app, then this check is important. Assuming appId for permissions is unique to the app itself.
        if (doc.userDid !== userDid && doc._id.startsWith("app_permission:")) {
            // This case should ideally not happen if docId is `app_permission:${appId}` and appId is globally unique for the app.
            // If appId is NOT globally unique for permissions (e.g. an app can have different permissions for different users),
            // then the docId might need to include userDid, e.g. `user:${userDid}:app_permission:${appId}`.
            // For now, assuming `app_permission:${appId}` is sufficient and `doc.userDid` is for record keeping.
            console.warn(`Permissions doc for ${appId} found, but userDid mismatch. Doc UserDID: ${doc.userDid}, Requested UserDID: ${userDid}`);
            // Depending on strictness, could return null here.
        }
        return doc;
    } catch (error: any) {
        if (error.name === "not_found") {
            return null; // Not found is a valid outcome
        }
        console.error(`Error fetching app permission for ${appId} (user ${userDid}):`, error);
        throw error; // Re-throw other errors
    }
}

// No default export of a single DB instance anymore.
// Consumers will use getLocalUserDataDb(userDid).
