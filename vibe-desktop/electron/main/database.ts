// Database management for vibe-desktop
// Adapted from vibe-app/components/db/db-context.tsx

import { ipcMain } from 'electron';
import * as PouchDB from 'pouchdb';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// Add find plugin for querying
PouchDB.plugin(require('pouchdb-find'));

// Directory for storing databases
const DB_DIR = path.join(app.getPath('userData'), 'Databases');

// Make sure the database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// State
let currentDb: PouchDB.Database | null = null;
const subscriptions: Record<string, { query: any; unsubscribe: () => void }> = {};

// Derive DB name from DID
const getDbNameFromDid = (did: string): string => {
  return did.toLowerCase().replace(/[^a-z0-9_$()+/-]/g, '');
};

// Open or create a database
const openDatabase = (dbName: string): PouchDB.Database => {
  const dbPath = path.join(DB_DIR, dbName);
  console.log(`Opening database: ${dbPath}`);
  
  try {
    const db = new PouchDB(dbPath);
    return db;
  } catch (error) {
    console.error('Error opening database:', error);
    throw error;
  }
};

// Close the current database
const closeDatabase = async (): Promise<void> => {
  if (!currentDb) return;
  
  // Close all subscriptions
  Object.keys(subscriptions).forEach((subId) => {
    try {
      subscriptions[subId].unsubscribe();
      delete subscriptions[subId];
    } catch (e) {
      console.error(`Error closing subscription ${subId}:`, e);
    }
  });
  
  try {
    await currentDb.close();
    currentDb = null;
    console.log('Database closed');
  } catch (error) {
    console.error('Error closing database:', error);
    throw error;
  }
};

// Destroy the current database
const destroyDatabase = async (): Promise<void> => {
  if (!currentDb) return;
  
  try {
    await closeDatabase();
    await currentDb.destroy();
    console.log('Database destroyed');
  } catch (error) {
    console.error('Error destroying database:', error);
    throw error;
  }
};

// Get a document by its ID
const getDocument = async (docId: string): Promise<any> => {
  if (!currentDb) throw new Error('Database not open');
  
  try {
    const doc = await currentDb.get(docId);
    return doc;
  } catch (error) {
    console.error(`Error getting document ${docId}:`, error);
    throw error;
  }
};

// Put a document
const putDocument = async (doc: any): Promise<any> => {
  if (!currentDb) throw new Error('Database not open');
  
  try {
    const result = await currentDb.put(doc);
    return result;
  } catch (error) {
    console.error('Error putting document:', error);
    throw error;
  }
};

// Bulk put documents
const bulkPutDocuments = async (docs: any[]): Promise<any> => {
  if (!currentDb) throw new Error('Database not open');
  
  try {
    const result = await currentDb.bulkDocs(docs);
    return result;
  } catch (error) {
    console.error('Error bulk putting documents:', error);
    throw error;
  }
};

// Find documents
const findDocuments = async (query: any): Promise<any> => {
  if (!currentDb) throw new Error('Database not open');
  
  try {
    // Create index if needed
    if (query.selector && query.selector.$collection) {
      try {
        await currentDb.createIndex({
          index: {
            fields: ['$collection']
          }
        });
      } catch (e) {
        // Index might already exist, ignore
      }
    }
    
    const result = await currentDb.find(query);
    return result;
  } catch (error) {
    console.error('Error finding documents:', error);
    throw error;
  }
};

// Subscribe to changes
interface SubscriptionOptions {
  query: any;
  onChange: (results: any) => void;
}

const subscribe = async (subscriptionId: string, options: SubscriptionOptions): Promise<void> => {
  if (!currentDb) throw new Error('Database not open');
  
  try {
    // First get initial documents
    const initialResults = await findDocuments(options.query);
    
    // Send initial results
    options.onChange(initialResults);
    
    // Set up the changes feed
    const changes = currentDb.changes({
      live: true,
      include_docs: true,
      since: 'now'
    });
    
    // Listen for changes
    changes.on('change', async () => {
      // When a change happens, re-run the query
      try {
        const newResults = await findDocuments(options.query);
        options.onChange(newResults);
      } catch (e) {
        console.error('Error re-running query on change:', e);
      }
    });
    
    // Save the subscription info
    subscriptions[subscriptionId] = {
      query: options.query,
      unsubscribe: () => {
        changes.cancel();
      }
    };
  } catch (error) {
    console.error('Error subscribing to changes:', error);
    throw error;
  }
};

