// db-context.tsx - Low-level interface for storing user/app data in PouchDB for Electron
// For vibe-desktop-2, adaptation of vibe-app/components/db/db-context.tsx

import React, { createContext, useContext, useCallback } from 'react';
import { useAuth } from '../auth/auth-context';

// Define a result type for read operations
export type ReadResult = {
  docs: any[];
  doc: any; // First doc for convenience
};

type SubscriptionCallback = (results: any) => void;

type DbContextType = {
  // Core database operations
  open: (dbName: string) => Promise<any>;
  close: () => Promise<any>;
  destroy: () => Promise<any>;
  put: (doc: any) => Promise<any>;
  bulkPut: (docs: any[]) => Promise<any>;
  get: (docId: string) => Promise<any>;
  find: (query: any) => Promise<any>;
  subscribe: (query: any, callback: SubscriptionCallback) => Promise<() => void>;

  // High-level operations
  read: (collection: string, filter: any, callback: (results: ReadResult) => void) => Promise<() => void>;
  readOnce: (collection: string, filter: any) => Promise<ReadResult>;
  write: (collection: string, doc: any | any[]) => Promise<any>;
};

const DbContext = createContext<DbContextType | undefined>(undefined);

export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAccount } = useAuth();
  
  // Track active subscriptions to be able to unsubscribe
  const subscriptions = React.useRef<{ [key: string]: SubscriptionCallback }>({});

  // Open a database
  const open = useCallback(async (dbName: string) => {
    try {
      return await window.electron.openDatabase(dbName);
    } catch (error) {
      console.error('Error opening database:', error);
      throw error;
    }
  }, []);

  // Close the current database
  const close = useCallback(async () => {
    try {
      return await window.electron.closeDatabase();
    } catch (error) {
      console.error('Error closing database:', error);
      throw error;
    }
  }, []);

  // Destroy the current database
  const destroy = useCallback(async () => {
    try {
      return await window.electron.destroyDatabase();
    } catch (error) {
      console.error('Error destroying database:', error);
      throw error;
    }
  }, []);

  // Get a document by ID
  const get = useCallback(async (docId: string) => {
    try {
      return await window.electron.getDocument(docId);
    } catch (error) {
      console.error('Error getting document:', error);
      throw error;
    }
  }, []);

  // Put a document
  const put = useCallback(async (doc: any) => {
    try {
      return await window.electron.putDocument(doc);
    } catch (error) {
      console.error('Error putting document:', error);
      throw error;
    }
  }, []);

  // Bulk put documents
  const bulkPut = useCallback(async (docs: any[]) => {
    try {
      return await window.electron.bulkPutDocuments(docs);
    } catch (error) {
      console.error('Error bulk putting documents:', error);
      throw error;
    }
  }, []);

  // Find documents with a query
  const find = useCallback(async (query: any) => {
    try {
      return await window.electron.findDocuments(query);
    } catch (error) {
      console.error('Error finding documents:', error);
      throw error;
    }
  }, []);

  // Subscribe to changes
  const subscribe = useCallback(async (query: any, callback: SubscriptionCallback) => {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store the callback
    subscriptions.current[subscriptionId] = callback;
    
    try {
      // Set up the subscription in the main process
      await window.electron.subscribeToChanges(subscriptionId, query);
      
      // Set up a listener for changes from this subscription
      const handleSubscriptionChange = (event: any, data: any) => {
        if (data.subscriptionId === subscriptionId) {
          callback(data.results);
        }
      };
      
      // Add event listener for this subscription
      window.electron.onSubscriptionChange(handleSubscriptionChange);
      
      // Return an unsubscribe function
      return () => {
        delete subscriptions.current[subscriptionId];
        window.electron.unsubscribe(subscriptionId);
        window.electron.removeSubscriptionChangeListener(handleSubscriptionChange);
      };
    } catch (error) {
      console.error('Error setting up subscription:', error);
      delete subscriptions.current[subscriptionId];
      throw error;
    }
  }, []);

  // High-level read function with subscription
  const read = useCallback(async (
    collection: string, 
    filter: any, 
    callback: (results: ReadResult) => void
  ): Promise<() => void> => {
    const query = {
      selector: {
        ...filter,
        $collection: collection,
      },
    };

    console.log('Setting up subscription with query: ', JSON.stringify(query, null, 2));

    // Start subscription
    const unsubscribe = await subscribe(query, (results) => {
      const formattedResults: ReadResult = {
        docs: results.docs,
        doc: results.docs[0],
      };
      callback(formattedResults);
    });
    
    return unsubscribe;
  }, [subscribe]);

  // High-level readOnce function
  const readOnce = useCallback(async (collection: string, filter: any): Promise<ReadResult> => {
    const query = {
      selector: {
        ...filter,
        $collection: collection,
      },
    };

    console.log('Calling find with the following query: ', JSON.stringify(query, null, 2));

    const result = await find(query);
    const ret: ReadResult = {
      docs: result.docs,
      doc: result.docs[0],
    };
    return ret;
  }, [find]);

  // High-level write function that handles collections and IDs
  const write = useCallback(async (collection: string, doc: any | any[]): Promise<any> => {
    // Handle array of documents
    if (Array.isArray(doc)) {
      if (doc.length === 0) return undefined; // Empty array, nothing to do

      // Process each document in the array
      const docs = doc
        .map((item) => {
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
        })
        .filter(Boolean); // Remove null items

      if (docs.length === 0) return undefined;

      console.log('Writing docs batch', docs.length);
      // Use bulkDocs for array of documents
      const results = await bulkPut(docs);
      return results;
    } else {
      // Original single document logic
      if (!doc) return undefined;
      
      const processedDoc = { ...doc };
      
      if (!processedDoc._id) {
        processedDoc._id = `${collection}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
      } else if (!processedDoc._id.startsWith(`${collection}/`)) {
        return undefined;
      }
      
      processedDoc.$collection = collection;
      
      console.log('Writing doc', processedDoc);
      const result = await put(processedDoc);
      return result;
    }
  }, [put, bulkPut]);
  
  // Provide the db context
  return (
    <DbContext.Provider
      value={{
        open,
        close,
        destroy,
        get,
        put,
        bulkPut,
        find,
        subscribe,
        read,
        readOnce,
        write,
      }}
    >
      {children}
    </DbContext.Provider>
  );
};

export const useDb = (): DbContextType => {
  const context = useContext(DbContext);
  if (!context) throw new Error('useDb must be used within a DbProvider');
  return context;
};