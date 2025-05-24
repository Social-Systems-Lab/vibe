import * as SessionManager from "../session-manager";
import { getLocalUserDataDb } from "../../lib/pouchdb"; // Generic PouchDB instance getter
import { v4 as uuidv4 } from "uuid"; // For generating document IDs
import PouchDB from "pouchdb-core";

// Define a generic document type that PouchDB expects, including common fields
interface GenericDoc {
    _id: string;
    _rev?: string;
    type: string; // Will correspond to 'collection'
    userDid: string;
    createdAt: string;
    updatedAt: string;
    [key: string]: any; // Allow other app-specific fields
}

// Store for active PouchDB changes feeds for subscriptions
const activeSubscriptions: Map<string, PouchDB.Core.Changes<GenericDoc>> = new Map();
// Store for heartbeat interval IDs, keyed by subscriptionId
const heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
const HEARTBEAT_INTERVAL_MS = 25 * 1000; // 25 seconds

export async function handleReadDataOnce(payload: any, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; data?: GenericDoc[]; error?: string }> {
    const { collection, filter } = payload;
    const origin = sender.origin;
    const activeDid = SessionManager.currentActiveDid;

    if (!activeDid) {
        return { ok: false, error: "No active identity. Cannot read data." };
    }
    if (!collection) {
        return { ok: false, error: "Collection name is required." };
    }

    console.log(`[BG] READ_DATA_ONCE: collection='${collection}', origin='${origin}', activeDid='${activeDid}', filter:`, filter);

    // TODO: Implement actual permission check based on origin, appId (from session), and activeDid
    // For now, allow any collection for testing, but this needs to be secured.
    // if (collection !== "notes") { // Example of previous specific check
    //     console.warn(`[BG] READ_DATA_ONCE: Access denied for collection '${collection}'. Only 'notes' allowed for now.`);
    //     return { ok: false, error: `Access to collection '${collection}' is not currently allowed.` };
    // }

    const db = getLocalUserDataDb(activeDid);
    if (!db) {
        return { ok: false, error: `PouchDB instance not found for user ${activeDid}` };
    }

    try {
        let dataToReturn: GenericDoc[] = [];
        if (filter?.id) {
            // Read a single document by ID
            const doc = await db.get<GenericDoc>(filter.id);
            // Verify type (collection) and userDid for security/scoping
            if (doc && doc.type === collection && doc.userDid === activeDid) {
                dataToReturn = [doc];
            } else if (doc) {
                console.warn(`[BG] READ_DATA_ONCE: Document ${filter.id} found, but type/userDid mismatch. DocType: ${doc.type}, DocUserDID: ${doc.userDid}`);
                // Do not return the doc if it doesn't match expected scope
            }
        } else if (filter?.ids && Array.isArray(filter.ids)) {
            // Read multiple documents by IDs
            const docs: GenericDoc[] = [];
            for (const id of filter.ids) {
                try {
                    const doc = await db.get<GenericDoc>(id);
                    if (doc && doc.type === collection && doc.userDid === activeDid) {
                        docs.push(doc);
                    } else if (doc) {
                        console.warn(`[BG] READ_DATA_ONCE: Document ${id} found, but type/userDid mismatch. DocType: ${doc.type}, DocUserDID: ${doc.userDid}`);
                    }
                } catch (getByIdError: any) {
                    if (getByIdError.name !== "not_found") {
                        console.error(`[BG] READ_DATA_ONCE: Error fetching doc ${id}:`, getByIdError);
                    } // Ignore not_found for individual IDs in a list
                }
            }
            dataToReturn = docs;
        } else {
            // Read all documents for the collection (type) and userDid
            // This requires pouchdb-find and an index on ['type', 'userDid'] for efficiency
            // Example: await db.createIndex({ index: { fields: ['type', 'userDid'] } });
            const findResult = await db.find({
                selector: { type: collection, userDid: activeDid, ...filter?.selector }, // Allow additional selector from filter
            });
            dataToReturn = findResult.docs as GenericDoc[];
        }

        console.log(`[BG] READ_DATA_ONCE: Returning ${dataToReturn.length} documents from '${collection}' for DID ${activeDid}.`);
        return { ok: true, data: dataToReturn };
    } catch (error: any) {
        console.error(`[BG] READ_DATA_ONCE: Error reading collection '${collection}' from PouchDB:`, error);
        return { ok: false, error: error.message || "Failed to read data from PouchDB." };
    }
}

