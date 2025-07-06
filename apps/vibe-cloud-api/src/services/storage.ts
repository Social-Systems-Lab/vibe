import nano, { DocumentScope } from "nano";

const DB_NAME = "vibe_oidc_storage";

export class StorageService {
    private db: DocumentScope<any>;
    private nano: nano.ServerScope;

    constructor(config: { url: string; user: string; pass: string }) {
        this.nano = nano(config.url);
        this.db = this.nano.use<any>(DB_NAME);
    }

    async onApplicationBootstrap() {
        await this.nano.auth(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
        try {
            await this.nano.db.get(DB_NAME);
        } catch (e) {
            await this.nano.db.create(DB_NAME);
            console.log(`Database '${DB_NAME}' created.`);
        }
    }

    async find(id: string): Promise<any | undefined> {
        try {
            const doc = await this.db.get(id);
            return doc;
        } catch (error: any) {
            if (error.statusCode === 404) {
                return undefined;
            }
            throw error;
        }
    }

    async upsert(id: string, payload: any) {
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
