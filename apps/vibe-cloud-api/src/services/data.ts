import nano, { DocumentScope } from "nano";
import { getUserDbName } from "../lib/db";
import { IdentityService } from "./identity";
import {
    CachedDoc,
    DocRef,
    Certificate,
    Acl,
    AclPermission,
    AclRule,
    publicKeyHexToSpkiPem,
    Document,
    ReadOnceApiResponse,
} from "vibe-core";
import * as jose from "jose";
import { GlobalFeedService } from "./global-feed";

export interface JwtPayload {
    sub: string; // This is the user's DID
    instanceId: string;
}

interface VerifiedCert {
    payload: CertJwtPayload;
    raw: string;
}

interface CertJwtPayload extends jose.JWTPayload {
    jti: string;
    type: string;
    sub: string;
    iss: string;
}

export class DataService {
    private couch: nano.ServerScope;
    private config: { url: string; user: string; pass: string };
    private identityService: IdentityService;
    public globalDb: DocumentScope<any>;
    private globalFeedService: GlobalFeedService;

    constructor(
        config: { url: string; user: string; pass: string },
        identityService: IdentityService,
        globalFeedService: GlobalFeedService
    ) {
        this.config = config;
        this.couch = nano(config.url);
        this.identityService = identityService;
        this.globalDb = this.couch.use("global");
        this.globalFeedService = globalFeedService;
    }

    async init() {
        await this.couch.auth(this.config.user, this.config.pass);
        try {
            await this.couch.db.create("global");
            console.log("Global database created.");
        } catch (error: any) {
            if (error.statusCode !== 412) {
                // 412 Precondition Failed means DB already exists
                throw error;
            }
        }

        // Initialize renderers on boot
        await this.initRenderers();
        await this.initManagers();
    }

    async initManagers() {
        // Find all manager documents across all user databases
        const allDbs = await this.getAllUserDbNames();
        for (const dbName of allDbs) {
            const db = this.couch.use(dbName);
            const result = await db.find({ selector: { type: "manager" } });
            for (const managerDoc of result.docs) {
                await this.handleManagerChange(managerDoc);
            }
        }
    }

    async initRenderers() {
        // Find all renderer documents across all user databases
        const allDbs = await this.getAllUserDbNames();
        for (const dbName of allDbs) {
            const db = this.couch.use(dbName);
            const result = await db.find({ selector: { type: "renderer" } });
            for (const rendererDoc of result.docs) {
                await this.handleRendererChange(rendererDoc);
            }
        }
    }

    private async reauthenticate() {
        await this.couch.auth(this.config.user, this.config.pass);
    }

    public getDb(instanceId: string): DocumentScope<any> {
        const dbName = getUserDbName(instanceId);
        return this.couch.use(dbName);
    }

    private async ensureTypeIndex(db: DocumentScope<any>) {
        try {
            await (db as any).createIndex({
                index: { fields: ["type"] },
                name: "idx_type",
                type: "json",
            });
        } catch (e) {
            // Ignore errors (e.g., index already exists or driver without createIndex)
        }
    }

    private async ensureIndex(db: DocumentScope<any>, fields: string[], name: string) {
        try {
            await (db as any).createIndex({
                index: { fields },
                name,
                type: "json",
            });
        } catch (e) {
            // Ignore errors (e.g., index already exists or driver without createIndex)
        }
    }