export async function handleWriteData(
    payload: any,
    sender: chrome.runtime.MessageSender
): Promise<{ ok: boolean; ids?: string[]; revs?: string[]; errors?: any[] }> {
    const { collection, data } = payload; // data can be a single object or an array.
    const origin = sender.origin;
    const activeDid = SessionManager.currentActiveDid;

    if (!activeDid) {
        return { ok: false, errors: [{ error: "No active identity. Cannot write data." }] };
    }
    if (!collection) {
        return { ok: false, errors: [{ error: "Collection name is required." }] };
    }
    if (!data) {
        return { ok: false, errors: [{ error: "Data to write is required." }] };
    }

    console.log(`[BG] WRITE_DATA: collection='${collection}', origin='${origin}', activeDid='${activeDid}', data:`, data);

    // TODO: Implement actual permission check
    // if (collection !== "notes") { // Example of previous specific check
    //     console.warn(`[BG] WRITE_DATA: Access denied for collection '${collection}'. Only 'notes' allowed for now.`);
    //     return { ok: false, errors: [{ error: `Access to collection '${collection}' is not currently allowed.` }] };
    // }

    const db = getLocalUserDataDb(activeDid);
    if (!db) {
        return { ok: false, errors: [{ error: `PouchDB instance not found for user ${activeDid}` }] };
    }

    try {
        const itemsToProcess = Array.isArray(data) ? data : [data];
        const resultIds: string[] = [];
        const resultRevs: string[] = [];
        const processErrors: any[] = [];

        for (const rawItem of itemsToProcess) {
            const itemOperation = rawItem.operation; // e.g., 'delete'
            const itemData = { ...rawItem }; // Clone item data
            if ("operation" in itemData) {
                delete itemData.operation; // Remove operation from data to be stored
            }

            try {
                if (itemOperation === "delete") {
                    if (!itemData._id) {
                        processErrors.push({ error: "Document _id is required for delete operation.", item: itemData });
                        continue;
                    }
                    try {
                        const docToDelete = await db.get<GenericDoc>(itemData._id);
                        if (docToDelete.userDid !== activeDid || docToDelete.type !== collection) {
                            processErrors.push({ error: `Document ${itemData._id} does not belong to active user/collection. Cannot delete.` });
                            continue;
                        }
                        const deleteResponse = await db.remove(docToDelete);
                        resultIds.push(deleteResponse.id);
                        if (deleteResponse.rev) resultRevs.push(deleteResponse.rev);
                        console.log(`[BG] WRITE_DATA (delete): Deleted doc ID ${deleteResponse.id} from '${collection}'.`);
                    } catch (getError) {
                        processErrors.push({ error: `Failed to fetch document ${itemData._id} for deletion.`, details: getError });
                    }
                } else {
                    // Upsert operation
                    const now = new Date().toISOString();
                    let docToSave: GenericDoc;

                    if (itemData._id) {
                        // Update existing document
                        try {
                            const existingDoc = await db.get<GenericDoc>(itemData._id);
                            if (existingDoc.userDid !== activeDid || existingDoc.type !== collection) {
                                processErrors.push({ error: `Document ${itemData._id} does not belong to active user/collection. Cannot update.` });
                                continue;
                            }
                            docToSave = {
                                ...existingDoc,
                                ...itemData,
                                updatedAt: now,
                                // Ensure type and userDid are not overwritten by malicious payload
                                type: collection,
                                userDid: activeDid,
                            };
                        } catch (getError: any) {
                            if (getError.name === "not_found") {
                                // Doc ID provided but not found, treat as new doc with specified ID
                                docToSave = {
                                    ...itemData,
                                    _id: itemData._id, // Use provided _id
                                    type: collection,
                                    userDid: activeDid,
                                    createdAt: now,
                                    updatedAt: now,
                                };
                            } else {
                                throw getError; // Re-throw other get errors
                            }
                        }
                    } else {
                        // Create new document
                        docToSave = {
                            ...itemData,
                            _id: `${collection}:${uuidv4()}`, // Generate new ID
                            type: collection,
                            userDid: activeDid,
                            createdAt: now,
                            updatedAt: now,
                        };
                    }

                    const upsertResponse = await db.put(docToSave);
                    resultIds.push(upsertResponse.id);
                    if (upsertResponse.rev) resultRevs.push(upsertResponse.rev);
                    console.log(`[BG] WRITE_DATA (upsert): Upserted doc ID ${upsertResponse.id} to '${collection}'.`);
                }
            } catch (singleItemError: any) {
                console.error(`[BG] WRITE_DATA: Error processing item in '${collection}':`, singleItemError, "Item:", itemData);
                processErrors.push({ error: singleItemError.message || "Failed to process item.", item: itemData });
            }
        }

        if (processErrors.length > 0) {
            // If some succeeded and some failed, ok might still be true if resultIds has items.
            // Client needs to check errors array.
            return { ok: resultIds.length > 0, ids: resultIds, revs: resultRevs, errors: processErrors };
        }
        return { ok: true, ids: resultIds, revs: resultRevs };
    } catch (error: any) {
        // Catch errors from the main try block (e.g., if activeDid is missing early)
        console.error(`[BG] WRITE_DATA: General error writing to collection '${collection}':`, error);
        return { ok: false, errors: [{ error: error.message || "General failure to write data." }] };
    }
}

