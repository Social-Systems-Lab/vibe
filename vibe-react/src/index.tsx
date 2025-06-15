// packages/vibe-react/src/index.tsx
"use client";

import React, { createContext, useState, useEffect, useContext, useCallback } from "react";
import type { ReactNode } from "react"; // Import ReactNode as a type
import type { IVibeSDK, AppManifest, Unsubscribe, VibeState, PermissionSetting, Identity, ReadResult, WriteResult } from "vibe-sdk";

// Export all types from the vibe-sdk
export type { AppManifest, Unsubscribe, VibeState, PermissionSetting, Identity, ReadResult, WriteResult };

// Define the shape of the context value (includes more state now)
interface VibeContextValue {
    vibe: IVibeSDK | null;
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
    const [vibe, setVibe] = useState<IVibeSDK | null>(null);
    const [vibeState, setVibeState] = useState<VibeState | undefined>(undefined);
    const [sdkUnsubscribe, setSdkUnsubscribe] = useState<Unsubscribe | null>(null);
    // Removed agentUI hook

    // Removed effect connecting UI handlers

    // Initialize the Vibe SDK (from window.vibe) when the provider mounts or manifest changes
    useEffect(() => {
        let isMounted = true;
        let unsubscribeFn: Unsubscribe | null = null;
        let sdkInitialized = false;

        const attemptInitializeSdk = async () => {
            if (sdkInitialized) return; // Prevent multiple initializations

            const sdk = getSdk();
            setVibe(sdk);
            if (!sdk) {
                console.warn("[VibeProvider] window.vibe SDK not yet available. Waiting for 'vibeReady' event.");
                // VibeState remains undefined until SDK is ready
                return;
            }
            sdkInitialized = true; // Mark as attempting/succeeded to prevent re-entry from event if already done

            console.log("[VibeProvider] Initializing Vibe SDK via window.vibe with manifest:", manifest);

            try {
                unsubscribeFn = await sdk.init(manifest, (newState) => {
                    if (isMounted) {
                        console.log("[VibeProvider] Received state update from SDK:", newState);
                        setVibeState(newState);
                    } else {
                        console.log("[VibeProvider] Received state update after unmount, ignoring.");
                    }
                });

                if (isMounted) {
                    console.log("[VibeProvider] SDK init promise resolved successfully.");
                    setSdkUnsubscribe(() => unsubscribeFn);
                } else {
                    console.log("[VibeProvider] Unmounted before SDK init resolved, calling unsubscribe.");
                    unsubscribeFn?.();
                }
            } catch (error) {
                console.error("[VibeProvider] Error during SDK initialization promise:", error);
                if (isMounted) {
                    setVibeState(undefined);
                    setSdkUnsubscribe(null);
                }
            }
        };

        const handleVibeReady = () => {
            console.log("[VibeProvider] 'vibeReady' event received.");
            attemptInitializeSdk();
        };

        // Check if SDK is already there (e.g., if provider mounts after vibeReady)
        if (getSdk()) {
            console.log("[VibeProvider] SDK found on mount, attempting initialization immediately.");
            attemptInitializeSdk();
        } else {
            // Otherwise, listen for the event
            window.addEventListener("vibeReady", handleVibeReady);
        }

        // Cleanup function
        return () => {
            isMounted = false;
            window.removeEventListener("vibeReady", handleVibeReady);
            console.log("[VibeProvider] Cleaning up Vibe SDK subscription.");
            if (unsubscribeFn) {
                console.log("[VibeProvider] Calling unsubscribe function provided by SDK init.");
                unsubscribeFn();
                setSdkUnsubscribe(null);
            } else {
                console.log("[VibeProvider] No unsubscribe function available (init might have failed or not completed).");
            }
        };
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
        vibe,
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
