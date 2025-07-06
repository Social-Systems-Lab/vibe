"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { StandaloneStrategy } from "vibe-sdk/src/strategies/standalone";
import { User, ReadCallback, Subscription } from "vibe-sdk/src/types";

interface VibeContextType {
    sdk: StandaloneStrategy;
    user: User | null;
    isLoggedIn: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    signup: () => Promise<void>;
    handleRedirect: () => Promise<void>;
    read(collection: string, callback: ReadCallback): Promise<Subscription>;
    read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription>;
    readOnce: (collection: string, filter?: any) => Promise<any>;
    write: (collection: string, data: any) => Promise<any>;
    remove: (collection: string, data: any) => Promise<any>;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

interface VibeProviderProps {
    children: ReactNode;
    issuer: string;
    clientId: string;
    redirectUri: string;
    scopes: string[];
}

export const VibeProvider = ({ children, issuer, clientId, redirectUri, scopes }: VibeProviderProps) => {
    const [sdk] = useState(() => new StandaloneStrategy({ issuer, clientId, redirectUri, scopes }));
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
    const handleRedirect = () => sdk.handleRedirect();
    function read(collection: string, callback: ReadCallback): Promise<Subscription>;
    function read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription>;
    function read(collection: string, filterOrCb: ReadCallback | any, callback?: ReadCallback): Promise<Subscription> {
        if (typeof filterOrCb === "function") {
            return sdk.read(collection, undefined, filterOrCb);
        }
        return sdk.read(collection, filterOrCb, callback as ReadCallback);
    }
    const readOnce = (collection: string, filter?: any) => sdk.readOnce(collection, filter);
    const write = (collection: string, data: any) => sdk.write(collection, data);
    const remove = (collection: string, data: any) => sdk.remove(collection, data);

    return (
        <VibeContext.Provider value={{ sdk, user, isLoggedIn, login, logout, signup, handleRedirect, read, readOnce, write, remove }}>
            {children}
        </VibeContext.Provider>
    );
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