// Handles setting up a live subscription to data changes.
// The actual sending of updates will be managed by message-handler.ts, which will call this
// and then use the provided port to send ongoing messages.
export async function handleReadDataSubscription(
    payload: any,
    sender: chrome.runtime.MessageSender,
    port: chrome.runtime.Port // Port to send updates back to the content script
): Promise<{ ok: boolean; subscriptionId?: string; initialData?: GenericDoc[]; error?: string }> {
    const { collection, filter } = payload;
    const origin = sender.origin;
    const tabId = sender.tab?.id;
    const activeDid = SessionManager.currentActiveDid;

    if (!activeDid) {
        return { ok: false, error: "No active identity. Cannot subscribe to data." };
    }
    if (!collection) {
        return { ok: false, error: "Collection name is required for subscription." };
    }
    if (!tabId) {
        return { ok: false, error: "Tab ID is required for subscription." };
    }

    console.log(`[BG] READ_DATA_SUBSCRIPTION: collection='${collection}', origin='${origin}', tabId=${tabId}, activeDid='${activeDid}', filter:`, filter);

    // TODO: Implement actual permission check for 'read' on the collection

    const db = getLocalUserDataDb(activeDid);
    if (!db) {
        return { ok: false, error: `PouchDB instance not found for user ${activeDid}` };
    }

    const subscriptionId = `sub:${tabId}:${collection}:${uuidv4()}`;

    try {
        // Fetch initial data to send immediately
        const findSelector = { type: collection, userDid: activeDid, ...filter?.selector };
        const initialFindResult = await db.find({ selector: findSelector });
        const initialData = initialFindResult.docs as GenericDoc[];

        console.log(`[BG] READ_DATA_SUBSCRIPTION: Initial data for ${subscriptionId} - ${initialData.length} docs.`);

        const changesFeed = db
            .changes<GenericDoc>({
                // Explicitly type the changes feed
                live: true,
                since: "now",
                include_docs: false, // We'll re-fetch to ensure consistency with selector
                selector: findSelector, // Apply selector directly if PouchDB version supports it well for changes
            })
            .on("change", async (change) => {
                console.log(`[BG] READ_DATA_SUBSCRIPTION: Change detected for ${subscriptionId}:`, change);
                // Re-fetch data based on the original filter to ensure consistency
                // This is simpler than trying to incrementally update the client-side state from `change.doc`
                // especially if the change might affect whether a doc matches the filter or not.
                try {
                    const updatedFindResult = await db.find({ selector: findSelector });
                    const updatedData = updatedFindResult.docs as GenericDoc[];
                    console.log(`[BG] READ_DATA_SUBSCRIPTION: Posting update for ${subscriptionId}, ${updatedData.length} docs.`);
                    port.postMessage({ type: "VIBE_SUBSCRIPTION_UPDATE", subscriptionId, data: updatedData, ok: true });
                } catch (fetchError: any) {
                    console.error(`[BG] READ_DATA_SUBSCRIPTION: Error fetching updated data for ${subscriptionId}:`, fetchError);
                    port.postMessage({
                        type: "VIBE_SUBSCRIPTION_UPDATE",
                        subscriptionId,
                        error: fetchError.message || "Failed to fetch updated data.",
                        ok: false,
                    });
                }
            })
            .on("error", (err) => {
                console.error(`[BG] READ_DATA_SUBSCRIPTION: Error on changes feed for ${subscriptionId}:`, err);
                // Notify client about the error. The subscription might be dead now.
                port.postMessage({ type: "VIBE_SUBSCRIPTION_ERROR", subscriptionId, error: "Subscription encountered an error.", ok: false });
                // Clean up this subscription
                if (activeSubscriptions.has(subscriptionId)) {
                    activeSubscriptions.get(subscriptionId)?.cancel();
                    activeSubscriptions.delete(subscriptionId);
                    // Clear heartbeat if it exists for this errored subscription
                    if (heartbeatIntervals.has(subscriptionId)) {
                        clearInterval(heartbeatIntervals.get(subscriptionId)!);
                        heartbeatIntervals.delete(subscriptionId);
                        console.log(`[BG] READ_DATA_SUBSCRIPTION: Cleared heartbeat for errored subscription ${subscriptionId}.`);
                    }
                    console.log(`[BG] READ_DATA_SUBSCRIPTION: Cleaned up errored subscription ${subscriptionId}.`);
                }
            });

        activeSubscriptions.set(subscriptionId, changesFeed);

        // Start heartbeat for this subscription
        const heartbeatIntervalId = setInterval(() => {
            if (activeSubscriptions.has(subscriptionId) && port) {
                // Check if port still exists
                try {
                    port.postMessage({ type: "VIBE_HEARTBEAT", subscriptionId });
                    console.log(`[BG] Sent heartbeat for subscription ${subscriptionId}`);
                } catch (e) {
                    console.warn(`[BG] Error sending heartbeat for ${subscriptionId}, port might be closed:`, e);
                    // If sending heartbeat fails, the port is likely dead. Clean up.
                    changesFeed.cancel();
                    activeSubscriptions.delete(subscriptionId);
                    clearInterval(heartbeatIntervalId); // Clear this interval
                    heartbeatIntervals.delete(subscriptionId);
                    console.log(`[BG] Cleaned up subscription ${subscriptionId} due to heartbeat send failure.`);
                }
            } else {
                // Subscription or port no longer exists, clear interval
                clearInterval(heartbeatIntervalId);
                heartbeatIntervals.delete(subscriptionId); // Ensure it's removed if somehow missed
            }
        }, HEARTBEAT_INTERVAL_MS);
        heartbeatIntervals.set(subscriptionId, heartbeatIntervalId);

        console.log(`[BG] READ_DATA_SUBSCRIPTION: Subscription ${subscriptionId} established for collection '${collection}'. Heartbeat started.`);

        // Return subscriptionId and initial data
        return { ok: true, subscriptionId, initialData };
    } catch (error: any) {
        console.error(`[BG] READ_DATA_SUBSCRIPTION: Error setting up subscription for '${collection}':`, error);
        return { ok: false, error: error.message || "Failed to set up data subscription." };
    }
}

