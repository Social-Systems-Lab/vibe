import Nano from "nano";
import { generateSalt, deriveEncryptionKey, encryptData } from "../lib/crypto";
import { generateEd25519KeyPair, didFromEd25519, instanceIdFromDid } from "vibe-crypto";
import { randomBytes } from "crypto";

export class IdentityService {
    private nano: Nano.ServerScope;
    private usersDb: Nano.DocumentScope<any> | undefined;
    private instanceIdSecret: string;
    public isConnected = false;

    constructor(config: { url: string; user: string; pass: string; instanceIdSecret: string }) {
        this.nano = Nano(config.url);
        this.instanceIdSecret = config.instanceIdSecret;
    }

    async onApplicationBootstrap(user: string, pass: string) {
        const maxRetries = 5;
        const initialDelay = 1000; // 1 second

        for (let i = 0; i < maxRetries; i++) {
            try {
                await this.nano.auth(user, pass);
                const dbList = await this.nano.db.list();
                if (!dbList.includes("users")) {
                    await this.nano.db.create("users");
                    console.log('Database "users" created.');
                    const usersDb = this.nano.db.use("users");
                    await this.nano.request({
                        db: "users",
                        method: "put",
                        path: "_security",
                        body: {
                            admins: { names: [user], roles: ["_admin"] },
                            members: { names: [user], roles: ["_admin"] },
                        },
                    });
                }
                this.usersDb = this.nano.db.use("users");
                this.isConnected = true;
                return; // Success
            } catch (error: any) {
                if (error.message && error.message.includes("ECONNREFUSED")) {
                    const delay = initialDelay * Math.pow(2, i);
                    console.log(`CouchDB connection refused. Retrying in ${delay / 1000}s... (${i + 1}/${maxRetries})`);
                    await new Promise((res) => setTimeout(res, delay));
                } else {
                    console.error("Error initializing CouchDB connection:", error);
                    throw error; // Rethrow unexpected errors
                }
            }
        }

        console.error("Failed to connect to CouchDB after several retries.");
        this.isConnected = false;
        throw new Error("Failed to connect to CouchDB after several retries.");
    }

    async register(email: string, password_hash: string, password_raw: string) {
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }

        // 1. Generate key pair and DID
        const keyPair = generateEd25519KeyPair();
        const did = didFromEd25519(keyPair.publicKey);
        const instanceId = instanceIdFromDid(did, this.instanceIdSecret);

        // 2. Provision user database
        const userDbName = `userdb-${instanceId}`;
        await this.nano.db.create(userDbName);

        // 3. Create CouchDB user with access to the new database
        const dbUser = `user-${instanceId}`;
        const dbPass = randomBytes(16).toString("hex");
        const couchUser = {
            _id: `org.couchdb.user:${dbUser}`,
            name: dbUser,
            roles: [],
            type: "user",
            password: dbPass,
        };
        await this.nano.db.use("_users").insert(couchUser);
        await this.nano.request({
            db: userDbName,
            method: "put",
            path: "_security",
            body: {
                admins: { names: [dbUser], roles: [] },
                members: { names: [dbUser], roles: [] },
            },
        });

        // 4. Encrypt private key and db credentials
        const salt = generateSalt();
        const encryptionKey = await deriveEncryptionKey(password_raw, salt);
        const encryptedPrivateKey = await encryptData(Buffer.from(keyPair.privateKey).toString("hex"), encryptionKey);
        const encryptedDbPass = await encryptData(dbPass, encryptionKey);

        // 5. Store user document
        const userDocument = {
            _id: `user:${email}`,
            email,
            password_hash,
            did,
            instanceId,
            publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
            encryptedPrivateKey: {
                ...encryptedPrivateKey,
                salt: Buffer.from(salt).toString("hex"),
            },
            dbUser,
            encryptedDbPass: {
                ...encryptedDbPass,
                salt: Buffer.from(salt).toString("hex"),
            },
        };
        await this.usersDb.insert(userDocument);
        return userDocument;
    }

    async findByEmail(email: string) {
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        try {
            return await this.usersDb.get(`user:${email}`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }
}
