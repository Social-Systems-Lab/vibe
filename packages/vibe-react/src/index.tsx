"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { VibeSDK, VibeSDKConfig, User, ReadCallback, Subscription } from "vibe-sdk";

interface VibeContextType {
    sdk: VibeSDK;
    user: User | null;
    isLoggedIn: boolean;
    appName?: string;
    appImageUrl?: string;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    signup: () => Promise<void>;
    manageConsent: () => Promise<void>;
    manageProfile: () => Promise<void>;
    read(collection: string, callback: ReadCallback): Promise<Subscription>;
    read(collection: string, filter: any, callback: ReadCallback): Promise<Subscription>;
    readOnce: (collection: string, filter?: any) => Promise<any>;
    write: (collection: string, data: any) => Promise<any>;
    remove: (collection: string, data: any) => Promise<any>;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

export const VibeProvider = ({ children, config }: { children: ReactNode; config: VibeSDKConfig }) => {
    const [sdk] = useState(() => new VibeSDK(config));
    const [user, setUser] = useState<User | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        const initSdk = async () => {
            await sdk.init();
            setIsLoggedIn(sdk.isAuthenticated);
            setUser(sdk.user);
        };
        initSdk();
    }, [sdk]);

    const login = () => sdk.login();
    const logout = () => sdk.logout();
    const signup = () => sdk.signup();
    const manageConsent = async () => {
        // This function is specific to StandaloneStrategy, so we need to check the type.
        if ("manageConsent" in sdk) {
            await (sdk as any).manageConsent();
        } else {
            console.warn("manageConsent is not available in the current SDK strategy.");
        }
    };
    const manageProfile = async () => {
        if ("manageProfile" in sdk) {
            await (sdk as any).manageProfile();
        } else {
            console.warn("manageProfile is not available in the current SDK strategy.");
        }
    };
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
        <VibeContext.Provider
            value={{
                sdk,
                user,
                isLoggedIn,
                login,
                logout,
                signup,
                read,
                readOnce,
                write,
                remove,
                appName: config.appName,
                appImageUrl: config.appImageUrl,
                manageConsent,
                manageProfile,
            }}
        >
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
