import nano, { DocumentScope } from "nano";
import { getUserDbName } from "../lib/db";
import { IdentityService } from "./identity";
import { DocRef } from "vibe-sdk";

// TODO: Move this to a shared types package
export interface JwtPayload {
    sub: string; // This is the user's DID
    instanceId: string;
}

export class DataService {
    private couch: nano.ServerScope;
    private config: { url: string; user: string; pass: string };
    private identityService: IdentityService;

    constructor(config: { url: string; user: string; pass: string }, identityService: IdentityService) {
        this.config = config;
        this.couch = nano(config.url);
        this.identityService = identityService;
    }

    async init() {
        await this.couch.auth(this.config.user, this.config.pass);
    }

    private async reauthenticate() {
        await this.couch.auth(this.config.user, this.config.pass);
    }

    private getDb(instanceId: string): DocumentScope<unknown> {
        const dbName = getUserDbName(instanceId);
        return this.couch.use(dbName);
    }

    async write(collection: string, data: any, user: JwtPayload) {
        await this.reauthenticate();
        // TODO: Add authorization logic here to check if the user has write permissions for this collection.
        console.log(`Authorization TODO: Check if user ${user.sub} can write to ${collection}`);

        const db = this.getDb(user.instanceId);
        const itemsToProcess = Array.isArray(data) ? data : [data];

        const docs = itemsToProcess.map((doc) => {
            if (!doc._id) {
                // TODO: Consider a more robust ID generation strategy
                doc._id = `${collection}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
            }
            doc.collection = collection;
            return doc;
        });

        const response = await db.bulk({ docs });
        return response;
    }

    async readOnce(collection: string, query: any, user: JwtPayload) {
        await this.reauthenticate();
        // TODO: Add authorization logic here to check if the user has read permissions for this collection.
        console.log(`Authorization TODO: Check if user ${user.sub} can read from ${collection}`);

        console.log("Reading once from collection:", collection, "with query:", query);
        const { expand, ...selector } = query;
        const db = this.getDb(user.instanceId);
        const dbQuery = {
            selector: {
                ...selector,
                collection: collection,
            },
        };
        const result = await db.find(dbQuery);

        if (expand && expand.length > 0) {
            const docs = await this._expand(result.docs, expand);
            return { docs };
        }

        return { docs: result.docs };
    }

    private async _expand(docs: any[], expand: string[]) {
        const promises = docs.map(async (doc) => {
            const expandedDoc = { ...doc };
            for (const field of expand) {
                const ref = doc[field] as DocRef;
                if (ref && ref.did && ref.ref) {
                    const user = await this.identityService.findByDid(ref.did);
                    if (user) {
                        const db = this.getDb(user.instanceId);
                        try {
                            expandedDoc[field] = await db.get(ref.ref);
                        } catch (error) {
                            console.error(`Failed to expand ${field} for doc ${doc._id}`, error);
                        }
                    }
                }
            }
            return expandedDoc;
        });
        return Promise.all(promises);
    }
}
