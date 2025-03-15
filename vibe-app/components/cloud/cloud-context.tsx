// cloud-context.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useDb } from "@/components/db/db-context";
import * as FileSystem from "expo-file-system";
import { getDirNameFromDid } from "@/lib/utils";

// For demonstration, a few possible statuses:
type ServerStatus = "idle" | "checking" | "online" | "offline" | "error";

interface CloudContextType {
    // Sync
    syncActive: boolean;
    // Server/registration checks
    serverStatus: ServerStatus;
    isRegistered: boolean;

    // Optional methods you may call from screens
    checkServerStatus: () => Promise<boolean>;
    triggerSync: () => Promise<void>;
}

export const CloudContext = createContext<CloudContextType | null>(null);

export const CloudProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentAccount, loadCredentials } = useAuth();
    const { syncWithServer, stopSync } = useDb();

    // States
    const [syncActive, setSyncActive] = useState(false);
    const [serverStatus, setServerStatus] = useState<ServerStatus>("idle");
    const [isRegistered, setIsRegistered] = useState(false);

    // If currentAccount changes (login/logout or new server config):
    useEffect(() => {
        let isCancelled = false;

        async function startSync() {
            // Reset states
            setSyncActive(false);
            setServerStatus("idle");
            setIsRegistered(false);

            if (!currentAccount) {
                return;
            }

            const serverConfig = currentAccount.server;
            // If no server or "none" => no sync
            if (!serverConfig?.url || serverConfig.serverOption === "none") {
                return;
            }

            // Step 1) Check server availability
            await checkServerStatus();

            if (serverStatus !== "online" && serverStatus !== "checking") {
                // If not online, bail out
                return;
            }

            // Step 2) Check local registration (if credentials exist)
            const registered = await checkRegistrationStatus();
            setIsRegistered(registered);

            if (!registered) {
                console.log("Not registered with cloud, skipping auto-sync");
                return;
            }

            // Step 3) If the server is connected in `serverConfig` and we have creds, start sync
            if (serverConfig.isConnected) {
                await doStartSync();
            }
        }

        // Fire it
        startSync();

        // Cleanup on unmount or account switch
        return () => {
            isCancelled = true;
            stopSync()
                .then(() => setSyncActive(false))
                .catch((err) => console.error("Error stopping sync:", err));
        };
    }, [currentAccount]); // only triggers if currentAccount changes

    /**
     * Check the server's /health endpoint, set serverStatus accordingly
     */
    async function checkServerStatus(): Promise<boolean> {
        if (!currentAccount?.server?.url) {
            setServerStatus("idle");
            return false;
        }

        setServerStatus("checking");
        try {
            const response = await fetch(`${currentAccount.server.url}/health`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            if (response.ok) {
                setServerStatus("online");
                return true;
            } else {
                setServerStatus("offline");
                return false;
            }
        } catch (error) {
            console.error("checkServerStatus error:", error);
            setServerStatus("error");
            return false;
        }
    }

    /**
     * Check if the local device has stored credentials for the current account
     */
    async function checkRegistrationStatus(): Promise<boolean> {
        try {
            if (!currentAccount) return false;
            const accountFolder = `${FileSystem.documentDirectory}${getDirNameFromDid(currentAccount.did)}/`;
            const credentialsPath = `${accountFolder}cloud-credentials.enc`;
            const fileInfo = await FileSystem.getInfoAsync(credentialsPath);
            return fileInfo.exists;
        } catch (error) {
            console.error("Error checking registration status:", error);
            return false;
        }
    }

    /**
     * Actually call `syncWithServer(...)`.
     * We do this in a separate function so we can call it from an on-demand "triggerSync" button if needed.
     */
    async function doStartSync() {
        if (!currentAccount?.server?.url) return;

        setSyncActive(false);
        try {
            // Load credentials
            const creds = await loadCredentials(currentAccount);
            if (!creds) {
                console.log("No credentials found, cannot sync");
                return;
            }

            console.log("CloudProvider: starting sync with", creds.dbName);
            await syncWithServer(currentAccount.server.url, creds.username, creds.password, creds.dbName);
            setSyncActive(true);
            console.log("Sync started");
        } catch (err) {
            console.error("Error starting sync:", err);
        }
    }

    /**
     * For screens/components that want to trigger sync manually
     */
    async function triggerSync() {
        // e.g. ensure the server is online, user is registered, etc.
        await checkServerStatus();
        const registered = await checkRegistrationStatus();
        setIsRegistered(registered);
        if (registered && currentAccount?.server?.isConnected) {
            await doStartSync();
        }
    }

    const contextValue: CloudContextType = {
        syncActive,
        serverStatus,
        isRegistered,
        checkServerStatus,
        triggerSync,
    };

    return <CloudContext.Provider value={contextValue}>{children}</CloudContext.Provider>;
};

export function useCloud() {
    const context = useContext(CloudContext);
    if (!context) {
        throw new Error("useCloud must be used within a CloudProvider");
    }
    return context;
}
