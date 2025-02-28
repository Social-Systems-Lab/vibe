// db-context.tsx - Low-level interface for storing user/app data in PouchDB.
// Uses a WebView to interact with the pouchdb library

import React, { createContext, useContext, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";

type SubscriptionCallback = (results: any) => void;

// Define a result type for read operations
type ReadResult = {
    docs: any[];
    doc: any; // First doc for convenience
};

type DbContextType = {
    // Core database operations
    pouchdbWebViewRef: React.RefObject<WebView>;
    open: (dbName: string) => Promise<any>;
    close: () => Promise<any>;
    destroy: () => Promise<any>;
    put: (doc: any) => Promise<any>;
    bulkPut: (docs: any[]) => Promise<any>;
    get: (docId: string) => Promise<any>;
    find: (query: any) => Promise<any>;
    subscribe: (query: any, callback: SubscriptionCallback) => Promise<() => void>;

    // Helper functions
    getDbNameFromDid: (did: string) => string; // Helper to get valid DB name from DID

    // High-level operations
    read: (collection: string, filter: any, callback: (results: ReadResult) => void) => Promise<() => void>;
    readOnce: (collection: string, filter: any) => Promise<ReadResult>;
    write: (collection: string, doc: any | any[]) => Promise<any>;
};

const DbContext = createContext<DbContextType | undefined>(undefined);

export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const pouchdbWebViewRef = useRef<WebView>(null);
    const pouchdbHtmlUri = Asset.fromModule(require("@/assets/db/pouchdb.html")).uri;
    const pendingRequests = useRef<{ [key: string]: (value: any) => void }>({});
    const subscriptions = useRef<{ [key: string]: SubscriptionCallback }>({});

    // Helper to derive a valid database name from a DID
    const getDbName = (did: string): string => {
        return did.toLowerCase().replace(/[^a-z0-9_$()+/-]/g, "");
    };

    const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
        console.log("onMessage", event.nativeEvent.data);
        try {
            const data = JSON.parse(event.nativeEvent.data);

            // Handle subscription updates
            if (data.type === "subscription" && data.subscriptionId) {
                const callback = subscriptions.current[data.subscriptionId];
                if (callback) {
                    callback(data.results);
                }
                return;
            }

            // Handle regular request responses
            const { requestId, response, error } = data;
            if (requestId && pendingRequests.current[requestId]) {
                if (error) {
                    pendingRequests.current[requestId](Promise.reject(new Error(error)));
                } else {
                    pendingRequests.current[requestId](response);
                }
                delete pendingRequests.current[requestId];
            }
        } catch (error) {
            console.error("Error parsing WebView message:", error);
        }
    }, []);

    const callWebViewFunction = useCallback((message: { action: string; payload?: any }) => {
        return new Promise<any>((resolve, reject) => {
            const requestId = Date.now().toString(); // Unique request ID
            pendingRequests.current[requestId] = resolve;

            console.log("callWebViewFunction", JSON.stringify({ ...message, requestId }));

            pouchdbWebViewRef.current?.injectJavaScript(`
                    window.dispatchEvent(new MessageEvent('message', {
                        data: ${JSON.stringify({ ...message, requestId })}
                    }));
                `);

            // timeout to reject if no response is received
            setTimeout(() => {
                if (pendingRequests.current[requestId]) {
                    delete pendingRequests.current[requestId];
                    reject(new Error("WebView function timed out"));
                }
            }, 10 * 60000); // 10*60 seconds timeout
        });
    }, []);

    // New function to create (or open) a database
    const open = useCallback(
        (dbName: string) => {
            return callWebViewFunction({
                action: "open",
                payload: { dbName },
            });
        },
        [callWebViewFunction]
    );

    const close = useCallback(() => {
        return callWebViewFunction({
            action: "close",
        });
    }, [callWebViewFunction]);

    const destroy = useCallback(() => {
        return callWebViewFunction({
            action: "destroy",
        });
    }, [callWebViewFunction]);

    const get = useCallback(
        (docId: string) => {
            return callWebViewFunction({
                action: "get",
                payload: { docId },
            });
        },
        [callWebViewFunction]
    );

    const put = useCallback(
        (doc: any) => {
            return callWebViewFunction({
                action: "put",
                payload: { doc },
            });
        },
        [callWebViewFunction]
    );

    const bulkPut = useCallback(
        (docs: any[]) => {
            return callWebViewFunction({
                action: "bulkPut",
                payload: { docs },
            });
        },
        [callWebViewFunction]
    );

    const find = useCallback(
        (query: any) => {
            return callWebViewFunction({
                action: "find",
                payload: { query },
            });
        },
        [callWebViewFunction]
    );

    // Subscribe to changes
    const subscribe = useCallback(
        async (query: any, callback: SubscriptionCallback) => {
            const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Store the callback
            subscriptions.current[subscriptionId] = callback;

            // Start the subscription in the WebView
            await callWebViewFunction({
                action: "subscribe",
                payload: {
                    subscriptionId,
                    query,
                },
            });

            // Return an unsubscribe function
            return () => {
                delete subscriptions.current[subscriptionId];
                callWebViewFunction({
                    action: "unsubscribe",
                    payload: { subscriptionId },
                }).catch((error) => {
                    console.error("Error unsubscribing:", error);
                });
            };
        },
        [callWebViewFunction]
    );

    // We're removing the automatic database opening based on currentAccount
    // The AuthProvider will handle opening the database when an account is selected

    // Helper function to get DB name from a DID
    const getDbNameFromDid = useCallback((did: string): string => {
        return did.toLowerCase().replace(/[^a-z0-9_$()+/-]/g, "");
    }, []);

    // High-level read function with subscription
    const read = useCallback(
        async (collection: string, filter: any, callback: (results: ReadResult) => void): Promise<() => void> => {
            const query = {
                selector: {
                    ...filter,
                    $collection: collection,
                },
            };

            console.log("Setting up subscription with query: ", JSON.stringify(query, null, 2));

            // Start subscription
            let unsubscribe = await subscribe(query, (results) => {
                const formattedResults: ReadResult = {
                    docs: results.docs,
                    doc: results.docs[0],
                };
                callback(formattedResults);
            });
            return unsubscribe;
        },
        [subscribe]
    );

    // High-level readOnce function
    const readOnce = useCallback(
        async (collection: string, filter: any): Promise<ReadResult> => {
            const query = {
                selector: {
                    ...filter,
                    $collection: collection,
                },
            };

            console.log("Calling find with the following query: ", JSON.stringify(query, null, 2));

            const result = await find(query);
            let ret: ReadResult = {
                docs: result.docs,
                doc: result.docs[0],
            };
            return ret;
        },
        [find]
    );

    // High-level write function that handles collections and IDs
    const write = useCallback(
        async (collection: string, doc: any | any[]): Promise<any> => {
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

                console.log("writing docs batch", docs.length);
                // Use bulkDocs for array of documents
                const results = await bulkPut(docs);
                return results;
            } else {
                // Original single document logic
                if (!doc) return undefined;
                if (!doc._id) {
                    doc._id = `${collection}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
                } else if (!doc._id.startsWith(`${collection}/`)) {
                    return undefined;
                }
                doc.$collection = collection;

                console.log("writing doc", doc);
                const result = await put(doc);
                return result;
            }
        },
        [put, bulkPut]
    );

    return (
        <DbContext.Provider
            value={{
                pouchdbWebViewRef: pouchdbWebViewRef,
                open,
                close,
                destroy,
                get,
                put,
                bulkPut,
                find,
                subscribe,
                getDbNameFromDid,
                read,
                readOnce,
                write,
            }}
        >
            <View style={styles.hidden}>
                <WebView ref={pouchdbWebViewRef} source={{ uri: pouchdbHtmlUri }} javaScriptEnabled onMessage={handleWebViewMessage} />
            </View>
            {children}
        </DbContext.Provider>
    );
};

export const useDb = (): DbContextType => {
    const context = useContext(DbContext);
    if (!context) throw new Error("useDb must be used within an DbProvider");
    return context;
};

const styles = StyleSheet.create({
    hidden: {
        height: 0,
        width: 0,
        position: "absolute",
        top: -10000, // hide webview off-screen
    },
});
