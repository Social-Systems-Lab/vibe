// services/db-service.ts
import nano from "nano";
import crypto from "crypto";
import logger from "../utils/logger";

interface CouchDBError {
    statusCode: number;
    error: string;
    reason: string;
}

interface SystemDocument {
    _id?: string;
    _rev?: string;
    did: string;
    devices: {
        [deviceId: string]: {
            username: string;
            lastAccess: string;
            deviceName: string;
        };
    };
    created: string;
    updated?: string;
}

function isCouchDBError(error: unknown): error is CouchDBError {
    return typeof error === "object" && error !== null && "statusCode" in error;
}

class DbService {
    private couchdb;
    private adminUsername: string;
    private adminPassword: string;
    private readonly SYSTEM_DB = "vibe_system";
    private readonly USERS_DB = "_users";

    constructor() {
        this.adminUsername = process.env.COUCHDB_ADMIN_USER || "admin";
        this.adminPassword = process.env.COUCHDB_ADMIN_PASSWORD || "password";

        // Connect to CouchDB
        this.couchdb = nano(`http://${this.adminUsername}:${this.adminPassword}@${process.env.COUCHDB_HOST}:5984`);
    }

    async initSystemDatabases() {
        try {
            // Create _users database if it doesn't exist
            try {
                await this.couchdb.db.get(this.USERS_DB);
                logger.debug("_users database exists");
            } catch (err) {
                if (isCouchDBError(err) && err.statusCode === 404) {
                    await this.couchdb.db.create(this.USERS_DB);
                    logger.info("Created _users database");
                } else {
                    throw err;
                }
            }

            // Create vibe_system database if it doesn't exist
            try {
                await this.couchdb.db.get(this.SYSTEM_DB);
                logger.debug("vibe_system database exists");
            } catch (err) {
                if (isCouchDBError(err) && err.statusCode === 404) {
                    await this.couchdb.db.create(this.SYSTEM_DB);
                    logger.info("Created vibe_system database");
                } else {
                    throw err;
                }
            }
        } catch (error) {
            logger.error("Failed to initialize system databases", { error });
            throw new Error("Failed to initialize system databases");
        }
    }

    async createUserDatabase(dbName: string, did: string, deviceId: string, deviceName: string = "Unknown Device") {
        try {
            await this.initSystemDatabases();
            const systemDb = this.couchdb.use<SystemDocument>(this.SYSTEM_DB);

            console.log("creating user database");

            // Find or create the system document for this DID
            let systemDoc: SystemDocument;
            try {
                systemDoc = await systemDb.get(did);
            } catch (err) {
                console.log("ERROR", err);
                if (isCouchDBError(err) && err.statusCode === 404) {
                    console.log("system doc not found");
                    // Create system doc for first-time users
                    systemDoc = {
                        _id: did,
                        did,
                        devices: {},
                        created: new Date().toISOString(),
                    };

                    // Create the user database
                    try {
                        console.log("create user database");
                        await this.couchdb.db.get(dbName);
                    } catch (dbErr) {
                        if (isCouchDBError(dbErr) && dbErr.statusCode === 404) {
                            await this.couchdb.db.create(dbName);
                            logger.info(`Created database for ${did}`);
                        } else {
                            throw dbErr;
                        }
                    }
                } else {
                    throw err;
                }
            }

            // Check if this device already has credentials
            console.log("check if device already has credentials");
            if (systemDoc.devices?.[deviceId]) {
                const existingDevice = systemDoc.devices[deviceId];
                const username = existingDevice.username;

                try {
                    // Attempt to verify the user exists
                    console.log("verify user exists");
                    await this.couchdb.request({
                        method: "GET",
                        db: "_users",
                        doc: `org.couchdb.user:${username}`,
                    });

                    // User exists, return existing credentials
                    systemDoc.devices[deviceId].lastAccess = new Date().toISOString();
                    systemDoc.devices[deviceId].deviceName = deviceName;
                    await systemDb.insert(systemDoc);

                    logger.info(`Returning existing credentials for device ${deviceId}`);
                    return {
                        username,
                        password: "********", // Never return the actual password
                        dbName,
                        deviceId,
                    };
                } catch (userErr) {
                    // User record might have been deleted, create new credentials
                    logger.warn(`User record not found for device ${deviceId}, creating new credentials`);
                }
            }

            // Handle credential limits
            const deviceCount = Object.keys(systemDoc.devices).length;
            const MAX_DEVICE_CREDENTIALS = 10;

            // If we have too many devices, reuse the oldest credential
            if (deviceCount >= MAX_DEVICE_CREDENTIALS) {
                // Find oldest device by lastAccess
                let oldestDeviceId = "";
                let oldestAccess = Date.now();

                for (const [id, device] of Object.entries(systemDoc.devices)) {
                    const accessTime = new Date(device.lastAccess).getTime();
                    if (accessTime < oldestAccess) {
                        oldestAccess = accessTime;
                        oldestDeviceId = id;
                    }
                }

                logger.info(`Reusing credentials from oldest device ${oldestDeviceId}`);

                // Create new credentials
                const password = crypto.randomBytes(16).toString("hex");
                const username = systemDoc.devices[oldestDeviceId].username;

                // Update CouchDB user with new password
                await this.couchdb.request({
                    method: "PUT",
                    db: "_users",
                    doc: `org.couchdb.user:${username}`,
                    body: {
                        name: username,
                        password: password,
                        roles: [],
                        type: "user",
                    },
                });

                // Replace old device entry with new one
                delete systemDoc.devices[oldestDeviceId];
                systemDoc.devices[deviceId] = {
                    username,
                    deviceName,
                    lastAccess: new Date().toISOString(),
                };

                await systemDb.insert(systemDoc);
                return { username, password, dbName, deviceId };
            }

            console.log("creating credentials for a new device");

            // Create new credentials for a new device
            const username = `user_${did.slice(-8)}_${deviceId.slice(0, 8)}`;
            const password = crypto.randomBytes(16).toString("hex");

            console.log("creating new couchdb user");

            // Create CouchDB user
            await this.couchdb.request({
                method: "PUT",
                db: "_users",
                doc: `org.couchdb.user:${username}`,
                body: {
                    name: username,
                    password: password,
                    roles: [],
                    type: "user",
                },
            });

            // Update security doc
            const securityDoc = {
                admins: { names: [], roles: [] },
                members: {
                    names: Object.values(systemDoc.devices)
                        .map((device) => device.username)
                        .concat([username]),
                    roles: [],
                },
            };

            console.log("inserting security docs");
            await this.couchdb.request({
                method: "PUT",
                db: dbName,
                doc: "_security",
                body: securityDoc,
            });

            // Update system document
            systemDoc.devices[deviceId] = {
                username,
                deviceName,
                lastAccess: new Date().toISOString(),
            };

            systemDoc.updated = new Date().toISOString();
            console.log("inserting system doc");
            await systemDb.insert(systemDoc);

            return { username, password, dbName, deviceId };
        } catch (error) {
            console.log(error);
            logger.error("Error in database operations", { error, dbName, did });
            throw new Error("Failed to setup user database");
        }
    }
}

export default new DbService();
