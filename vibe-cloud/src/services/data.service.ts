// data.service.ts
import nano from "nano";
import type { DocumentScope, DocumentInsertResponse, DocumentGetResponse, DocumentDestroyResponse, MaybeDocument } from "nano";
import { logger } from "../utils/logger";
import { InternalServerError, NotFoundError } from "elysia";

// Define the structure of documents we might store (optional but good practice)
interface VibeDocument extends MaybeDocument {
    [key: string]: any; // Allow arbitrary fields
}

// Define the structure for update responses
interface DocumentUpdateResponse extends DocumentInsertResponse {}

export class DataService {
    private nano: nano.ServerScope | null = null;
    private dbConnections = new Map<string, DocumentScope<any>>();
    private isConnecting = false;
    private connectionPromise: Promise<void> | null = null;

    constructor() {
        // Delay connection until needed or explicitly called
    }

    // Add this method
    isInitialized(): boolean {
        return !!this.nano;
    }

    async connect(): Promise<void> {
        // Prevent multiple concurrent connection attempts
        if (this.isConnecting) {
            logger.debug("Connection attempt already in progress, awaiting existing promise.");
            return this.connectionPromise!;
        }
        if (this.nano) {
            logger.debug("Already connected to CouchDB.");
            return;
        }

        const dbUrl = process.env.COUCHDB_URL;
        const dbUser = process.env.COUCHDB_USER;
        const dbPassword = process.env.COUCHDB_PASSWORD;

        if (!dbUrl || !dbUser || !dbPassword) {
            logger.error("CRITICAL: CouchDB environment variables (URL, USER, PASSWORD) are not fully set.");
            throw new Error("CouchDB connection details missing in environment variables.");
        }

        this.isConnecting = true;
        this.connectionPromise = (async () => {
            try {
                logger.info(`Attempting to connect to CouchDB at ${dbUrl}...`);
                this.nano = nano({ url: dbUrl, requestDefaults: { jar: true } }); // Use cookie jar for sessions

                // Authenticate
                await this.nano.auth(dbUser, dbPassword);
                logger.info("CouchDB authentication successful.");

                // Verify connection by listing databases (optional but good practice)
                await this.nano.db.list();
                logger.info("Successfully connected to CouchDB and verified connection.");
            } catch (error: any) {
                logger.error("CRITICAL: Failed to connect or authenticate with CouchDB:", error.message || error);
                this.nano = null; // Reset nano instance on failure
                // Rethrow or handle as appropriate for application startup
                throw new Error(`CouchDB connection failed: ${error.message}`);
            } finally {
                this.isConnecting = false;
                this.connectionPromise = null; // Clear the promise once done
            }
        })();

        return this.connectionPromise;
    }

    getConnection(): nano.ServerScope {
        if (!this.nano) {
            // This should ideally not happen if connect() is called and awaited properly at startup
            logger.error("Attempted to get CouchDB connection before initialization.");
            throw new Error("Database connection not initialized. Call connect() first.");
        }
        return this.nano;
    }

    /**
     * Ensures a specific CouchDB database exists. Creates it if it doesn't.
     */
    async ensureDatabaseExists(dbName: string): Promise<DocumentScope<any>> {
        if (!this.nano) throw new Error("Database connection not initialized.");

        // Return cached connection if available
        if (this.dbConnections.has(dbName)) {
            return this.dbConnections.get(dbName)!;
        }

        try {
            // Check if DB exists
            await this.nano.db.get(dbName);
            logger.debug(`Database "${dbName}" already exists.`);
            const db = this.nano.use(dbName);
            this.dbConnections.set(dbName, db); // Cache connection
            return db;
        } catch (error: any) {
            // If DB doesn't exist (status code 404), create it
            if (error.statusCode === 404) {
                logger.info(`Database "${dbName}" not found, creating...`);
                await this.nano.db.create(dbName);
                logger.info(`Database "${dbName}" created successfully.`);
                const db = this.nano.use(dbName);
                this.dbConnections.set(dbName, db); // Cache connection
                return db;
            } else {
                // Handle other errors during DB check/creation
                logger.error(`Error ensuring database "${dbName}" exists:`, error.message || error);
                throw new InternalServerError(`Failed to ensure database "${dbName}" exists.`);
            }
        }
    }

