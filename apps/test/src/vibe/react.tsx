// apps/test/src/vibe/react.tsx
"use client";

// apps/test/src/vibe/react.tsx
"use client";

import React, { createContext, useState, useEffect, useContext, useCallback } from "react";
import type { ReactNode } from "react"; // Import ReactNode as a type
// Removed SDK/Agent instance imports
// Removed ui-context import
import type { IVibeSDK } from "./sdk"; // Import the SDK interface type
// Import types
import type { Account, AppManifest, Unsubscribe, VibeState, PermissionSetting, Identity, ReadResult, WriteResult } from "./types"; // Added Identity, ReadResult, WriteResult

/* eslint-disable @typescript-eslint/no-explicit-any */

// Define the shape of the context value (includes more state now)
interface VibeContextValue {
    account: Account | null | undefined;
    permissions: Record<string, PermissionSetting> | null | undefined;
    activeIdentity: Identity | null | undefined; // Still part of VibeState
    identities: Identity[] | undefined; // Still part of VibeState
    // SDK interaction methods ONLY
    init: () => void; // Keep manual init trigger if desired, though auto-init is primary
    readOnce: (collection: string, filter?: any) => Promise<ReadResult<any>>;
    read: (collection: string, filter?: any, callback?: (result: ReadResult<any>) => void) => Promise<Unsubscribe>;
    write: (collection: string, data: any | any[]) => Promise<WriteResult>;
    // Identity Management methods REMOVED - Handled by AgentProvider/useAgent
}

// Create the context
const VibeContext = createContext<VibeContextValue | undefined>(undefined);

// Helper function to get the SDK from window, with type safety
const getSdk = (): IVibeSDK | null => {
    return (window as any).vibe as IVibeSDK | null;
};

// Define props for the provider component
interface VibeProviderProps {
    children: ReactNode;
    manifest: AppManifest; // The application manifest is required
}

export function VibeProvider({ children, manifest }: VibeProviderProps) {
    const [vibeState, setVibeState] = useState<VibeState | undefined>(undefined);
    const [sdkUnsubscribe, setSdkUnsubscribe] = useState<Unsubscribe | null>(null);
    // Removed agentUI hook

    // Removed effect connecting UI handlers

    // Initialize the Vibe SDK (from window.vibe) when the provider mounts
    useEffect(() => {
        const sdk = getSdk();
        if (!sdk) {
            console.error("[VibeProvider] window.vibe SDK not found on mount. AgentProvider might be missing or hasn't initialized yet.");
            // TODO: How to handle this? Maybe retry later? For now, just log error.
            return;
        }

        console.log("[VibeProvider] Initializing Vibe SDK via window.vibe with manifest:", manifest);
        let isMounted = true; // Prevent state updates after unmount

        const initialize = async () => {
            try {
                const unsubscribeFn = await sdk.init(manifest, (newState) => {
                    if (isMounted) {
                        console.log("[VibeProvider] Received state update from SDK:", newState);
                        setVibeState(newState);
                    }
                });
                if (isMounted) {
                    setSdkUnsubscribe(() => unsubscribeFn); // Store the unsubscribe function
                } else {
                    // If component unmounted before init finished, call unsubscribe immediately
                    unsubscribeFn();
                }
            } catch (error) {
                console.error("[VibeProvider] Error during SDK initialization:", error);
                if (isMounted) {
                    // Set state to indicate error? Or just rely on console?
                    setVibeState(undefined); // Clear state on init error
                }
            }
        };

        initialize();

        // Cleanup function
        return () => {
            isMounted = false;
            console.log("[VibeProvider] Cleaning up Vibe SDK subscription.");
            if (sdkUnsubscribe) {
                // Use the stored unsubscribe function
                sdkUnsubscribe();
                setSdkUnsubscribe(null);
            }
        };
        // Only re-run if manifest changes. sdkUnsubscribe is managed internally.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manifest]);

    // Manual init function (less critical now, but can be kept)
    const init = useCallback(() => {
        console.warn("[VibeProvider] Manual init called. SDK should auto-initialize via AgentProvider.");
        // Could potentially re-trigger the useEffect logic if needed, but might be complex.
    }, []);

    // Wrappers around window.vibe SDK methods
    const readOnce = useCallback(async (collection: string, filter?: any): Promise<ReadResult<any>> => {
        const sdk = getSdk();
        if (!sdk) throw new Error("Vibe SDK (window.vibe) not available.");
        console.log(`[VibeProvider] Calling window.vibe.readOnce: ${collection}`);
        return sdk.readOnce(collection, filter);
    }, []);

    const read = useCallback(async (collection: string, filter?: any, callback?: (result: ReadResult<any>) => void): Promise<Unsubscribe> => {
        const sdk = getSdk();
        if (!sdk) throw new Error("Vibe SDK (window.vibe) not available.");
        console.log(`[VibeProvider] Calling window.vibe.read: ${collection}`);
        return sdk.read(collection, filter, callback);
    }, []);

    const write = useCallback(async (collection: string, data: any | any[]): Promise<WriteResult> => {
        const sdk = getSdk();
        if (!sdk) throw new Error("Vibe SDK (window.vibe) not available.");
        console.log(`[VibeProvider] Calling window.vibe.write: ${collection}`);
        return sdk.write(collection, data);
    }, []);

    // Provide the application-level state and SDK methods through the context
    const contextValue: VibeContextValue = {
        account: vibeState?.account,
        permissions: vibeState?.permissions,
        activeIdentity: vibeState?.activeIdentity,
        identities: vibeState?.identities,
        init,
        readOnce,
        read,
        write,
        // Identity management methods REMOVED
    };

    return <VibeContext.Provider value={contextValue}>{children}</VibeContext.Provider>;
}

// Custom hook to easily consume the Vibe context
export function useVibe() {
    const context = useContext(VibeContext);
    if (context === undefined) {
        // Provide a helpful error message if used outside the provider
        throw new Error("useVibe must be used within a <VibeProvider>");
    }
    return context;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
