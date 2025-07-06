import nano, { DocumentScope } from "nano";
import { Client } from "../models/client";

const DB_NAME = "vibe_clients";

export class ClientService {
    private db: DocumentScope<Client>;
    private nano: nano.ServerScope;
    private clientSecret: string;

    constructor(config: { url: string; user: string; pass: string; clientSecret: string }) {
        this.nano = nano(config.url);
        this.db = this.nano.use<Client>(DB_NAME);
        this.clientSecret = config.clientSecret;
    }

    async onApplicationBootstrap() {
        await this.nano.auth(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
        try {
            await this.nano.db.get(DB_NAME);
        } catch (e) {
            await this.nano.db.create(DB_NAME);
            console.log(`Database '${DB_NAME}' created.`);
        }

        // Seed the vibe-web client if it doesn't exist
        const vibeWebClient = await this.find("vibe-web");
        if (!vibeWebClient) {
            await this.upsert("vibe-web", {
                client_id: "vibe-web",
                client_secret: this.clientSecret,
                redirect_uris: ["http://localhost:3000/auth/callback"],
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"],
            } as Client);
            console.log("Seeded 'vibe-web' client.");
        }
    }

    async find(id: string): Promise<Client | undefined> {
        try {
            const client = await this.db.get(id);
            return client;
        } catch (error: any) {
            if (error.statusCode === 404) {
                return undefined;
            }
            throw error;
        }
    }

    async upsert(id: string, payload: Client) {
        const existing = await this.find(id);
        if (existing) {
            payload._rev = existing._rev;
        }
        await this.db.insert({ ...payload, _id: id });
    }

    async destroy(id: string) {
        const existing = await this.find(id);
        if (existing) {
            await this.db.destroy(id, existing._rev!);
        }
    }
}
