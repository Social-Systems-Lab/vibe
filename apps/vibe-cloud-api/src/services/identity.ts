import Nano from "nano";
import { generateMnemonic, seedFromMnemonic, getMasterHDKeyFromSeed, deriveChildKeyPair, generateSalt, deriveEncryptionKey, encryptData } from "../lib/crypto";

export class IdentityService {
    private nano: Nano.ServerScope;
    private usersDb: Nano.DocumentScope<any> | undefined;
    public isConnected = false;

    constructor(config: { url: string; user: string; pass: string }) {
        this.nano = Nano(config.url);
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
                    await usersDb.insert(
                        {
                            admins: { names: [], roles: ["_admin"] },
                            members: { names: [], roles: ["_admin"] },
                        } as any,
                        "_security"
                    );
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

        const mnemonic = generateMnemonic();
        const seed = await seedFromMnemonic(mnemonic);
        const masterKey = getMasterHDKeyFromSeed(seed);
        const keyPair = deriveChildKeyPair(masterKey, 0);

        const salt = generateSalt();
        const encryptionKey = await deriveEncryptionKey(password_raw, salt);
        const encryptedMnemonic = await encryptData(mnemonic, encryptionKey);

        return this.usersDb.insert({
            _id: `user:${email}`,
            email,
            password_hash,
            publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
            encryptedMnemonic: {
                ...encryptedMnemonic,
                salt: Buffer.from(salt).toString("hex"),
            },
        });
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