// Unsubscribe from changes
const unsubscribe = (subscriptionId: string): void => {
  if (subscriptions[subscriptionId]) {
    subscriptions[subscriptionId].unsubscribe();
    delete subscriptions[subscriptionId];
  }
};

// High-level write function that handles collections and IDs
const writeData = async (collection: string, doc: any | any[]): Promise<any> => {
  if (!currentDb) throw new Error('Database not open');
  
  // Handle array of documents
  if (Array.isArray(doc)) {
    if (doc.length === 0) return undefined; // Empty array, nothing to do
    
    // Process each document in the array
    const docs = doc.map((item) => {
      if (!item) return null; // Skip null/undefined items
      
      let processedDoc = { ...item };
      
      if (!processedDoc._id) {
        // Create random ID for the document
        processedDoc._id = `${collection}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
      } else if (!processedDoc._id.startsWith(`${collection}/`)) {
        // Invalid ID for this collection
        return null;
      }
      
      processedDoc.$collection = collection;
      return processedDoc;
    }).filter(Boolean); // Remove null items
    
    if (docs.length === 0) return undefined;
    
    console.log('writing docs batch', docs.length);
    // Use bulkDocs for array of documents
    const results = await bulkPutDocuments(docs);
    return results;
  } else {
    // Original single document logic
    if (!doc) return undefined;
    
    let processedDoc = { ...doc };
    
    if (!processedDoc._id) {
      processedDoc._id = `${collection}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
    } else if (!processedDoc._id.startsWith(`${collection}/`)) {
      return undefined;
    }
    
    processedDoc.$collection = collection;
    
    console.log('writing doc', processedDoc);
    const result = await putDocument(processedDoc);
    return result;
  }
};

// Set up IPC handlers
export function setupDatabaseHandlers(): void {
  // Open a database
  ipcMain.handle('db-open', (_, dbName) => {
    try {
      currentDb = openDatabase(dbName);
      return { success: true };
    } catch (error) {
      console.error('Error opening database:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Close the current database
  ipcMain.handle('db-close', async () => {
    try {
      await closeDatabase();
      return { success: true };
    } catch (error) {
      console.error('Error closing database:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Destroy the current database
  ipcMain.handle('db-destroy', async () => {
    try {
      await destroyDatabase();
      return { success: true };
    } catch (error) {
      console.error('Error destroying database:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Get a document by ID
  ipcMain.handle('db-get', async (_, docId) => {
    try {
      const doc = await getDocument(docId);
      return { success: true, doc };
    } catch (error) {
      console.error('Error getting document:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Put a document
  ipcMain.handle('db-put', async (_, doc) => {
    try {
      const result = await putDocument(doc);
      return { success: true, result };
    } catch (error) {
      console.error('Error putting document:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Bulk put documents
  ipcMain.handle('db-bulk-put', async (_, docs) => {
    try {
      const result = await bulkPutDocuments(docs);
      return { success: true, result };
    } catch (error) {
      console.error('Error bulk putting documents:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Find documents
  ipcMain.handle('db-find', async (_, query) => {
    try {
      const result = await findDocuments(query);
      return { success: true, result };
    } catch (error) {
      console.error('Error finding documents:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Subscribe to changes
  ipcMain.handle('db-subscribe', async (event, subscriptionId, query) => {
    const emitter = event.sender;
    
    try {
      await subscribe(subscriptionId, {
        query,
        onChange: (results) => {
          // Send results back to the renderer
          emitter.send('db-subscription-update', {
            subscriptionId,
            results
          });
        }
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error subscribing to changes:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Unsubscribe from changes
  ipcMain.handle('db-unsubscribe', (_, subscriptionId) => {
    try {
      unsubscribe(subscriptionId);
      return { success: true };
    } catch (error) {
      console.error('Error unsubscribing:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Get DB name from DID
  ipcMain.handle('db-get-name-from-did', (_, did) => {
    return getDbNameFromDid(did);
  });
  
  // High-level write
  ipcMain.handle('db-write', async (_, collection, doc) => {
    try {
      const result = await writeData(collection, doc);
      return { success: true, result };
    } catch (error) {
      console.error('Error writing data:', error);
      return { success: false, error: error.message };
    }
  });
}

export default {
  setupDatabaseHandlers,
  getDbNameFromDid,
  openDatabase,
  closeDatabase
};