export async function handleUnsubscribeDataSubscription(payload: any): Promise<{ ok: boolean; error?: string }> {
    const { subscriptionId } = payload;

    if (!subscriptionId) {
        return { ok: false, error: "Subscription ID is required to unsubscribe." };
    }

    const changesFeed = activeSubscriptions.get(subscriptionId);
    if (changesFeed) {
        changesFeed.cancel();
        activeSubscriptions.delete(subscriptionId);
        // Clear heartbeat
        if (heartbeatIntervals.has(subscriptionId)) {
            clearInterval(heartbeatIntervals.get(subscriptionId)!);
            heartbeatIntervals.delete(subscriptionId);
            console.log(`[BG] UNSUBSCRIBE_DATA_SUBSCRIPTION: Cleared heartbeat for ${subscriptionId}.`);
        }
        console.log(`[BG] UNSUBSCRIBE_DATA_SUBSCRIPTION: Subscription ${subscriptionId} cancelled.`);
        return { ok: true };
    } else {
        console.warn(`[BG] UNSUBSCRIBE_DATA_SUBSCRIPTION: Subscription ${subscriptionId} not found or already cancelled.`);
        // Ensure heartbeat is also cleared if somehow orphaned
        if (heartbeatIntervals.has(subscriptionId)) {
            clearInterval(heartbeatIntervals.get(subscriptionId)!);
            heartbeatIntervals.delete(subscriptionId);
        }
        return { ok: false, error: "Subscription not found or already cancelled." };
    }
}

export function cleanupSubscriptionsForTab(tabId: number): void {
    if (!tabId) return;
    let cleanedCount = 0;
    for (const [subscriptionId, changesFeed] of activeSubscriptions.entries()) {
        // Subscription ID format is `sub:${tabId}:${collection}:${uuidv4()}`
        const parts = subscriptionId.split(":");
        if (parts.length > 1 && parts[0] === "sub" && parseInt(parts[1], 10) === tabId) {
            changesFeed.cancel();
            activeSubscriptions.delete(subscriptionId);
            // Clear heartbeat
            if (heartbeatIntervals.has(subscriptionId)) {
                clearInterval(heartbeatIntervals.get(subscriptionId)!);
                heartbeatIntervals.delete(subscriptionId);
                console.log(`[BG] cleanupSubscriptionsForTab: Cleared heartbeat for ${subscriptionId}.`);
            }
            cleanedCount++;
            console.log(`[BG] Cleaned up subscription ${subscriptionId} for disconnected tab ${tabId}.`);
        }
    }
    if (cleanedCount > 0) {
        console.log(`[BG] Total ${cleanedCount} subscriptions cleaned up for tab ${tabId}.`);
    }
}
