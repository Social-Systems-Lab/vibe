import nano, { DocumentScope } from "nano";
import { getUserDbName } from "../lib/db";
import { IdentityService } from "./identity";
import { CachedDoc, DocRef, Certificate, Acl, AclPermission, AclRule, publicKeyHexToSpkiPem, Document, ReadOnceApiResponse } from "vibe-core";
import * as jose from "jose";

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

    public getDb(instanceId: string): DocumentScope<any> {
        const dbName = getUserDbName(instanceId);
        return this.couch.use(dbName);
    }

    async write(collection: string, data: any, user: JwtPayload) {
        await this.reauthenticate();
        const db = this.getDb(user.instanceId);
        const dbName = getUserDbName(user.instanceId);
        const itemsToProcess = Array.isArray(data) ? data : [data];

        const docs = await Promise.all(
            itemsToProcess.map(async (doc) => {
                if (!doc._id) {
                    doc._id = `${collection}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
                doc.collection = collection;
                return doc;
            })
        );

        const response = await db.bulk({ docs });
        return response;
    }

    async getAllUserDbNames(): Promise<string[]> {
        const allDbs = await this.couch.db.list();
        return allDbs.filter((db) => db.startsWith("userdb-"));
    }

    async readOnce<T extends Document>(collection: string, query: any, user: JwtPayload): Promise<ReadOnceApiResponse<T>> {
        await this.reauthenticate();
        const { expand, maxCacheAge, global, ...selector } = query;

        if (global) {
            const dbNames = await this.getAllUserDbNames();
            const allDocs: T[] = [];

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
                    const accessibleDocs: T[] = [];
                    for (const doc of result.docs) {
                        if (await this.verifyAccess(doc, user, "read", dbName)) {
                            accessibleDocs.push(doc as unknown as T);
                        }
                    }
                    allDocs.push(...accessibleDocs);
                } catch (error) {
                    console.error(`Error querying database ${dbName}:`, error);
                }
            }

            if (expand && expand.length > 0) {
                const docs = await this._expand(allDocs, expand, user, maxCacheAge);
                return { docs: docs as T[] };
            }

            return { docs: allDocs };
        } else {
            const db = this.getDb(user.instanceId);
            const dbName = getUserDbName(user.instanceId);
            const dbQuery = {
                selector: {
                    ...selector,
                    collection: collection,
                },
            };
            const result = await db.find(dbQuery);

            const accessibleDocs: T[] = [];
            for (const doc of result.docs) {
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

        const promises = docs.map(async (doc) => {
            const expandedDoc = { ...doc };
            for (const field of expand) {
                const ref = doc[field] as DocRef;
                if (!ref || !ref.did || !ref.ref) continue;

                if (ref.did === currentUser.sub) {
                    try {
                        expandedDoc[field] = await currentUserDb.get(ref.ref);
                    } catch (error) {
                        console.error(`Failed to expand local ref ${field} for doc ${doc._id}`, error);
                    }
                    continue;
                }

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
                    expandedDoc[field] = existingCacheItem!.data;
                } else {
                    const remoteUser = await this.identityService.findByDid(ref.did);
                    if (remoteUser) {
                        const remoteDb = this.getDb(remoteUser.instanceId);
                        try {
                            const freshDoc = await remoteDb.get(ref.ref);
                            expandedDoc[field] = freshDoc;

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
                doc.collection = collection;
                return doc;
            })
        );

        const response = await db.bulk({ docs });
        return response;
    }

    private async verifyAccess(doc: any, user: JwtPayload, permission: "read" | "write" | "create", dbName: string): Promise<boolean> {
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

    private async getUserCertificates(instanceId: string): Promise<Certificate[]> {
        try {
            const db = this.getDb(instanceId);
            const result = await db.find({ selector: { collection: "certs" } });
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
        return verifiedCerts.some((cert) => cert.payload.sub === userDid && cert.payload.iss === rule.issuer && cert.payload.type === rule.type);
    }
}
