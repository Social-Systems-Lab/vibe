import nano from "nano";
import type { DocumentScope, DocumentInsertResponse, DocumentGetResponse, DocumentDestroyResponse, MaybeDocument } from "nano";
import { logger } from "../utils/logger";

// Define the structure of documents we might store (optional but good practice)
interface VibeDocument extends MaybeDocument {
    [key: string]: any; // Allow arbitrary fields
}

// Define the structure for update responses
interface DocumentUpdateResponse extends DocumentInsertResponse {}

export class DataService {
    private nanoInstance: nano.ServerScope;
    // No longer storing a single db instance here

    constructor() {
        const couchdbUrl = process.env.COUCHDB_URL;
        const couchdbUser = process.env.COUCHDB_USER;
        const couchdbPassword = process.env.COUCHDB_PASSWORD;

        if (!couchdbUrl || !couchdbUser || !couchdbPassword) {
            logger.error("CRITICAL: CouchDB environment variables (COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD) are not set.");
            throw new Error("CouchDB environment variables not configured.");
        }

        try {
            this.nanoInstance = nano({
                url: couchdbUrl,
                requestDefaults: {
                    auth: {
                        username: couchdbUser,
                        password: couchdbPassword,
                    },
                },
            });
            // Removed db initialization from constructor
        } catch (error) {
            logger.error("Failed to initialize Nano instance:", error);
            throw new Error("Failed to initialize Nano instance.");
        }
    }

    /**
     * Ensures a specific CouchDB database exists. Creates it if it doesn't.
     * @param databaseName - The name of the database to ensure exists.
     */
    async ensureDbExists(databaseName: string): Promise<void> {
        try {
            // Check if DB exists by trying to get info about it
            await this.nanoInstance.db.get(databaseName);
            logger.info(`Database '${databaseName}' already exists.`);
        } catch (error: any) {
            // If error status is 404, database doesn't exist, so create it
            if (error.statusCode === 404) {
                try {
                    await this.nanoInstance.db.create(databaseName);
                    logger.info(`Database '${databaseName}' created successfully.`);
                    // No need to assign this.db anymore
                } catch (createError) {
                    logger.error(`Error creating database '${databaseName}':`, createError);
                    throw createError; // Re-throw creation error
                }
            } else {
                // Rethrow other errors (e.g., connection issues)
                logger.error(`Error checking database '${databaseName}':`, error);
                throw error;
            }
        }
    }

    /**
     * Creates a new document in the specified database.
     * The 'collection' concept is handled by adding a 'type' field to the document.
     * @param databaseName - The name of the database to operate on.
     * @param collection - The logical collection name (used as the 'type' field).
     * @param data - The document data to store.
     * @returns The CouchDB insert response.
     */
    async createDocument(databaseName: string, collection: string, data: Omit<VibeDocument, "_id" | "_rev" | "type">): Promise<DocumentInsertResponse> {
        try {
            const db = this.nanoInstance.use<VibeDocument>(databaseName);
            const docToInsert = { ...data, type: collection };
            const response = await db.insert(docToInsert);
            logger.info(`Document created in DB '${databaseName}', collection '${collection}' with ID: ${response.id}`);
            return response;
        } catch (error) {
            logger.error(`Error creating document in DB '${databaseName}', collection '${collection}':`, error);
            throw error;
        }
    }

    /**
     * Retrieves a document by its ID from the specified database.
     * @param databaseName - The name of the database to operate on.
     * @param id - The ID of the document to retrieve.
     * @returns The document data.
     */
    async getDocument(databaseName: string, id: string): Promise<VibeDocument & DocumentGetResponse> {
        try {
            const db = this.nanoInstance.use<VibeDocument>(databaseName);
            const document = await db.get(id);
            logger.info(`Document retrieved from DB '${databaseName}' with ID: ${id}`);
            return document as VibeDocument & DocumentGetResponse;
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`Document with ID '${id}' not found in DB '${databaseName}'.`);
                throw new Error(`Document with ID '${id}' not found in DB '${databaseName}'.`); // Throwing for now
            } else {
                logger.error(`Error retrieving document with ID '${id}' from DB '${databaseName}':`, error);
                throw error;
            }
        }
    }

    /**
     * Updates an existing document in the specified database. Requires the document ID and current revision (_rev).
     * The 'collection' concept is handled by adding/updating a 'type' field.
     * @param databaseName - The name of the database to operate on.
     * @param collection - The logical collection name (used as the 'type' field).
     * @param id - The ID of the document to update.
     * @param rev - The current revision (_rev) of the document.
     * @param data - The new data for the document.
     * @returns The CouchDB update response.
     */
    async updateDocument(
        databaseName: string,
        collection: string,
        id: string,
        rev: string,
        data: Omit<VibeDocument, "_id" | "_rev" | "type">
    ): Promise<DocumentUpdateResponse> {
        try {
            const db = this.nanoInstance.use<VibeDocument>(databaseName);
            // Ensure _id and _rev are included for the update
            const docToUpdate = { ...data, _id: id, _rev: rev, type: collection };
            const response = await db.insert(docToUpdate);
            logger.info(`Document updated in DB '${databaseName}', collection '${collection}' with ID: ${response.id}, new rev: ${response.rev}`);
            return response;
        } catch (error: any) {
            if (error.statusCode === 409) {
                // Conflict - likely incorrect _rev
                logger.error(`Error updating document '${id}' in DB '${databaseName}', collection '${collection}': Revision conflict (409).`);
                throw new Error(`Revision conflict updating document '${id}' in DB '${databaseName}'. Please provide the latest revision (_rev).`);
            } else {
                logger.error(`Error updating document '${id}' in DB '${databaseName}', collection '${collection}':`, error);
                throw error; // Re-throw other errors
            }
        }
    }

    /**
     * Deletes a document by its ID and revision (_rev) from the specified database.
     * @param databaseName - The name of the database to operate on.
     * @param id - The ID of the document to delete.
     * @param rev - The current revision (_rev) of the document.
     * @returns The CouchDB destroy response.
     */
    async deleteDocument(databaseName: string, id: string, rev: string): Promise<DocumentDestroyResponse> {
        try {
            const db = this.nanoInstance.use<VibeDocument>(databaseName);
            const response = await db.destroy(id, rev);
            logger.info(`Document deleted from DB '${databaseName}' with ID: ${id}`);
            return response as DocumentDestroyResponse;
        } catch (error: any) {
            if (error.statusCode === 409) {
                // Conflict - likely incorrect _rev
                logger.error(`Error deleting document '${id}' from DB '${databaseName}': Revision conflict (409).`);
                throw new Error(`Revision conflict deleting document '${id}' from DB '${databaseName}'. Please provide the latest revision (_rev).`);
            } else if (error.statusCode === 404) {
                logger.warn(`Document with ID '${id}' not found for deletion in DB '${databaseName}'.`);
                throw new Error(`Document with ID '${id}' not found for deletion in DB '${databaseName}'.`);
            } else {
                logger.error(`Error deleting document '${id}' from DB '${databaseName}':`, error);
                throw error; // Re-throw other errors
            }
        }
    }
}

// Export a singleton instance
export const dataService = new DataService();
