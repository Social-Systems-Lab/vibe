// apps/test/src/vibe/react.tsx
"use client";

import React, { createContext, useState, useEffect, useContext, useCallback } from "react";
import type { ReactNode } from "react";
import { vibe, mockAgentInstance } from "./sdk"; // Import SDK singleton AND agent instance
import { useAgentUI } from "./ui-context"; // Import the UI context hook
// Import types
import type { Account, AppManifest, Unsubscribe, VibeState, PermissionSetting, Identity } from "./types"; // Added Identity

/* eslint-disable @typescript-eslint/no-explicit-any */

// Define the shape of the context value (includes more state now)
interface VibeContextValue {
    account: Account | null | undefined;
    permissions: Record<string, PermissionSetting> | null | undefined;
    activeIdentity: Identity | null | undefined;
    identities: Identity[] | undefined;
    // Agent interaction methods (potentially add more like createIdentity, switchIdentity)
    init: () => void;
    readOnce: (collection: string, filter?: any) => Promise<any>;
    read: (collection: string, filter?: any, callback?: (result: any) => void) => Promise<Unsubscribe>;
    write: (collection: string, data: any | any[]) => Promise<any>;
    // Identity Management Methods
    createIdentity: (label: string, pictureUrl?: string) => Promise<Identity | null>;
    setActiveIdentity: (did: string) => Promise<void>;
    // TODO: Add permission management methods if needed directly in context
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
    const agentUI = useAgentUI(); // Get the UI context methods

    // Effect to connect Agent UI handlers to the Agent instance
    useEffect(() => {
        // Ensure agent instance exists and has the method (type safety)
        if (mockAgentInstance && typeof mockAgentInstance.setUIHandlers === "function") {
            mockAgentInstance.setUIHandlers({
                requestConsent: agentUI.requestConsent,
                requestActionConfirmation: agentUI.requestActionConfirmation,
            });
            console.log("[VibeProvider] Connected Agent UI handlers to MockVibeAgent instance.");
        } else {
            console.error("[VibeProvider] Failed to connect Agent UI handlers: mockAgentInstance or setUIHandlers not available.");
        }
        // This effect should likely only run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agentUI.requestConsent, agentUI.requestActionConfirmation]); // Dependencies ensure stable functions are used

    // Initialize the Vibe SDK when the provider mounts
    useEffect(() => {
        console.log("[VibeProvider] Initializing Vibe SDK with manifest:", manifest);
        // vibe.init returns an unsubscribe function for cleanup
        const unsubscribeFromSdk = vibe.init(manifest, (newState) => {
            console.log("[VibeProvider] Received state update from SDK:", newState);
            // Update the full state, including identities and active identity
            setVibeState(newState);
        });

        // Cleanup function to be called when the component unmounts
        return () => {
            console.log("[VibeProvider] Cleaning up Vibe SDK subscription.");
            unsubscribeFromSdk();
        };
    }, [manifest]); // Re-run effect if the manifest changes

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

    // Provide the full state and methods through the context
    const contextValue: VibeContextValue = {
        account: vibeState?.account,
        permissions: vibeState?.permissions,
        activeIdentity: vibeState?.activeIdentity, // Add activeIdentity
        identities: vibeState?.identities, // Add identities
        init,
        readOnce,
        read,
        write,
        // --- Identity Management Implementation ---
        createIdentity: async (label: string, pictureUrl?: string): Promise<Identity | null> => {
            try {
                const newIdentity = await mockAgentInstance.createIdentity(label, pictureUrl);
                // Refresh state after creation
                const updatedState = await mockAgentInstance.getVibeState();
                setVibeState(updatedState);
                return newIdentity;
            } catch (error) {
                console.error("[VibeProvider] Error creating identity:", error);
                // Handle error appropriately, maybe update state with error info
                return null;
            }
        },
        setActiveIdentity: async (did: string): Promise<void> => {
            try {
                await mockAgentInstance.setActiveIdentity(did);
                // Refresh state after switching
                const updatedState = await mockAgentInstance.getVibeState();
                setVibeState(updatedState);
            } catch (error) {
                console.error("[VibeProvider] Error setting active identity:", error);
                // Handle error
            }
        },
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
