import Nano from "nano";
import { generateMnemonic, seedFromMnemonic, getMasterHDKeyFromSeed, deriveChildKeyPair, generateSalt, deriveEncryptionKey, encryptData } from "../lib/crypto";

export class IdentityService {
    private nano: Nano.ServerScope;
    private usersDb: Nano.DocumentScope<any> | undefined;

    constructor(config: { url: string; user: string; pass: string }) {
        this.nano = Nano(config.url);
    }

    async onApplicationBootstrap(user: string, pass: string) {
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
        } catch (error) {
            console.error("Error initializing CouchDB connection:", error);
            throw error;
        }
    }

    async register(email: string, password_hash: string, password_raw: string) {
        if (!this.usersDb) {
            throw new Error("Database not initialized");
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
        if (!this.usersDb) {
            throw new Error("Database not initialized");
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
