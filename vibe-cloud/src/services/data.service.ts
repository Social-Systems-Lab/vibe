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
    private dbName: string = "vibe_data"; // Hardcoded database name for now
    private db: DocumentScope<VibeDocument>;

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
            this.db = this.nanoInstance.use<VibeDocument>(this.dbName);
        } catch (error) {
            logger.error("Failed to initialize Nano instance:", error);
            throw new Error("Failed to initialize Nano instance.");
        }
    }

    /**
     * Ensures the configured CouchDB database exists. Creates it if it doesn't.
     */
    async ensureDbExists(): Promise<void> {
        try {
            // Check if DB exists by trying to get info about it
            await this.nanoInstance.db.get(this.dbName);
        } catch (error: any) {
            // If error status is 404, database doesn't exist, so create it
            if (error.statusCode === 404) {
                try {
                    await this.nanoInstance.db.create(this.dbName);
                    logger.info(`Database '${this.dbName}' created successfully.`);
                    this.db = this.nanoInstance.use<VibeDocument>(this.dbName); // Re-assign db scope after creation
                } catch (createError) {
                    logger.error(`Error creating database '${this.dbName}':`, createError);
                    throw createError; // Re-throw creation error
                }
            } else {
                // Rethrow other errors (e.g., connection issues)
                logger.error(`Error checking database '${this.dbName}':`, error);
                throw error;
            }
        }
    }

    /**
     * Creates a new document in the database.
     * The 'collection' concept is handled by adding a 'type' field to the document.
     * @param collection - The logical collection name (used as the 'type' field).
     * @param data - The document data to store.
     * @returns The CouchDB insert response.
     */
    async createDocument(collection: string, data: Omit<VibeDocument, "_id" | "_rev" | "type">): Promise<DocumentInsertResponse> {
        if (!this.db || typeof this.db.insert !== "function") {
            throw new Error("Database connection not initialized properly.");
        }
        try {
            const docToInsert = { ...data, type: collection };
            const response = await this.db.insert(docToInsert);
            logger.info(`Document created in collection '${collection}' with ID: ${response.id}`);
            return response;
        } catch (error) {
            logger.error(`Error creating document in collection '${collection}':`, error);
            throw error;
        }
    }

    /**
     * Retrieves a document by its ID.
     * @param id - The ID of the document to retrieve.
     * @returns The document data.
     */
    async getDocument(id: string): Promise<VibeDocument & DocumentGetResponse> {
        if (!this.db || typeof this.db.get !== "function") {
            throw new Error("Database connection not initialized properly.");
        }
        try {
            const document = await this.db.get(id);
            logger.info(`Document retrieved with ID: ${id}`);
            return document as VibeDocument & DocumentGetResponse;
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`Document with ID '${id}' not found.`);
                throw new Error(`Document with ID '${id}' not found.`); // Throwing for now
            } else {
                logger.error(`Error retrieving document with ID '${id}':`, error);
                throw error;
            }
        }
    }

    /**
     * Updates an existing document. Requires the document ID and current revision (_rev).
     * The 'collection' concept is handled by adding/updating a 'type' field.
     * @param collection - The logical collection name (used as the 'type' field).
     * @param id - The ID of the document to update.
     * @param rev - The current revision (_rev) of the document.
     * @param data - The new data for the document.
     * @returns The CouchDB update response.
     */
    async updateDocument(collection: string, id: string, rev: string, data: Omit<VibeDocument, "_id" | "_rev" | "type">): Promise<DocumentUpdateResponse> {
        if (!this.db || typeof this.db.insert !== "function") {
            throw new Error("Database connection not initialized properly.");
        }
        try {
            // Ensure _id and _rev are included for the update
            const docToUpdate = { ...data, _id: id, _rev: rev, type: collection };
            const response = await this.db.insert(docToUpdate);
            // Nano throws on error. Removed the check for response.ok and response.reason.
            logger.info(`Document updated in collection '${collection}' with ID: ${response.id}, new rev: ${response.rev}`);
            return response;
        } catch (error: any) {
            if (error.statusCode === 409) {
                // Check specific error status code for conflicts
                // Conflict - likely incorrect _rev
                logger.error(`Error updating document '${id}' in collection '${collection}': Revision conflict (409).`);
                throw new Error(`Revision conflict updating document '${id}'. Please provide the latest revision (_rev).`);
            } else {
                logger.error(`Error updating document '${id}' in collection '${collection}':`, error);
                throw error; // Re-throw other errors
            }
        }
    }

    /**
     * Deletes a document by its ID and revision (_rev).
     * @param id - The ID of the document to delete.
     * @param rev - The current revision (_rev) of the document.
     * @returns The CouchDB destroy response.
     */
    async deleteDocument(id: string, rev: string): Promise<DocumentDestroyResponse> {
        if (!this.db || typeof this.db.destroy !== "function") {
            throw new Error("Database connection not initialized properly.");
        }
        try {
            const response = await this.db.destroy(id, rev);
            // Nano throws on error. Removed the check for response.ok and response.reason.
            logger.info(`Document deleted with ID: ${id}`);
            // The response object for destroy might be simple, ensure it matches DocumentDestroyResponse
            // If nano throws, the catch block handles it.
            return response as DocumentDestroyResponse; // Cast might be needed if type inference is off
        } catch (error: any) {
            if (error.statusCode === 409) {
                // Check specific error status code for conflicts
                // Conflict - likely incorrect _rev
                logger.error(`Error deleting document '${id}': Revision conflict (409).`);
                throw new Error(`Revision conflict deleting document '${id}'. Please provide the latest revision (_rev).`);
            } else if (error.statusCode === 404) {
                logger.warn(`Document with ID '${id}' not found for deletion.`);
                throw new Error(`Document with ID '${id}' not found for deletion.`);
            } else {
                logger.error(`Error deleting document '${id}':`, error);
                throw error; // Re-throw other errors
            }
        }
    }
}

// Export a singleton instance
export const dataService = new DataService();
