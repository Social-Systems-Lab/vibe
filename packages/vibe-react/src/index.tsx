import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import vibe from "@vibe/sdk"; // Import the placeholder SDK
import type { VibeDocument } from "@vibe/shared-types"; // Assuming shared types exist

// --- Types ---

interface VibeContextType {
    // Placeholder values for Iteration 1
    account: string | null; // Placeholder for user account info
    isConnected: boolean; // Placeholder for connection status
    requestPermissions: (options: { permissions: string[] }) => Promise<boolean>;
    write: (collection: string, data: object | object[]) => Promise<any>;
    readOnce: (collection: string, filter?: object) => Promise<any>;
    // read function will be used by useVibeSubscription
    _setTemporaryAuthToken: (token: string | null) => void; // Temporary auth function
}

interface VibeProviderProps {
    children: React.ReactNode;
    // manifest prop might be needed later for agent interaction config
    // manifest?: any;
}

interface UseVibeSubscriptionOptions {
    filter?: object;
    disabled?: boolean; // Option to disable the subscription
}

interface UseVibeSubscriptionResult<T = any> {
    data: VibeDocument<T>[] | null;
    isLoading: boolean;
    error: Error | null;
}

// --- Context ---

const VibeContext = createContext<VibeContextType | undefined>(undefined);

// --- Provider ---

export const VibeProvider: React.FC<VibeProviderProps> = ({ children }) => {
    // Placeholder state for Iteration 1
    const [account, setAccount] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);

    // Placeholder functions wrapping the SDK placeholders
    const requestPermissions = useCallback(async (options: { permissions: string[] }): Promise<boolean> => {
        console.log("[Vibe React Placeholder] requestPermissions called");
        return vibe.requestPermissions(options);
    }, []);

    const write = useCallback(async (collection: string, data: object | object[]): Promise<any> => {
        console.log("[Vibe React Placeholder] write called");
        return vibe.write(collection, data);
    }, []);

    const readOnce = useCallback(async (collection: string, filter?: object): Promise<any> => {
        console.log("[Vibe React Placeholder] readOnce called");
        return vibe.readOnce(collection, filter);
    }, []);

    const _setTemporaryAuthToken = useCallback((token: string | null) => {
        console.log("[Vibe React Placeholder] _setTemporaryAuthToken called");
        vibe._setTemporaryAuthToken(token);
        // Maybe update isConnected state here in later iterations?
        setIsConnected(!!token); // Simple connection status based on token presence for now
        setAccount(token ? "temp-user-id" : null); // Simple account status based on token
    }, []);

    // In future iterations, useEffect would handle agent connection, status updates etc.
    useEffect(() => {
        console.log("[Vibe React Placeholder] Provider mounted");
        // vibe.isAgentAvailable().then(setIsConnected); // Example for later
    }, []);

    const contextValue = useMemo(
        () => ({
            account,
            isConnected,
            requestPermissions,
            write,
            readOnce,
            _setTemporaryAuthToken,
        }),
        [account, isConnected, requestPermissions, write, readOnce, _setTemporaryAuthToken]
    );

    return <VibeContext.Provider value={contextValue}>{children}</VibeContext.Provider>;
};

// --- Hooks ---

/**
 * Hook to access Vibe context (connection status, account, API methods).
 */
export const useVibe = (): VibeContextType => {
    const context = useContext(VibeContext);
    if (context === undefined) {
        throw new Error("useVibe must be used within a VibeProvider");
    }
    return context;
};

/**
 * Hook to subscribe to real-time data updates for a collection.
 * (Placeholder for Iteration 1)
 */
export const useVibeSubscription = <T = any,>(collection: string, options?: UseVibeSubscriptionOptions): UseVibeSubscriptionResult<T> => {
    const { filter, disabled = false } = options || {};
    const [data, setData] = useState<VibeDocument<T>[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(!disabled);
    const [error, setError] = useState<Error | null>(null);

    // Placeholder effect for Iteration 1
    useEffect(() => {
        if (disabled) {
            setIsLoading(false);
            setData(null); // Clear data if disabled
            return;
        }

        console.log(`[Vibe React Placeholder] useVibeSubscription effect for collection '${collection}' with filter:`, filter);
        setIsLoading(true);
        setError(null);

        // Simulate subscription setup and initial data fetch
        const timeoutId = setTimeout(() => {
            console.log(`[Vibe React Placeholder] Simulating initial data for '${collection}'`);
            setData([]); // Start with empty data
            setIsLoading(false);
        }, 500); // Simulate network delay

        // Placeholder unsubscribe from SDK
        const placeholderUnsubscribe = () => {
            console.log(`[Vibe React Placeholder] Simulating unsubscribe for '${collection}'`);
        };
        let subHandle = { unsubscribe: placeholderUnsubscribe };

        // In Iteration 3, this would call vibe.read:
        /*
        let isMounted = true;
        vibe.read(collection, filter, (newData) => {
            if (isMounted) {
                console.log(`[Vibe React] Received update for ${collection}:`, newData);
                // Assuming newData is the full dataset or needs merging
                setData(newData as VibeDocument<T>[]); // Adjust based on actual callback data format
                setIsLoading(false); // Potentially set loading false only on first data
                setError(null);
            }
        })
        .then(handle => {
            if (isMounted) {
                subHandle = handle;
                // Initial data might be handled here or by the first callback trigger
                // setIsLoading(false); // Set loading false after subscription confirmed
            } else {
                handle.unsubscribe(); // Unsubscribe immediately if component unmounted quickly
            }
        })
        .catch(err => {
             if (isMounted) {
                console.error(`[Vibe React] Subscription error for ${collection}:`, err);
                setError(err instanceof Error ? err : new Error("Subscription failed"));
                setIsLoading(false);
             }
        });
        */

        // Cleanup function
        return () => {
            // isMounted = false; // For Iteration 3
            clearTimeout(timeoutId); // Clear simulation timeout
            subHandle.unsubscribe();
        };
    }, [collection, JSON.stringify(filter), disabled]); // Re-run effect if collection or filter changes

    return { data, isLoading, error };
};
