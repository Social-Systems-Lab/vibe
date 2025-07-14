import nano, { DocumentScope } from "nano";
import { getUserDbName } from "../lib/db";
import { IdentityService } from "./identity";
import { CachedDoc, DocRef } from "vibe-sdk";

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

        console.log("Writing to collection:", collection, "with data:", data);
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

    async getAllUserDbNames(): Promise<string[]> {
        const allDbs = await this.couch.db.list();
        return allDbs.filter((db) => db.startsWith("userdb-"));
    }

    async readOnce(collection: string, query: any, user: JwtPayload) {
        await this.reauthenticate();
        // TODO: Add authorization logic here
        console.log(`Authorization TODO: Check if user ${user.sub} can read from ${collection}`);

        console.log("Reading once from collection:", collection, "with query:", query);
        const { expand, maxCacheAge, global, ...selector } = query;

        if (global) {
            // Global query: iterate through all user databases
            const dbNames = await this.getAllUserDbNames();
            const allDocs: any[] = [];

            for (const dbName of dbNames) {
                try {
                    const db = this.couch.use(dbName);
                    const dbQuery = {
                        selector: {
                            ...selector,
                            collection: collection,
                        },
                    };
                    const result = await db.find(dbQuery);
                    allDocs.push(...result.docs);
                } catch (error) {
                    console.error(`Error querying database ${dbName}:`, error);
                }
            }

            if (expand && expand.length > 0) {
                const docs = await this._expand(allDocs, expand, user, maxCacheAge);
                return { docs };
            }

            return { docs: allDocs };
        } else {
            // Standard query on the user's own database
            const db = this.getDb(user.instanceId);
            const dbQuery = {
                selector: {
                    ...selector,
                    collection: collection,
                },
            };
            const result = await db.find(dbQuery);

            if (expand && expand.length > 0) {
                const docs = await this._expand(result.docs, expand, user, maxCacheAge);
                return { docs };
            }

            return { docs: result.docs };
        }
    }

    private async _expand(docs: any[], expand: string[], currentUser: JwtPayload, maxCacheAge?: number) {
        const currentUserDb = this.getDb(currentUser.instanceId);

        const promises = docs.map(async (doc) => {
            const expandedDoc = { ...doc };
            for (const field of expand) {
                const ref = doc[field] as DocRef;
                if (!ref || !ref.did || !ref.ref) continue;

                if (ref.did === currentUser.sub) {
                    // This is a ref to the current user's own data.
                    // We can assume it's already on the client in the Hub strategy,
                    // and for Standalone, it's a lookup in the same DB, which is fast.
                    // For now, we will fetch it directly.
                    try {
                        expandedDoc[field] = await currentUserDb.get(ref.ref);
                    } catch (error) {
                        console.error(`Failed to expand local ref ${field} for doc ${doc._id}`, error);
                    }
                    continue;
                }

                // Logic for remote refs (with caching)
                const cacheId = `cache/${ref.did}/${ref.ref}`;
                let existingCacheItem: CachedDoc<any> | null = null;
                try {
                    existingCacheItem = (await currentUserDb.get(cacheId)) as CachedDoc<any>;
                } catch (error: any) {
                    if (error.statusCode !== 404) console.error("Error reading from cache:", error);
                }

                const isCacheFresh = () => {
                    if (!existingCacheItem) return false;
                    if (maxCacheAge === 0) return false; // Force refresh
                    if (maxCacheAge === undefined) return true; // Cache is always fresh if no age is specified
                    const age = (Date.now() - existingCacheItem.cachedAt) / 1000;
                    return age <= maxCacheAge;
                };

                if (isCacheFresh()) {
                    expandedDoc[field] = existingCacheItem!.data;
                } else {
                    // Fetch from remote source because cache is missing or stale
                    const remoteUser = await this.identityService.findByDid(ref.did);
                    if (remoteUser) {
                        const remoteDb = this.getDb(remoteUser.instanceId);
                        try {
                            const freshDoc = await remoteDb.get(ref.ref);
                            expandedDoc[field] = freshDoc;

                            // Update cache
                            const newCacheItem: CachedDoc<any> = {
                                _id: cacheId,
                                _rev: existingCacheItem?._rev, // Use existing rev to update
                                type: "cache",
                                data: freshDoc,
                                cachedAt: Date.now(),
                                originalDid: ref.did,
                                originalRef: ref.ref,
                            };
                            await currentUserDb.insert(newCacheItem as any);
                        } catch (error) {
                            console.error(`Failed to expand remote ref ${field} for doc ${doc._id}`, error);
                        }
                    }
                }
            }
            return expandedDoc;
        });
        return Promise.all(promises);
    }

    async update(collection: string, data: any, user: JwtPayload) {
        await this.reauthenticate();
        // TODO: Add authorization logic here
        console.log(`Authorization TODO: Check if user ${user.sub} can write to ${collection}`);

        const db = this.getDb(user.instanceId);
        const itemsToProcess = Array.isArray(data) ? data : [data];

        const docs = await Promise.all(
            itemsToProcess.map(async (doc) => {
                if (!doc._id) {
                    throw new Error("Document must have an _id to be updated.");
                }
                try {
                    const existing = await db.get(doc._id);
                    doc._rev = existing._rev;
                } catch (error: any) {
                    if (error.statusCode !== 404) {
                        throw error;
                    }
                    // If the document doesn't exist, we'll create it.
                }
                doc.collection = collection;
                return doc;
            })
        );

        const response = await db.bulk({ docs });
        return response;
    }
}
