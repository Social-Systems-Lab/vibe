// db-context.tsx - Low-level interface for storing user/app data in PouchDB.
// Uses a WebView to interact with the pouchdb library

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import { useAuth } from "../auth/auth-context";

type SubscriptionCallback = (results: any) => void;

type DbContextType = {
    pouchdbWebViewRef: React.RefObject<WebView>;
    open: (dbName: string) => Promise<any>;
    close: () => Promise<any>;
    destroy: () => Promise<any>;
    put: (doc: any) => Promise<any>;
    bulkPut: (docs: any[]) => Promise<any>;
    get: (docId: string) => Promise<any>;
    find: (query: any) => Promise<any>;
    subscribe: (query: any, callback: SubscriptionCallback) => Promise<() => void>;
};

const DbContext = createContext<DbContextType | undefined>(undefined);

export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const pouchdbWebViewRef = useRef<WebView>(null);
    const pouchdbHtmlUri = Asset.fromModule(require("@/assets/db/pouchdb.html")).uri;
    const pendingRequests = useRef<{ [key: string]: (value: any) => void }>({});
    const subscriptions = useRef<{ [key: string]: SubscriptionCallback }>({});
    const { currentAccount } = useAuth();

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

    useEffect(() => {
        if (currentAccount) {
            const dbName = getDbName(currentAccount.did);
            open(dbName)
                .then((response) => console.log("Database created/opened:", dbName, response))
                .catch((err) => console.error("Error creating/opening database:", dbName, err));
        } else {
            close();
        }
    }, [currentAccount, open]);

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