    async write(type: string, data: any, user: JwtPayload, appOrigin?: string) {
        // Prevent apps from writing renderer documents directly
        if (type === "renderer" && appOrigin) {
            throw new Error("Apps cannot write renderer documents directly. They must be defined in the manifest.");
        }
        if (type === "manager" && appOrigin) {
            throw new Error("Apps cannot write manager documents directly. They must be defined in the manifest.");
        }

        // Check app scope for write operation
        const requiredScope = `write:${type}`;
        const hasScope = await this.checkAppScope(user, appOrigin, requiredScope);
        if (!hasScope) {
            throw new Error(
                `App does not have permission to write to type '${type}'. Required scope: ${requiredScope}`
            );
        }

        await this.reauthenticate();
        const db = this.getDb(user.instanceId);
        const dbName = getUserDbName(user.instanceId);
        const itemsToProcess = Array.isArray(data) ? data : [data];

        const docs = await Promise.all(
            itemsToProcess.map(async (doc) => {
                if (!doc._id) {
                    doc._id = `${type}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
                } else {
                    try {
                        const existingDoc = await db.get(doc._id);
                        if (!(await this.verifyAccess(existingDoc, user, "write", dbName))) {
                            throw new Error(`User ${user.sub} does not have write access to ${doc._id}`);
                        }
                        doc._rev = existingDoc._rev;
                    } catch (error: any) {
                        if (error.statusCode !== 404) {
                            throw error;
                        }
                    }
                }
                doc.type = type;
                return doc;
            })
        );

        const response = await db.bulk({ docs });

        // After successful write, update the global database
        await Promise.all(
            response.map(async (result, index) => {
                if (result.error) {
                    console.error(`Error processing doc ${result.id}: ${result.error}`);
                    return;
                }
                const doc = itemsToProcess[index];
                const acl = doc.acl as Acl;
                const type = doc.type;
                const globalId = `${type}/${user.sub}/${doc._id.split("/")[1]}`;

                // Any ACL makes a document globally accessible, so it must be indexed.
                const isGloballyAccessible = acl && Object.keys(acl).length > 0;

                if (isGloballyAccessible) {
                    // Create or update the DocRef in the global database
                    const docRef = {
                        _id: globalId,
                        ref: {
                            did: user.sub,
                            ref: doc._id,
                        },
                        acl: doc.acl,
                    };
                    try {
                        const existing = await this.globalDb.get(globalId);
                        (docRef as any)._rev = existing._rev;
                    } catch (e: any) {
                        if (e.statusCode !== 404) throw e;
                    }
                    await this.globalDb.insert(docRef as any);
                    this.globalFeedService.publish(type, docRef.ref);
                } else {
                    // If no global read access, try to remove it from the global DB
                    try {
                        const existing = await this.globalDb.get(globalId);
                        await this.globalDb.destroy(globalId, existing._rev);
                    } catch (e: any) {
                        if (e.statusCode !== 404) {
                            // Don't throw if it's already gone, but log other errors
                            console.error(`Error removing DocRef ${globalId} from global db`, e);
                        }
                    }
                }
            })
        );

        // Handle renderer document creation/updates
        if (type === "renderer") {
            await this.handleRendererChange(docs[0]);
        }

        // Handle manager document creation/updates
        if (type === "manager") {
            await this.handleManagerChange(docs[0]);
        }

        return response;
    }

    private async handleRendererChange(rendererDoc: any) {
        try {
            const designDocId = `_design/${rendererDoc.rendererId}`;
            const designDoc = await this.compileRendererDesignDoc(rendererDoc);

            console.log(`Compiling design doc for renderer ${rendererDoc.rendererId}`);

            // Get existing design doc if it exists
            try {
                const existing = await this.globalDb.get(designDocId);
                (designDoc as any)._rev = existing._rev;
            } catch (error: any) {
                if (error.statusCode !== 404) {
                    throw error;
                }
            }

            // Insert/update the design document
            await this.globalDb.insert(designDoc);
            console.log(`Generated design doc ${designDocId} for renderer`);
        } catch (error) {
            console.error(`Failed to compile design doc for renderer ${rendererDoc._id}:`, error);
        }
    }

    private compileRendererDesignDoc(rendererDoc: any): any {
        if (!rendererDoc.enabled || !rendererDoc.rules || !rendererDoc.rules.all) {
            return {}; // Empty design doc for disabled renderers
        }

        // Compile the rules into JavaScript conditions
        const conditions = rendererDoc.rules.all.map((rule: any) => {
            return this.compileRuleToJS(rule);
        });

        const mapFunction = `
function (doc) {
    if (${conditions.join(" && ")}) {
        emit([doc.${rendererDoc.display.sortField || "createdAt"} || doc._id, doc._id], null);
    }
}`;

        return {
            _id: `_design/${rendererDoc.rendererId}`,
            views: {
                content: {
                    map: mapFunction,
                    reduce: "_count",
                },
            },
        };
    }

    private compileRuleToJS(rule: any): string {
        if (rule.eq && Array.isArray(rule.eq) && rule.eq.length === 2) {
            // Rule like: { "eq": ["type", "post"] }
            const [field, value] = rule.eq;
            return `doc.${field} === "${value}"`;
        } else if (rule.exists) {
            // Rule like: { "exists": "author" }
            return `doc.${rule.exists}`;
        } else {
            throw new Error(`Unsupported rule type: ${JSON.stringify(rule)}`);
        }
    }

    private async handleManagerChange(managerDoc: any) {
        try {
            const designDocId = `_design/${managerDoc.managerId}`;
            const designDoc = await this.compileManagerDesignDoc(managerDoc);

            console.log(`Compiling design doc for manager ${managerDoc.managerId}`);

            // Get existing design doc if it exists
            try {
                const existing = await this.globalDb.get(designDocId);
                (designDoc as any)._rev = existing._rev;
            } catch (error: any) {
                if (error.statusCode !== 404) {
                    throw error;
                }
            }

            // Insert/update the design document
            await this.globalDb.insert(designDoc);
            console.log(`Generated design doc ${designDocId} for manager`);
        } catch (error) {
            console.error(`Failed to compile design doc for manager ${managerDoc._id}:`, error);
        }
    }

    private compileManagerDesignDoc(managerDoc: any): any {
        if (!managerDoc.enabled || !managerDoc.rules || !managerDoc.rules.all) {
            return {}; // Empty design doc for disabled managers
        }

        // Compile the rules into JavaScript conditions
        const conditions = managerDoc.rules.all.map((rule: any) => {
            return this.compileRuleToJS(rule);
        });

        const mapFunction = `
function (doc) {
    if (${conditions.join(" && ")}) {
        emit([doc.${managerDoc.display.sortField || "createdAt"} || doc._id, doc._id], null);
    }
}`;

        return {
            _id: `_design/${managerDoc.managerId}`,
            views: {
                content: {
                    map: mapFunction,
                    reduce: "_count",
                },
            },
        };
    }

    async getAllUserDbNames(): Promise<string[]> {
        const allDbs = await this.couch.db.list();
        return allDbs.filter((db) => db.startsWith("userdb-"));
    }

    async readOnce<T extends Document>(
        type: string,
        query: any,
        user: JwtPayload,
        appOrigin?: string
    ): Promise<ReadOnceApiResponse<T>> {
        // Check app scope for read operation
        const requiredScope = `read:${type}`;
        const hasScope = await this.checkAppScope(user, appOrigin, requiredScope);
        if (!hasScope) {
            throw new Error(`App does not have permission to read type '${type}'. Required scope: ${requiredScope}`);
        }

        await this.reauthenticate();
        // TODO make sure deconstruction of query is same in hub.html and keep in sync
        const { expand, maxCacheAge, global, limit, fields, sort, ...rest } = query || {};
        const selector = rest || {};

        if (global) {
            console.log(`[data.ts] Performing global query for type '${type}' with selector:`, selector);
            const dbQuery = {
                selector: {
                    _id: {
                        $gte: `${type}/`,
                        $lt: `${type}/\ufff0`,
                    },
                    // TODO make sure global db always store full document but only return as DocRef so we can do selector queries
                    // for now it is stored as DocRefs and the _id prefix is the sole filter for types.
                },
            };
            console.log("[data.ts] Executing global DB query:", JSON.stringify(dbQuery, null, 2));

            // The server's only job is to return the list of DocRefs.
            // All expansion and access control will be handled by the client,
            // leveraging its cache and the secure `/data/expand` endpoint.
            const result = await this.globalDb.find(dbQuery);
            return { docs: result.docs as T[] };
        } else {
            const db = this.getDb(user.instanceId);
            const dbName = getUserDbName(user.instanceId);

            // Fast path: direct _id lookup uses primary index and avoids Mango index issues
            if (selector && typeof selector === "object" && (selector as any)._id) {
                try {
                    const doc = await db.get((selector as any)._id);
                    if (await this.verifyAccess(doc, user, "read", dbName)) {
                        const docs = [doc] as any[];
                        if (expand && expand.length > 0) {
                            const edocs = await this._expand(docs, expand, user, maxCacheAge);
                            return { docs: edocs as T[] };
                        }
                        return { docs: docs as T[] };
                    }
                    return { docs: [] as T[] };
                } catch (e: any) {
                    // Not found or unauthorized; return empty result
                    return { docs: [] as T[] };
                }
            }

            // General Mango find with type constraint
            let dbQuery: any = { selector: {} };
            dbQuery.selector = {
                ...selector,
                type: type,
            };
            await this.ensureTypeIndex(db);

            if (typeof limit === "number" && isFinite(limit)) dbQuery.limit = Math.max(1, Math.min(limit, 20000));
            if (Array.isArray(fields)) dbQuery.fields = fields;
            if (Array.isArray(sort) || (sort && typeof sort === "object")) dbQuery.sort = sort as any;
            const result = await db.find(dbQuery);

            let docsToProcess: any[] = result.docs as any[];

            // Fallback: if querying "files" returns 0 results, scan all docs and filter heuristically.
            // This helps surface legacy documents that may lack expected indexes/fields (e.g., missing "type").
            if ((!Array.isArray(docsToProcess) || docsToProcess.length === 0) && type === "files") {
                try {
                    const listRes = await (db as any).list({
                        include_docs: true,
                        limit: Math.min(typeof limit === "number" ? limit : 5000, 20000),
                    });
                    const allDocs = ((listRes?.rows as any[]) || []).map((r) => r?.doc).filter(Boolean);
                    // Heuristic: treat docs as files if they have any of these indicators
                    docsToProcess = allDocs.filter(
                        (d) => !!(d.storageKey || d.mimeType || d.mime || (d.name && d.size))
                    );
                } catch (e) {
                    // ignore fallback failure; we'll return original (empty)
                    docsToProcess = result.docs as any[];
                }
            }

            const accessibleDocs: T[] = [];
            for (const doc of docsToProcess) {
                if (await this.verifyAccess(doc, user, "read", dbName)) {
                    accessibleDocs.push(doc as unknown as T);
                }
            }

            if (expand && expand.length > 0) {
                const docs = await this._expand(accessibleDocs, expand, user, maxCacheAge);
                return { docs: docs as T[] };
            }

            return { docs: accessibleDocs };
        }
    }

    private async _expand(docs: any[], expand: string[], currentUser: JwtPayload, maxCacheAge?: number) {
        const currentUserDb = this.getDb(currentUser.instanceId);

        const expandOneRef = async (ref: DocRef): Promise<any | undefined> => {
            if (!ref || !ref.did || !ref.ref) return undefined;

            // Local user fast path
            if (ref.did === currentUser.sub) {
                try {
                    return await currentUserDb.get(ref.ref);
                } catch (error) {
                    console.error(`Failed to expand local ref ${ref.ref}`, error);
                    return undefined;
                }
            }

            // Remote with cache
            const cacheId = `cache/${ref.did}/${ref.ref}`;
            let existingCacheItem: CachedDoc<any> | null = null;
            try {
                existingCacheItem = (await currentUserDb.get(cacheId)) as CachedDoc<any>;
            } catch (error: any) {
                if (error.statusCode !== 404) console.error("Error reading from cache:", error);
            }

            const isCacheFresh = () => {
                if (!existingCacheItem) return false;
                if (maxCacheAge === 0) return false;
                if (maxCacheAge === undefined) return true;
                const age = (Date.now() - existingCacheItem.cachedAt) / 1000;
                return age <= maxCacheAge;
            };

            if (isCacheFresh()) {
                return existingCacheItem!.data;
            }

            const remoteUser = await this.identityService.findByDid(ref.did);
            if (remoteUser) {
                const remoteDb = this.getDb(remoteUser.instanceId);
                try {
                    const freshDoc = await remoteDb.get(ref.ref);

                    const newCacheItem: CachedDoc<any> = {
                        _id: cacheId,
                        _rev: existingCacheItem?._rev,
                        type: "cache",
                        data: freshDoc,
                        cachedAt: Date.now(),
                        originalDid: ref.did,
                        originalRef: ref.ref,
                    };
                    await currentUserDb.insert(newCacheItem as any);
                    return freshDoc;
                } catch (error) {
                    console.error(`Failed to expand remote ref ${ref.ref}`, error);
                }
            }
            return undefined;
        };

        const promises = docs.map(async (doc) => {
            const expandedDoc = { ...doc };
            for (const field of expand) {
                const value = doc[field];

                // Case 1: Single DocRef
                if (value && typeof value === "object" && "ref" in value && "did" in value) {
                    const expanded = await expandOneRef(value as DocRef);
                    if (expanded) expandedDoc[field] = expanded;
                    continue;
                }

                // Case 2: Array of DocRefs
                if (Array.isArray(value)) {
                    const expandedArray: any[] = [];
                    for (const entry of value) {
                        if (entry && typeof entry === "object" && "ref" in entry && "did" in entry) {
                            const expanded = await expandOneRef(entry as DocRef);
                            if (expanded) {
                                expandedArray.push(expanded);
                            } else {
                                // Preserve placeholder if expansion fails; UI may still derive previews
                                expandedArray.push(entry);
                            }
                        } else {
                            expandedArray.push(entry);
                        }
                    }
                    expandedDoc[field] = expandedArray;
                }
            }
            return expandedDoc;
        });

        return Promise.all(promises);
    }

    async update(type: string, data: any, user: JwtPayload) {
        await this.reauthenticate();
        const db = this.getDb(user.instanceId);
        const dbName = getUserDbName(user.instanceId);
        const itemsToProcess = Array.isArray(data) ? data : [data];

        const docs = await Promise.all(
            itemsToProcess.map(async (doc) => {
                if (!doc._id) {
                    throw new Error("Document must have an _id to be updated.");
                }
                const existing = await db.get(doc._id);
                if (!(await this.verifyAccess(existing, user, "write", dbName))) {
                    throw new Error(`User ${user.sub} does not have write access to ${doc._id}`);
                }
                doc._rev = existing._rev;
                doc.type = type;
                return doc;
            })
        );

        const response = await db.bulk({ docs });

        // After successful update, also update the global database
        await Promise.all(
            response.map(async (result, index) => {
                if (result.error) {
                    console.error(`Error processing doc ${result.id}: ${result.error}`);
                    return;
                }
                const doc = itemsToProcess[index];
                const acl = doc.acl as Acl;
                const type = doc.type;
                const globalId = `${type}/${user.sub}/${doc._id.split("/")[1]}`;

                // Any ACL makes a document globally accessible, so it must be indexed.
                const isGloballyAccessible = acl && Object.keys(acl).length > 0;

                if (isGloballyAccessible) {
                    const docRef = {
                        _id: globalId,
                        ref: {
                            did: user.sub,
                            ref: doc._id,
                        },
                        acl: doc.acl,
                    };
                    try {
                        const existing = await this.globalDb.get(globalId);
                        (docRef as any)._rev = existing._rev;
                    } catch (e: any) {
                        if (e.statusCode !== 404) throw e;
                    }
                    await this.globalDb.insert(docRef as any);
                    this.globalFeedService.publish(type, docRef.ref);
                } else {
                    try {
                        const existing = await this.globalDb.get(globalId);
                        await this.globalDb.destroy(globalId, existing._rev);
                    } catch (e: any) {
                        if (e.statusCode !== 404) {
                            console.error(`Error removing DocRef ${globalId} from global db`, e);
                        }
                    }
                }
            })
        );
        return response;
    }

    private async verifyAccess(
        doc: any,
        user: JwtPayload,
        permission: "read" | "write" | "create",
        dbName: string
    ): Promise<boolean> {
        const docInstanceId = dbName.replace("userdb-", "");
        if (docInstanceId === user.instanceId) {
            return true;
        }

        const acl = doc.acl as Acl;

        if (!acl) {
            return false;
        }

        const aclPermission = acl[permission];
        if (!aclPermission) {
            return false;
        }

        const userCerts = await this.getUserCertificates(user.instanceId);
        const verifiedCerts = await this._verifyAndDecodeCerts(userCerts.map((c) => c.signature));

        if (aclPermission.deny && this._checkAcl(aclPermission.deny, user.sub, verifiedCerts)) {
            return false;
        }

        if (aclPermission.allow && this._checkAcl(aclPermission.allow, user.sub, verifiedCerts)) {
            return true;
        }

        return false;
    }

    public async getUserCertificates(instanceId: string): Promise<Certificate[]> {
        try {
            const db = this.getDb(instanceId);
            await this.ensureTypeIndex(db);
            const result = await db.find({ selector: { type: "certs" } });
            return result.docs as any[];
        } catch (e) {
            console.error("Could not fetch user certificates", e);
            return [];
        }
    }

    private async _verifyAndDecodeCerts(certs: string[]): Promise<VerifiedCert[]> {
        const verifiedCerts: VerifiedCert[] = [];
        for (const cert of certs) {
            try {
                const payload = jose.decodeJwt(cert) as CertJwtPayload;
                if (!payload.iss) continue;

                const issuer = await this.identityService.findByDid(payload.iss);
                if (!issuer) continue;

                const spkiPem = publicKeyHexToSpkiPem(issuer.publicKey);
                const publicKey = await jose.importSPKI(spkiPem, "EdDSA");
                await jose.compactVerify(cert, publicKey);

                if (payload.exp && payload.exp < Date.now() / 1000) {
                    continue;
                }

                const issuerDb = this.getDb(issuer.instanceId);
                try {
                    const certId = payload.jti;
                    if (certId) {
                        await issuerDb.get(`revocations/${certId}`);
                        continue;
                    }
                } catch (error: any) {
                    if (error.statusCode !== 404) {
                        console.error("Error checking revocation", error);
                    }
                }

                verifiedCerts.push({ payload, raw: cert });
            } catch (e) {
                console.warn("Presented certificate failed verification:", e);
            }
        }
        return verifiedCerts;
    }

    private _checkAcl(rules: (AclRule | AclRule[])[], userDid: string, verifiedCerts: VerifiedCert[]): boolean {
        return rules.some((rule) => {
            if (Array.isArray(rule)) {
                return rule.every((subRule) => this._matchRule(subRule, userDid, verifiedCerts));
            }
            return this._matchRule(rule, userDid, verifiedCerts);
        });
    }

    private _matchRule(rule: AclRule, userDid: string, verifiedCerts: VerifiedCert[]): boolean {
        if (typeof rule === "string") {
            if (rule === "*") return true;
            return rule === userDid;
        }
        return verifiedCerts.some(
            (cert) =>
                cert.payload.sub === userDid && cert.payload.iss === rule.issuer && cert.payload.type === rule.type
        );
    }

    /**
     * Check if the app has the required scope for the operation
     */
    private async checkAppScope(
        user: JwtPayload,
        appOrigin: string | undefined,
        requiredScope: string
    ): Promise<boolean> {
        // If no app origin (internal operations), allow
        if (!appOrigin) return true;

        // Get user's consents for this app
        const consents = await this.identityService.listUserConsents(user.sub);
        const consent = consents.find((c) => c.origin === appOrigin || c.clientId === appOrigin);

        if (!consent || !consent.scopes) return false;

        // Check if any of the consented scopes match the required scope
        return consent.scopes.some((scope: string) => {
            // Exact match
            if (scope === requiredScope) return true;

            // Wildcard match (e.g., "read:*" matches "read:profiles")
            if (scope.endsWith(":*")) {
                const scopePrefix = scope.slice(0, -1); // Remove :*
                return requiredScope.startsWith(scopePrefix);
            }

            return false;
        });
    }
}
