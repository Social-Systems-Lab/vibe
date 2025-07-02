"use client";

import React, { createContext, useContext, ReactNode, useState, useCallback } from "react";
import { VibeSDK, createSdk, VibeSDKConfig } from "vibe-sdk";

interface VibeContextValue {
    sdk: VibeSDK | null;
    isAuthenticated: boolean;
    user: any;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    signup: () => Promise<void>;
}

const VibeContext = createContext<VibeContextValue | undefined>(undefined);

interface VibeProviderProps {
    children: ReactNode;
    config: VibeSDKConfig;
}

export function VibeProvider({ children, config }: VibeProviderProps) {
    const [sdk] = useState(() => createSdk(config));
    const [isAuthenticated, setIsAuthenticated] = useState(sdk.isAuthenticated);
    const [user, setUser] = useState<any>(sdk.user);

    const login = useCallback(async () => {
        await sdk.login();
        setIsAuthenticated(sdk.isAuthenticated);
        setUser(sdk.user);
    }, [sdk]);

    const logout = useCallback(async () => {
        await sdk.logout();
        setIsAuthenticated(sdk.isAuthenticated);
        setUser(sdk.user);
    }, [sdk]);

    const signup = useCallback(async () => {
        await sdk.signup();
        setIsAuthenticated(sdk.isAuthenticated);
        setUser(sdk.user);
    }, [sdk]);

    const contextValue: VibeContextValue = {
        sdk,
        isAuthenticated,
        user,
        login,
        logout,
        signup,
    };

    return <VibeContext.Provider value={contextValue}>{children}</VibeContext.Provider>;
}

export function useVibe() {
    const context = useContext(VibeContext);
    if (context === undefined) {
        throw new Error("useVibe must be used within a VibeProvider");
    }
    return context;
}

export * from "./components/LoginButton";
export * from "./components/SignupButton";
export * from "./components/ProfileMenu";

// Vibe React Library
