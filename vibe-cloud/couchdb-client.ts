/**
 * Simple CouchDB client for Deno
 */

export interface CouchDBConfig {
  url: string;
  username: string;
  password: string;
}

export interface CouchDBResponse {
  ok?: boolean;
  id?: string;
  rev?: string;
  error?: string;
  reason?: string;
}

export interface CouchDBFindResponse {
  docs: any[];
  warning?: string;
  execution_stats?: any;
}

/**
 * CouchDB client for interacting with a CouchDB database
 */
export class CouchDBClient {
  private baseUrl: string;
  private headers: Headers;

  /**
   * Create a new CouchDB client
   * @param config CouchDB configuration
   */
  constructor(config: CouchDBConfig) {
    this.baseUrl = config.url;
    
    // Create authorization header
    const auth = btoa(`${config.username}:${config.password}`);
    this.headers = new Headers({
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
  }

  /**
   * Create a database if it doesn't exist
   * @param dbName Database name
   * @returns Promise resolving to the response
   */
  async createDatabase(dbName: string): Promise<CouchDBResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/${dbName}`, {
        method: 'PUT',
        headers: this.headers
      });
      
      if (response.status === 412) {
        // Database already exists
        return { ok: true };
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Error creating database:', error);
      return { error: error.message };
    }
  }

  /**
   * Get a document by ID
   * @param dbName Database name
   * @param docId Document ID
   * @returns Promise resolving to the document
   */
  async get(dbName: string, docId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/${dbName}/${docId}`, {
        method: 'GET',
        headers: this.headers
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.reason || 'Failed to get document');
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error getting document ${docId}:`, error);
      throw error;
    }
  }

  /**
   * Put a document
   * @param dbName Database name
   * @param doc Document to put
   * @returns Promise resolving to the response
   */
  async put(dbName: string, doc: any): Promise<CouchDBResponse> {
    try {
      const method = doc._id ? 'PUT' : 'POST';
      const url = doc._id 
        ? `${this.baseUrl}/${dbName}/${doc._id}`
        : `${this.baseUrl}/${dbName}`;
      
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: JSON.stringify(doc)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.reason || 'Failed to put document');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error putting document:', error);
      throw error;
    }
  }

  /**
   * Bulk update documents
   * @param dbName Database name
   * @param docs Documents to update
   * @returns Promise resolving to the response
   */
  async bulkDocs(dbName: string, docs: any[]): Promise<CouchDBResponse[]> {
    try {
      const response = await fetch(`${this.baseUrl}/${dbName}/_bulk_docs`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ docs })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.reason || 'Failed to bulk update documents');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error bulk updating documents:', error);
      throw error;
    }
  }

  /**
   * Find documents using Mango query
   * @param dbName Database name
   * @param selector Mango query selector
   * @param limit Optional result limit
   * @returns Promise resolving to the find response
   */
  async find(dbName: string, selector: any, limit?: number): Promise<CouchDBFindResponse> {
    try {
      const query: any = { selector };
      
      if (limit) {
        query.limit = limit;
      }
      
      const response = await fetch(`${this.baseUrl}/${dbName}/_find`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(query)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.reason || 'Failed to find documents');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error finding documents:', error);
      throw error;
    }
  }

  /**
   * Delete a document
   * @param dbName Database name
   * @param docId Document ID
   * @param rev Document revision
   * @returns Promise resolving to the response
   */
  async remove(dbName: string, docId: string, rev: string): Promise<CouchDBResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/${dbName}/${docId}?rev=${rev}`, {
        method: 'DELETE',
        headers: this.headers
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.reason || 'Failed to delete document');
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error deleting document ${docId}:`, error);
      throw error;
    }
  }
}
