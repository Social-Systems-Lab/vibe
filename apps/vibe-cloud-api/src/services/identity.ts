import Nano from "nano";
import { generateEd25519KeyPair, didFromEd25519, generateSalt, deriveEncryptionKey, encryptData, decryptData } from "vibe-core";
import { instanceIdFromDid } from "../lib/did";
import { randomBytes, createHash } from "crypto";
import { encryptWithMasterKey, decryptWithMasterKey } from "../lib/crypto";
import { getUserDbName } from "../lib/db";

export class IdentityService {
    private nano: Nano.ServerScope;
    private usersDb: Nano.DocumentScope<any> | undefined;
    private instanceIdSecret: string;
    public isConnected = false;
    private config: { url: string; user: string; pass: string; instanceIdSecret: string };
    private sessionCache = new Map<string, { password_hash: string; expires: number }>();

    constructor(config: { url: string; user: string; pass: string; instanceIdSecret: string }) {
        this.config = config;
        this.nano = Nano(config.url);
        this.instanceIdSecret = config.instanceIdSecret;
    }

    private async reauthenticate() {
        await this.nano.auth(this.config.user, this.config.pass);
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

    async register(email: string, password_hash: string, password_raw: string, displayName: string) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }

        // 1. Generate key pair and DID
        const keyPair = generateEd25519KeyPair();
        const did = didFromEd25519(keyPair.publicKey);
        const instanceId = instanceIdFromDid(did, this.instanceIdSecret);

