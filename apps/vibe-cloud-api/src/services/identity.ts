import Nano from "nano";

export class IdentityService {
    private nano: Nano.ServerScope;
    private usersDb: Nano.DocumentScope<any> | undefined;

    constructor(config: { url: string; user: string; pass: string }) {
        this.nano = Nano({
            url: config.url,
            requestDefaults: {
                jar: true,
            },
        });
    }

    async onApplicationBootstrap(user: string, pass: string) {
        try {
            await this.nano.auth(user, pass);
            const dbList = await this.nano.db.list();
            if (!dbList.includes("users")) {
                await this.nano.db.create("users");
                console.log('Database "users" created.');
            }
            this.usersDb = this.nano.db.use("users");
        } catch (error) {
            console.error("Error initializing CouchDB connection:", error);
            throw error;
        }
    }

    async register(email: string, password_hash: string) {
        if (!this.usersDb) {
            throw new Error("Database not initialized");
        }
        // TODO: Check if user exists
        return this.usersDb.insert({
            _id: `user:${email}`,
            email,
            password_hash,
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
