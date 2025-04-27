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

    // Initialize the Vibe SDK (from window.vibe) when the provider mounts or manifest changes
    useEffect(() => {
        const sdk = getSdk();
        if (!sdk) {
            console.error("[VibeProvider] window.vibe SDK not found on mount. AgentProvider might be missing or hasn't initialized yet.");
            setVibeState(undefined); // Ensure state is cleared if SDK is missing
            return;
        }

        console.log("[VibeProvider] Initializing Vibe SDK via window.vibe with manifest:", manifest);
        let isMounted = true;
        let unsubscribeFn: Unsubscribe | null = null;

        const initializeSdk = async () => {
            try {
                // The onStateChange callback will be called by the AgentProvider's window.vibe.init
                // *after* the agent's internal init (including potential UI prompts) completes successfully.
                unsubscribeFn = await sdk.init(manifest, (newState) => {
                    if (isMounted) {
                        console.log("[VibeProvider] Received final state update from SDK after init:", newState);
                        setVibeState(newState); // Set state based on the final update from successful init
                    } else {
                        console.log("[VibeProvider] Received state update after unmount, ignoring.");
                    }
                });

                // Store the unsubscribe function if mounted
                if (isMounted) {
                    console.log("[VibeProvider] SDK init promise resolved successfully.");
                    setSdkUnsubscribe(() => unsubscribeFn);
                } else {
                    // If component unmounted before init promise resolved, call unsubscribe immediately
                    console.log("[VibeProvider] Unmounted before SDK init resolved, calling unsubscribe.");
                    unsubscribeFn?.();
                }
            } catch (error) {
                // This catch block handles errors thrown by agent.init OR rejections from window.vibe.init
                // (e.g., if consent was denied and AgentProvider rejects the promise)
                console.error("[VibeProvider] Error during SDK initialization promise:", error);
                if (isMounted) {
                    // Clear state on initialization error or denial
                    setVibeState(undefined);
                    setSdkUnsubscribe(null); // Ensure no stale unsubscribe function
                }
            }
        };

        initializeSdk();

        // Cleanup function
        return () => {
            isMounted = false;
            console.log("[VibeProvider] Cleaning up Vibe SDK subscription.");
            // Use the unsubscribe function obtained from the successful init promise
            if (unsubscribeFn) {
                console.log("[VibeProvider] Calling unsubscribe function provided by SDK init.");
                unsubscribeFn();
                // Also clear the stored state version if necessary, though unsubscribeFn should be sufficient
                setSdkUnsubscribe(null);
            } else {
                console.log("[VibeProvider] No unsubscribe function available (init might have failed or not completed).");
            }
            // Clear Vibe state on cleanup? Optional, depends on desired behavior on unmount/manifest change.
            // setVibeState(undefined);
        };
        // Re-run effect if the manifest changes
    }, [manifest]); // sdkUnsubscribe is managed internally via unsubscribeFn closure

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