        // 2. Provision user database
        const userDbName = getUserDbName(instanceId);
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
                admins: { names: [this.config.user, dbUser], roles: [] },
                members: { names: [this.config.user, dbUser], roles: [] },
            },
        });

        // 4. Encrypt private key and db credentials
        const encryptedPrivateKey = encryptWithMasterKey(Buffer.from(keyPair.privateKey).toString("hex"));
        const encryptedDbPass = encryptWithMasterKey(dbPass);

        // 5. Generate and store refresh token
        const refreshToken = randomBytes(32).toString("hex");
        const hashedRefreshToken = createHash("sha256").update(refreshToken).digest("hex");
        const refreshTokenExpiry = new Date();
        refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 30); // 30-day validity

        // 6. Store user document
        const userDocument = {
            _id: `user:${email}`,
            email,
            password_hash,
            displayName,
            did,
            instanceId,
            publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
            encryptedPrivateKey,
            dbUser,
            encryptedDbPass,
            keyEncVersion: 2,
            refreshTokens: [
                {
                    hash: hashedRefreshToken,
                    expires: refreshTokenExpiry.toISOString(),
                },
            ],
            consents: [],
        };
        await this.usersDb.insert(userDocument);

        // 7. store profiles/me document
        const profile = {
            _id: "profiles/me",
            name: displayName,
            did,
        };
        await this.nano.db.use(userDbName).insert(profile);

        return { ...userDocument, refreshToken };
    }

    async findByEmail(email: string) {
        await this.reauthenticate();
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

    async login(email: string, password_raw: string) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const user = await this.findByEmail(email);
        if (!user) {
            throw new Error("Invalid credentials");
        }

        const isMatch = await Bun.password.verify(password_raw, user.password_hash);
        if (!isMatch) {
            throw new Error("Invalid credentials");
        }

        // Generate and store a new refresh token
        const refreshToken = randomBytes(32).toString("hex");
        const hashedRefreshToken = createHash("sha256").update(refreshToken).digest("hex");
        const refreshTokenExpiry = new Date();
        refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 30); // 30-day validity

        if (!user.refreshTokens) {
            user.refreshTokens = [];
        }
        user.refreshTokens.push({
            hash: hashedRefreshToken,
            expires: refreshTokenExpiry.toISOString(),
        });

        await this.usersDb.insert(user);

        return { ...user, refreshToken };
    }

    async findByDid(did: string) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const selector = {
            selector: {
                did: did,
            },
            limit: 1,
        };
        const result = await this.usersDb.find(selector);
        if (result.docs.length > 0) {
            return result.docs[0];
        }
        return null;
    }

    async findUserByResetToken(resetToken: string) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const hashedToken = createHash("sha256").update(resetToken).digest("hex");
        const selector = {
            selector: {
                resetTokens: {
                    $elemMatch: {
                        hash: hashedToken,
                    },
                },
            },
            limit: 1,
        };
        const result = await this.usersDb.find(selector);
        if (result.docs.length > 0) {
            const user = result.docs[0];
            const token = user.resetTokens.find((t: any) => t.hash === hashedToken);
            if (new Date(token.expires) < new Date()) {
                return null;
            }
            return user;
        }
        return null;
    }

    async findUserByRefreshToken(refreshToken: string) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const hashedRefreshToken = createHash("sha256").update(refreshToken).digest("hex");
        const selector = {
            selector: {
                refreshTokens: {
                    $elemMatch: {
                        hash: hashedRefreshToken,
                    },
                },
            },
            limit: 1,
        };
        const result = await this.usersDb.find(selector);
        if (result.docs.length > 0) {
            return result.docs[0];
        }
        return null;
    }

    async validateRefreshToken(refreshToken: string) {
        await this.reauthenticate();
        const user = await this.findUserByRefreshToken(refreshToken);
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        if (!user || !user.refreshTokens) {
            throw new Error("Invalid refresh token");
        }

        const hashedRefreshToken = createHash("sha256").update(refreshToken).digest("hex");

        const tokenRecord = user.refreshTokens.find((token: any) => token.hash === hashedRefreshToken);

        if (!tokenRecord) {
            throw new Error("Invalid refresh token");
        }

        if (new Date(tokenRecord.expires) < new Date()) {
            throw new Error("Refresh token expired");
        }

        const newRefreshToken = randomBytes(32).toString("hex");
        const hashedNewRefreshToken = createHash("sha256").update(newRefreshToken).digest("hex");
        const newRefreshTokenExpiry = new Date();
        newRefreshTokenExpiry.setDate(newRefreshTokenExpiry.getDate() + 30);

        user.refreshTokens = user.refreshTokens.filter((token: any) => token.hash !== hashedRefreshToken);
        user.refreshTokens.push({
            hash: hashedNewRefreshToken,
            expires: newRefreshTokenExpiry.toISOString(),
        });

        await this.usersDb.insert(user);

        return { ...user, refreshToken: newRefreshToken };
    }

    async logout(refreshToken: string) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const user = await this.findUserByRefreshToken(refreshToken);
        if (!user || !user.refreshTokens) {
            return; // No tokens to logout from
        }

        const hashedRefreshToken = createHash("sha256").update(refreshToken).digest("hex");

        user.refreshTokens = user.refreshTokens.filter((token: any) => token.hash !== hashedRefreshToken);

        await this.usersDb.insert(user);
    }
    async createAuthCode(data: {
        userDid: string;
        clientId: string;
        redirectUri: string;
        codeChallenge: string;
        codeChallengeMethod: string;
        scope: string;
    }): Promise<string> {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }

        const code = randomBytes(32).toString("hex");
        const expires = new Date();
        expires.setMinutes(expires.getMinutes() + 1); // 1 minute validity

        const authCodeDoc = {
            _id: `auth_code:${code}`,
            type: "auth_code",
            ...data,
            expires: expires.toISOString(),
        };

        await this.usersDb.insert(authCodeDoc);
        return code;
    }

    async validateAuthCode(code: string, codeVerifier: string, clientId: string, redirectUri: string): Promise<string> {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }

        const maxRetries = 3;
        const delay = 100; // ms
        let doc;

        for (let i = 0; i < maxRetries; i++) {
            try {
                doc = await this.usersDb.get(`auth_code:${code}`);
                break; // Success
            } catch (error: any) {
                if (error.statusCode === 404) {
                    throw new Error("Invalid or expired authorization code.");
                }
                // Retry on other errors, e.g., auth issues
                if (i === maxRetries - 1) throw error;
                await new Promise((res) => setTimeout(res, delay * Math.pow(2, i)));
            }
        }

        if (!doc) {
            throw new Error("Failed to retrieve authorization code after retries.");
        }

        // Delete the code immediately to prevent reuse
        await this.usersDb.destroy(doc._id, doc._rev);

        if (new Date(doc.expires) < new Date()) {
            throw new Error("Invalid or expired authorization code.");
        }

        if (doc.clientId !== clientId) {
            throw new Error("Client ID does not match.");
        }

        if (doc.redirectUri !== redirectUri) {
            throw new Error("Redirect URI does not match.");
        }

        // PKCE verification
        if (doc.codeChallengeMethod === "S256") {
            const hashedVerifier = createHash("sha256").update(codeVerifier).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
            if (doc.codeChallenge !== hashedVerifier) {
                throw new Error("Invalid code_verifier.");
            }
        } else {
            // Plain method (not recommended for production)
            if (doc.codeChallenge !== codeVerifier) {
                throw new Error("Invalid code_verifier.");
            }
        }

        return doc.userDid;
    }
    /**
     * Store/Upsert a user's consent for an app with full inline manifest.
     * Replaces legacy string[] consents with structured entries.
     */
    async storeUserConsent(
        userDid: string,
        consent: {
            clientId: string;
            origin: string;
            manifest: {
                appName?: string;
                appDescription?: string;
                appTagline?: string;
                appLogoUrl?: string;
                appLogotypeUrl?: string;
                appShowcaseUrl?: string;
                backgroundImageUrl?: string;
                backgroundColor?: string;
                buttonColor?: string;
                themeColor?: string;
            };
            addedAt?: string;
        }
    ) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const user = await this.findByDid(userDid);
        if (!user) {
            throw new Error("User not found");
        }

        const nowIso = new Date().toISOString();
        const newEntry = {
            clientId: consent.clientId,
            origin: consent.origin,
            manifest: consent.manifest || {},
            addedAt: consent.addedAt || nowIso,
        };

        // Normalize consents to structured array
        let consents: any[] = Array.isArray(user.consents) ? user.consents : [];

        // Remove any legacy string entries equal to clientId
        consents = consents.filter((c: any) => typeof c !== "string" || c !== consent.clientId);

        // Upsert by clientId (unique identifier)
        const idx = consents.findIndex((c: any) => c && typeof c === "object" && c.clientId === consent.clientId);
        if (idx >= 0) {
            consents[idx] = { ...consents[idx], ...newEntry, addedAt: consents[idx].addedAt || newEntry.addedAt };
        } else {
            consents.push(newEntry);
        }

        await this.usersDb.insert({
            ...user,
            consents,
        });
    }

    async hasUserConsented(userDid: string, clientIdOrOrigin: string): Promise<boolean> {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const user = await this.findByDid(userDid);
        if (!user || !user.consents) return false;

        // Accept either clientId or origin
        for (const c of user.consents as any[]) {
            if (typeof c === "string") {
                if (c === clientIdOrOrigin) return true;
            } else if (c && typeof c === "object") {
                if (c.clientId === clientIdOrOrigin || c.origin === clientIdOrOrigin) return true;
            }
        }
        return false;
    }
    async revokeUserConsent(userDid: string, clientIdOrOrigin: string) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const user = await this.findByDid(userDid);
        if (!user) {
            throw new Error("User not found");
        }
        const consents = (user.consents || []) as any[];

        const filtered = consents.filter((c: any) => {
            if (typeof c === "string") return c !== clientIdOrOrigin;
            if (c && typeof c === "object") {
                return c.clientId !== clientIdOrOrigin && c.origin !== clientIdOrOrigin;
            }
            return false;
        });

        await this.usersDb.insert({
            ...user,
            consents: filtered,
        });
    }
    async getDecryptedPrivateKey(user: any): Promise<string> {
        if (user.keyEncVersion !== 2) {
            throw new Error("Cannot decrypt private key for unmigrated user");
        }
        return decryptWithMasterKey(user.encryptedPrivateKey);
    }

    async updateUser(did: string, data: { displayName?: string; pictureUrl?: string; password_hash?: string }) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }

        const user = await this.findByDid(did);
        if (!user) {
            throw new Error("User not found");
        }

        const updatedUser = { ...user, ...data };
        await this.usersDb.insert(updatedUser);

        // Also update the 'profiles/me' document in the user's own database
        const userDbName = getUserDbName(user.instanceId);
        const userDb = this.nano.db.use(userDbName);
        try {
            const profileDoc = (await userDb.get("profiles/me")) as any;
            await userDb.insert({
                ...profileDoc,
                _rev: profileDoc._rev, // Ensure we have the latest revision
                name: updatedUser.displayName,
                pictureUrl: updatedUser.pictureUrl,
            } as any);
        } catch (error: any) {
            if (error.statusCode === 404) {
                // Profile doc doesn't exist, create it
                await userDb.insert({
                    _id: "profiles/me",
                    name: updatedUser.displayName,
                    pictureUrl: updatedUser.pictureUrl,
                } as any);
            } else {
                console.error("Error updating profiles/me doc:", error);
                // Don't throw, as the main user update succeeded
            }
        }

        return updatedUser;
    }

    async createDbSession(user: any) {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }

        const dbUser = `user-${user.instanceId}`;
        const cached = this.sessionCache.get(dbUser);

        if (cached && cached.expires > Date.now()) {
            return {
                username: dbUser,
                password: cached.password_hash,
            };
        }

        const dbPass = randomBytes(16).toString("hex");
        const couchUserDoc = await this.nano.db.use("_users").get(`org.couchdb.user:${dbUser}`);

        await this.nano.db.use("_users").insert({
            ...(couchUserDoc as any),
            password: dbPass,
        });

        this.sessionCache.set(dbUser, {
            password_hash: dbPass,
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });

        return {
            username: dbUser,
            password: dbPass,
        };
    }

    /**
     * Return structured consents list or [].
     */
    async listUserConsents(userDid: string): Promise<
        Array<{
            clientId: string;
            origin: string;
            manifest: any;
            addedAt: string;
        }>
    > {
        await this.reauthenticate();
        if (!this.usersDb || !this.isConnected) {
            throw new Error("Database not connected");
        }
        const user = await this.findByDid(userDid);
        if (!user) return [];
        const consents = Array.isArray(user.consents) ? user.consents : [];
        // Normalize legacy string entries into structured minimal shape
        return consents.map((c: any) => {
            if (typeof c === "string") {
                return {
                    clientId: c,
                    origin: c,
                    manifest: {},
                    addedAt: new Date(0).toISOString(),
                };
            }
            return {
                clientId: c.clientId,
                origin: c.origin ?? c.clientId,
                manifest: c.manifest ?? {},
                addedAt: c.addedAt ?? new Date(0).toISOString(),
            };
        });
    }
}
