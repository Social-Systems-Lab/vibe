"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { StandaloneStrategy } from "vibe-sdk/src/strategies/standalone";
import { User } from "vibe-sdk/src/types";

interface VibeContextType {
    sdk: StandaloneStrategy;
    user: User | null;
    isLoggedIn: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    signup: () => Promise<void>;
    read: (collection: string, filter?: any) => Promise<any>;
    readOnce: (collection: string, filter?: any) => Promise<any>;
    write: (collection: string, data: any) => Promise<any>;
    delete: (collection: string, data: any) => Promise<any>;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

export const VibeProvider = ({ children, config }: { children: ReactNode; config: any }) => {
    const [sdk] = useState(() => new StandaloneStrategy());
    const [user, setUser] = useState<User | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        const init = async () => {
            await sdk.init();
            const currentUser = await sdk.getUser();
            setUser(currentUser);
            setIsLoggedIn(!!currentUser);
        };
        init();

        const unsubscribe = sdk.onStateChange(async (loggedIn: boolean) => {
            setIsLoggedIn(loggedIn);
            if (loggedIn) {
                const currentUser = await sdk.getUser();
                setUser(currentUser);
            } else {
                setUser(null);
            }
        });

        return () => unsubscribe();
    }, [sdk]);

    const login = () => sdk.login();
    const logout = () => sdk.logout();
    const signup = () => sdk.signup();
    const read = (collection: string, filter?: any) => sdk.read(collection, filter);
    const readOnce = (collection: string, filter?: any) => sdk.readOnce(collection, filter);
    const write = (collection: string, data: any) => sdk.write(collection, data);
    const del = (collection: string, data: any) => sdk.delete(collection, data);

    return <VibeContext.Provider value={{ sdk, user, isLoggedIn, login, logout, signup, read, readOnce, write, delete: del }}>{children}</VibeContext.Provider>;
};

export const useVibe = () => {
    const context = useContext(VibeContext);
    if (context === undefined) {
        throw new Error("useVibe must be used within a VibeProvider");
    }
    return context;
};

export * from "./components/LoginButton";
export * from "./components/SignupButton";
export * from "./components/ProfileMenu";
export * from "./components/AuthWidget";
