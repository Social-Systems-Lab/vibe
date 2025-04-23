// data.service.ts
import nano from "nano";
import type { DocumentScope, MaybeDocument } from "nano";
import { logger } from "../utils/logger";
import { InternalServerError, NotFoundError } from "elysia";
import { randomUUIDv7 } from "bun";

export interface ReadResult<T = any> {
    docs: (T & MaybeDocument)[];
    doc?: T & MaybeDocument;
}

export class DataService {
    private nano: nano.ServerScope | null = null;
    private dbConnections = new Map<string, DocumentScope<any>>();
    private isConnecting = false;
    private connectionPromise: Promise<void> | null = null;

    constructor() {}

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
     * Reads documents matching a filter within a specific collection in a user's database.
     * @param dbName The user-specific database name (e.g., 'userdata-did:...').
     * @param collection The name of the collection ($collection field).
     * @param filter Optional Mango selector fields (excluding $collection).
     * @returns ReadResult containing the documents.
     */
    async readOnce<T = any>(dbName: string, collection: string, filter: Record<string, any> = {}): Promise<ReadResult<T>> {
        if (!collection) {
            throw new Error("Collection name must be provided for readOnce.");
        }
        const query: nano.MangoQuery = {
            selector: {
                ...filter,
                $collection: collection, // Add collection to selector
            },
            // Add other options like fields, sort, limit if needed later
        };

        try {
            const response = await this.findDocuments<T & MaybeDocument>(dbName, query);
            const result: ReadResult<T> = {
                docs: response.docs || [],
                doc: response.docs?.[0], // First document or undefined
            };
            return result;
        } catch (error) {
            // Logged in findDocuments, rethrow or handle
            logger.error(`readOnce failed for db "${dbName}", collection "${collection}":`, error);
            // Rethrow specific errors if needed, otherwise let the generic handler catch
            if (error instanceof Error) throw error;
            throw new InternalServerError("Failed to read documents.");
        }
    }

    /**
     * Writes one or more documents to a specific collection in a user's database.
     * Handles ID generation and updates (_rev).
     * @param dbName The user-specific database name.
     * @param collection The name of the collection ($collection field).
     * @param docOrDocs A single document or an array of documents.
     * @returns The CouchDB response (single insert or bulk response).
     */
    async write<T extends Record<string, any>>(
        dbName: string,
        collection: string,
        docOrDocs: T | T[]
    ): Promise<nano.DocumentInsertResponse | nano.DocumentBulkResponse[]> {
        if (!collection) {
            throw new Error("Collection name must be provided for write.");
        }
        const db = await this.ensureDatabaseExists(dbName);

        const processDoc = (doc: T): T & { _id?: string; $collection: string } => {
            let processedDoc = { ...doc } as any;
            // Add $collection field
            processedDoc.$collection = collection;
            // Generate _id if missing, using UUID for better uniqueness
            if (!processedDoc._id) {
                processedDoc._id = `${collection}/${randomUUIDv7()}`; // Use UUID
                logger.debug(`Generated _id "${processedDoc._id}" for new document.`);
            } else if (!processedDoc._id.startsWith(`${collection}/`)) {
                logger.warn(`Document ID "${processedDoc._id}" does not follow the standard "${collection}/" prefix.`);
                throw new Error(`Document ID "${processedDoc._id}" does not follow the standard "${collection}/" prefix.`);
            }
            return processedDoc as T & { _id: string; $collection: string };
        };

        try {
            if (Array.isArray(docOrDocs)) {
                // --- Bulk Write ---
                if (docOrDocs.length === 0) {
                    logger.info("Write called with empty array, nothing to do.");
                    // Return an empty-like bulk response structure
                    return [] as nano.DocumentBulkResponse[];
                }

                const docsToInsert = docOrDocs.map(processDoc);
                logger.debug(`Performing bulk write for ${docsToInsert.length} documents in db "${dbName}", collection "${collection}"`);

                // Nano's bulk handles fetching _revs automatically if IDs exist
                const response = await db.bulk({ docs: docsToInsert });

                // Check response items for errors
                const errors = response.filter((item) => item.error);
                if (errors.length > 0) {
                    logger.error(`Bulk write encountered errors in db "${dbName}", collection "${collection}":`, errors);
                    // Consider throwing a custom error or returning the partial success response
                    // throw new Error(`Bulk write failed for ${errors.length} documents.`);
                } else {
                    logger.debug(`Bulk write successful for ${docsToInsert.length} documents in db "${dbName}", collection "${collection}"`);
                }
                return response;
            } else {
                // --- Single Write ---
                const docToInsert = processDoc(docOrDocs);
                logger.debug(`Performing single write for document id "${docToInsert._id}" in db "${dbName}", collection "${collection}"`);

                // db.insert handles create or update based on _id/_rev presence
                // It fetches _rev automatically if _id exists and _rev is missing
                const response = await db.insert(docToInsert);
                if (!response.ok) {
                    logger.error(`Single write reported not OK for db ${dbName}, id ${docToInsert._id}:`, response);
                    throw new InternalServerError("Failed to write document, unexpected response from database.");
                }
                logger.debug(`Single write successful for document id "${response.id}", new rev: ${response.rev}`);
                return response;
            }
        } catch (error: any) {
            logger.error(`Write operation failed for db "${dbName}", collection "${collection}":`, error.message || error);
            if (error instanceof Error) throw error; // Rethrow known errors
            throw new InternalServerError("Failed to write document(s).");
        }
    }

    /**
     * Creates a new document in the specified database.
     * The 'collection' concept is handled by adding a '$collection' field to the document.
     */
    async createDocument(dbName: string, collection: string, data: Record<string, any>): Promise<nano.DocumentInsertResponse> {
        try {
            const db = await this.ensureDatabaseExists(dbName);
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
     */
    async updateDocument(dbName: string, collection: string, docId: string, rev: string, data: Record<string, any>): Promise<nano.DocumentInsertResponse> {
        try {
            const db = await this.ensureDatabaseExists(dbName);
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

    /**
     * Executes a Mango query against a specified database.
     */
    async findDocuments<T extends MaybeDocument>(dbName: string, query: nano.MangoQuery): Promise<nano.MangoResponse<T>> {
        if (!this.nano) throw new Error("Database connection not initialized.");

        try {
            const db = await this.ensureDatabaseExists(dbName);

            // Ensure the index exists (might be redundant if ensureDatabaseExists handles it, but safe)
            if (query.selector && query.selector.$collection) {
                try {
                    await db.createIndex({ index: { fields: ["$collection"] }, name: "idx-collection" });
                } catch (indexError: any) {
                    // Ignore if index already exists, log other errors
                    if (!indexError.message?.includes("exists")) {
                        logger.error(`Failed to ensure index on '$collection' in db "${dbName}" before find:`, indexError.message || indexError);
                    }
                }
            }

            logger.debug(`Executing Mango query in db "${dbName}":`, JSON.stringify(query));
            const response = await db.find(query);
            logger.debug(`Mango query completed in db "${dbName}", found ${response.docs?.length ?? 0} documents.`);
            // Ensure the response structure matches what's expected, potentially casting docs
            return response as nano.MangoResponse<T>;
        } catch (error: any) {
            logger.error(`Error executing Mango query in db "${dbName}":`, error.message || error);
            // Handle specific errors like invalid query syntax if possible
            // For now, throw a generic internal server error
            throw new InternalServerError("Failed to execute query.");
        }
    }
}

// Export a singleton instance
export const dataService = new DataService();
