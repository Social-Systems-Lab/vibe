// db-context.tsx - Database management for storing user's personal data
// Uses a WebView to interact with the pouchdb library

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { Asset } from "expo-asset";
import { useTabs } from "../ui/tab-context";
import { useAuth } from "../auth/auth-context";

type DbContextType = {
    pouchdbWebViewRef: React.RefObject<WebView>;
};

const DbContext = createContext<DbContextType | undefined>(undefined);

export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const pouchdbWebViewRef = useRef<WebView>(null);
    const pouchdbHtmlUri = Asset.fromModule(require("@/assets/db/pouchdb.html")).uri;
    const pendingRequests = useRef<{ [key: string]: (value: any) => void }>({});
    const { currentAccount } = useAuth();

    // Helper to derive a valid database name from a DID
    const getDbName = (did: string): string => {
        return did.toLowerCase().replace(/[^a-z0-9_$()+/-]/g, "");
    };

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
            }, 60000); // 60 seconds timeout
        });
    }, []);

    // New function to create (or open) a database
    const openDb = useCallback(
        (dbName: string) => {
            return callWebViewFunction({
                action: "openDb",
                payload: { dbName },
            });
        },
        [callWebViewFunction]
    );

    const closeDb = useCallback(() => {
        return callWebViewFunction({
            action: "closeDb",
        });
    }, [callWebViewFunction]);

    useEffect(() => {
        if (currentAccount) {
            const dbName = getDbName(currentAccount.did);
            openDb(dbName)
                .then((response) => console.log("Database created/opened:", dbName, response))
                .catch((err) => console.error("Error creating/opening database:", dbName, err));
        } else {
            closeDb();
        }
    }, [currentAccount, openDb]);

    return (
        <DbContext.Provider
            value={{
                pouchdbWebViewRef: pouchdbWebViewRef,
            }}
        >
            <View style={styles.hidden}>
                <WebView
                    ref={pouchdbWebViewRef}
                    source={{ uri: pouchdbHtmlUri }}
                    javaScriptEnabled
                    onMessage={(event) => {
                        console.log("onMessage", event.nativeEvent.data);
                        const { requestId, response } = JSON.parse(event.nativeEvent.data);

                        // resolve the corresponding Promise
                        if (requestId && pendingRequests.current[requestId]) {
                            pendingRequests.current[requestId](response);
                            delete pendingRequests.current[requestId];
                        }
                    }}
                />
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
