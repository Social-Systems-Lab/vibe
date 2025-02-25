// vibe-context.tsx
"use client";

import { createContext, useState, useEffect, useContext, useCallback, ReactNode } from "react";
import { vibe, VibeState, AppManifest, Account, Unsubscribe } from "vibe-sdk";

/* eslint-disable  @typescript-eslint/no-explicit-any */
interface VibeContextValue {
    account: Account | undefined;
    init: () => void; // manually call vibe.init if needed
    readOnce: (collection: string, filter?: any) => Promise<any>;
    read: (collection: string, filter?: any, callback?: (result: any) => void) => Unsubscribe;
    write: (collection: string, data: any) => Promise<any>;
}

const VibeContext = createContext<VibeContextValue | undefined>(undefined);

interface VibeProviderProps {
    children: ReactNode;
    manifest: AppManifest; // e.g. { id, name, description, permissions, onetapEnabled, etc. }
    autoInit?: boolean; // if true, call vibe.init automatically
}

export function VibeProvider({ children, manifest, autoInit = true }: VibeProviderProps) {
    const [vibeState, setVibeState] = useState<VibeState | undefined>(undefined);
    const [isVibeActive, setIsVibeActive] = useState(false);

    // Check window._VIBE_ENABLED
    useEffect(() => {
        if (typeof window === "undefined") return;
        const checkVibe = () => {
            if (window._VIBE_ENABLED) {
                setIsVibeActive(true);
            } else {
                setIsVibeActive(false);
                setTimeout(checkVibe, 500); // Poll every 0.5s if you want
            }
        };
        checkVibe();
    }, []);

    // If isVibeActive + autoInit, call vibe.init
    useEffect(() => {
        if (!isVibeActive || !autoInit) return;

        const unsubscribe = vibe.init(manifest, (state) => {
            setVibeState(state);
        });
        return () => {
            unsubscribe();
        };
    }, [isVibeActive, autoInit, manifest]);

    // Manual init function (if autoInit=false, you can call this yourself)
    const init = useCallback(() => {
        vibe.init(manifest, (state) => setVibeState(state));
    }, [manifest]);

    // Wrappers around vibe.readOnce, vibe.read and vibe.write
    const readOnce = useCallback((collection: string, filter?: any) => {
        return vibe.readOnce(collection, filter);
    }, []);

    const read = useCallback((collection: string, filter?: any, callback?: (result: any) => void) => {
        return vibe.read(collection, filter, callback);
    }, []);

    const write = useCallback((collection: string, data: any) => {
        return vibe.write(collection, data);
    }, []);

    return (
        <VibeContext.Provider
            value={{
                account: vibeState?.account,
                init,
                readOnce,
                read,
                write,
            }}
        >
            {children}
        </VibeContext.Provider>
    );
}

// Custom hook to consume the context
export function useVibe() {
    const context = useContext(VibeContext);
    if (!context) {
        throw new Error("useVibe must be used within a <VibeProvider>.");
    }
    return context;
}
