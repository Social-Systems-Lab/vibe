// apps/test/src/vibe/react.tsx
"use client"; // Required for React hooks like useState, useEffect, useContext

import React, { createContext, useState, useEffect, useContext, useCallback } from "react";
import type { ReactNode } from "react";
import { vibe } from "./sdk"; // Import the singleton instance of our mock SDK
import type { Account, AppManifest, Unsubscribe, VibeState } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Define the shape of the context value
interface VibeContextValue {
    account: Account | null | undefined; // Updated type to include null
    init: () => void; // Expose init in case manual re-init is needed (though unlikely with mock)
    readOnce: (collection: string, filter?: any) => Promise<any>;
    read: (collection: string, filter?: any, callback?: (result: any) => void) => Promise<Unsubscribe>; // read returns Promise<Unsubscribe>
    write: (collection: string, data: any | any[]) => Promise<any>;
}

// Create the context
const VibeContext = createContext<VibeContextValue | undefined>(undefined);

// Define props for the provider component
interface VibeProviderProps {
    children: ReactNode;
    manifest: AppManifest; // The application manifest is required
}

export function VibeProvider({ children, manifest }: VibeProviderProps) {
    const [vibeState, setVibeState] = useState<VibeState | undefined>(undefined);

    // Initialize the Vibe SDK when the provider mounts
    useEffect(() => {
        console.log("[VibeProvider] Initializing Vibe SDK with manifest:", manifest);
        // vibe.init returns an unsubscribe function for cleanup
        const unsubscribeFromSdk = vibe.init(manifest, (newState) => {
            console.log("[VibeProvider] Received state update from SDK:", newState);
            setVibeState(newState);
        });

        // Cleanup function to be called when the component unmounts
        return () => {
            console.log("[VibeProvider] Cleaning up Vibe SDK subscription.");
            unsubscribeFromSdk();
        };
    }, [manifest]); // Re-run effect if the manifest changes (though unlikely for mock)

    // Manual init function (mostly for consistency, auto-init is handled by useEffect)
    const init = useCallback(() => {
        console.warn("[VibeProvider] Manual init called. SDK is auto-initialized.");
        // Optionally, could re-trigger init if needed, but might cause issues
        // vibe.init(manifest, setVibeState);
    }, [manifest]);

    // Wrappers around vibe SDK methods using useCallback for stability
    const readOnce = useCallback((collection: string, filter?: any) => {
        console.log(`[VibeProvider] Calling readOnce: ${collection}`);
        return vibe.readOnce(collection, filter);
    }, []);

    const read = useCallback((collection: string, filter?: any, callback?: (result: any) => void) => {
        console.log(`[VibeProvider] Calling read: ${collection}`);
        return vibe.read(collection, filter, callback);
    }, []);

    const write = useCallback((collection: string, data: any | any[]) => {
        console.log(`[VibeProvider] Calling write: ${collection}`);
        return vibe.write(collection, data);
    }, []);

    // Provide the state and methods through the context
    const contextValue: VibeContextValue = {
        account: vibeState?.account,
        init,
        readOnce,
        read,
        write,
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
