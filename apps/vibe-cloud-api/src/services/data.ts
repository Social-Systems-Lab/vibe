import nano, { DocumentScope } from "nano";
import { getUserDbName } from "../lib/db";

// TODO: Move this to a shared types package
export interface JwtPayload {
    sub: string; // This is the user's DID
    instanceId: string;
}

export class DataService {
    private couch: nano.ServerScope;

    constructor(private options: { url: string; user: string; pass: string }) {
        this.couch = nano(options.url);
    }

    private getDb(instanceId: string): DocumentScope<unknown> {
        const dbName = getUserDbName(instanceId);
        return this.couch.use(dbName);
    }

    async write(collection: string, doc: any, user: JwtPayload) {
        // TODO: Add authorization logic here to check if the user has write permissions for this collection.
        console.log(`Authorization TODO: Check if user ${user.sub} can write to ${collection}`);

        const db = this.getDb(user.instanceId);
        if (!doc._id) {
            // TODO: Consider a more robust ID generation strategy
            doc._id = `${collection}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
        doc.$collection = collection;

        const response = await db.insert(doc);
        return response;
    }

    async readOnce(collection: string, filter: any, user: JwtPayload) {
        // TODO: Add authorization logic here to check if the user has read permissions for this collection.
        console.log(`Authorization TODO: Check if user ${user.sub} can read from ${collection}`);

        const db = this.getDb(user.instanceId);
        const query = {
            selector: {
                ...filter,
                $collection: collection,
            },
        };
        const result = await db.find(query);
        return result.docs;
    }
}
