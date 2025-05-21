import * as Types from "../types";
import * as SessionManager from "../session-manager";
// import * as Constants from "../constants"; // If needed for storage keys later

// Mock in-memory database for now
// Keyed by identity DID, then by collection name
const mockGlobalDb: Record<string, Record<string, Types.Note[]>> = {};

function getDbForIdentity(identityDid: string): Record<string, Types.Note[]> {
    if (!mockGlobalDb[identityDid]) {
        mockGlobalDb[identityDid] = {};
    }
    return mockGlobalDb[identityDid];
}

function getCollectionForIdentity(identityDid: string, collectionName: string): Types.Note[] {
    const identityDb = getDbForIdentity(identityDid);
    if (!identityDb[collectionName]) {
        identityDb[collectionName] = [];
    }
    return identityDb[collectionName];
}

export async function handleReadDataOnce(payload: any, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; data?: any[]; error?: string }> {
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
    // For now, assume 'notes' collection is allowed for simplicity.
    if (collection !== "notes") {
        console.warn(`[BG] READ_DATA_ONCE: Access denied for collection '${collection}'. Only 'notes' allowed for now.`);
        return { ok: false, error: `Access to collection '${collection}' is not currently allowed.` };
    }

    try {
        const notesCollection = getCollectionForIdentity(activeDid, collection);
        let dataToReturn = [...notesCollection]; // Return a copy

        // Basic filtering by ID if provided (more complex filtering later)
        if (filter?.ids && Array.isArray(filter.ids)) {
            dataToReturn = dataToReturn.filter((doc) => doc._id && filter.ids.includes(doc._id));
        }

        console.log(`[BG] READ_DATA_ONCE: Returning ${dataToReturn.length} documents from '${collection}' for DID ${activeDid}.`);
        return { ok: true, data: dataToReturn };
    } catch (error: any) {
        console.error(`[BG] READ_DATA_ONCE: Error reading collection '${collection}':`, error);
        return { ok: false, error: error.message || "Failed to read data." };
    }
}

export async function handleWriteData(payload: any, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; ids?: string[]; errors?: any[] }> {
    const { collection, data } = payload; // data can be a single object or an array
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
    if (collection !== "notes") {
        console.warn(`[BG] WRITE_DATA: Access denied for collection '${collection}'. Only 'notes' allowed for now.`);
        return { ok: false, errors: [{ error: `Access to collection '${collection}' is not currently allowed.` }] };
    }

    try {
        const notesCollection = getCollectionForIdentity(activeDid, collection);
        const itemsToWrite = Array.isArray(data) ? data : [data];
        const createdIds: string[] = [];
        const writeErrors: any[] = [];

        itemsToWrite.forEach((item: Partial<Types.Note>) => {
            if (!item.title || !item.content) {
                // Basic validation
                writeErrors.push({ error: "Note title and content are required.", item });
                return;
            }
            const newNote: Types.Note = {
                _id: item._id || `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                title: item.title,
                content: item.content,
                createdAt: item.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            // Check for existing item with same _id to update, otherwise add
            const existingIndex = notesCollection.findIndex((n) => n._id === newNote._id);
            if (existingIndex > -1) {
                notesCollection[existingIndex] = { ...notesCollection[existingIndex], ...newNote, updatedAt: new Date().toISOString() };
                console.log(`[BG] WRITE_DATA: Updated note with ID ${newNote._id} in '${collection}' for DID ${activeDid}.`);
            } else {
                notesCollection.push(newNote);
                console.log(`[BG] WRITE_DATA: Added new note with ID ${newNote._id} to '${collection}' for DID ${activeDid}.`);
            }
            createdIds.push(newNote._id!);
        });

        // console.log(`[BG] Mock DB for ${activeDid} after write to ${collection}:`, JSON.parse(JSON.stringify(getDbForIdentity(activeDid))));

        if (writeErrors.length > 0) {
            return { ok: false, ids: createdIds, errors: writeErrors };
        }
        return { ok: true, ids: createdIds };
    } catch (error: any) {
        console.error(`[BG] WRITE_DATA: Error writing to collection '${collection}':`, error);
        return { ok: false, errors: [{ error: error.message || "Failed to write data." }] };
    }
}