    /**
     * Creates a new document in the specified database.
     * The 'collection' concept is handled by adding a '$collection' field to the document.
     */
    async createDocument(dbName: string, collection: string, data: Record<string, any>): Promise<nano.DocumentInsertResponse> {
        try {
            const db = await this.ensureDatabaseExists(dbName);
            // **Add the $collection field**
            const docToInsert = { ...data, $collection: collection };
            const response = await db.insert(docToInsert);
            if (!response.ok) {
                // This case might indicate an unexpected issue post-insert attempt
                logger.error(`CouchDB insert reported not OK for db ${dbName}:`, response);
                throw new InternalServerError("Failed to create document, unexpected response from database.");
            }
            logger.debug(`Document created in db "${dbName}", collection "${collection}", id: ${response.id}`);
            return response;
        } catch (error: any) {
            logger.error(`Error creating document in db "${dbName}", collection "${collection}":`, error.message || error);
            // Rethrow specific errors or a generic one
            if (error instanceof InternalServerError) throw error;
            throw new InternalServerError("Failed to create document.");
        }
    }

    /**
     * Retrieves a document by its ID from the specified database.
     */
    async getDocument<T extends MaybeDocument>(dbName: string, docId: string): Promise<T & MaybeDocument> {
        try {
            const db = await this.ensureDatabaseExists(dbName);
            const doc = await db.get(docId);
            logger.debug(`Document retrieved from db "${dbName}", id: ${docId}`);
            return doc as T & MaybeDocument; // Cast to expected type
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`Document not found in db "${dbName}", id: ${docId}`);
                throw new NotFoundError(`Document with id "${docId}" not found.`);
            }
            logger.error(`Error getting document from db "${dbName}", id: ${docId}:`, error.message || error);
            throw new InternalServerError("Failed to retrieve document.");
        }
    }

    /**
     * Updates an existing document in the specified database. Requires the document ID and current revision (_rev).
     * The 'collection' concept is handled by adding/updating a 'type' field.
     */
    async updateDocument(dbName: string, collection: string, docId: string, rev: string, data: Record<string, any>): Promise<nano.DocumentInsertResponse> {
        try {
            const db = await this.ensureDatabaseExists(dbName);
            // **Ensure $collection field is present/updated**
            const docToUpdate = { ...data, _id: docId, _rev: rev, $collection: collection };
            const response = await db.insert(docToUpdate);
            if (!response.ok) {
                // This case might indicate an unexpected issue post-insert attempt
                logger.error(`CouchDB update reported not OK for db ${dbName}, id ${docId}:`, response);
                throw new InternalServerError("Failed to update document, unexpected response from database.");
            }
            logger.debug(`Document updated in db "${dbName}", collection "${collection}", id: ${docId}, new rev: ${response.rev}`);
            return response;
        } catch (error: any) {
            if (error.statusCode === 409) {
                logger.warn(`Revision conflict updating document in db "${dbName}", id: ${docId}, rev: ${rev}`);
                throw new Error("Revision conflict"); // Keep specific error for conflict
            }
            if (error.statusCode === 404) {
                logger.warn(`Document not found for update in db "${dbName}", id: ${docId}`);
                throw new NotFoundError(`Document with id "${docId}" not found for update.`);
            }
            logger.error(`Error updating document in db "${dbName}", id: ${docId}:`, error.message || error);
            throw new InternalServerError("Failed to update document.");
        }
    }

    /**
     * Deletes a document by its ID and revision (_rev) from the specified database.
     */
    async deleteDocument(dbName: string, docId: string, rev: string): Promise<nano.DocumentDestroyResponse> {
        try {
            const db = await this.ensureDatabaseExists(dbName);
            const response = await db.destroy(docId, rev);
            if (!response.ok) {
                // This case might indicate an unexpected issue post-delete attempt
                logger.error(`CouchDB delete reported not OK for db ${dbName}, id ${docId}:`, response);
                throw new InternalServerError("Failed to delete document, unexpected response from database.");
            }
            logger.debug(`Document deleted from db "${dbName}", id: ${docId}`);
            return response;
        } catch (error: any) {
            if (error.statusCode === 409) {
                logger.warn(`Revision conflict deleting document in db "${dbName}", id: ${docId}, rev: ${rev}`);
                throw new Error("Revision conflict"); // Keep specific error for conflict
            }
            if (error.statusCode === 404) {
                logger.warn(`Document not found for deletion in db "${dbName}", id: ${docId}`);
                throw new NotFoundError(`Document with id "${docId}" not found for deletion.`);
            }
            logger.error(`Error deleting document in db "${dbName}", id: ${docId}:`, error.message || error);
            throw new InternalServerError("Failed to delete document.");
        }
    }
}

// Export a singleton instance
export const dataService = new DataService();
