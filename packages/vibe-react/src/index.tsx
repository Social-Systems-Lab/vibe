"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { VibeSDK, VibeSDKConfig, User, ReadCallback, Subscription, createSdk, DocRef, CertType } from "vibe-sdk";

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
    read(collection: string, query: any, callback: ReadCallback): Promise<Subscription>;
    readOnce: (collection: string, query?: any) => Promise<any>;
    write: (collection: string, data: any) => Promise<any>;
    remove: (collection: string, data: any) => Promise<any>;
    issueCert: (targetDid: string, certType: DocRef, expires?: string) => Promise<any>;
    revokeCert: (certId: string) => Promise<any>;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

export const VibeProvider = ({ children, config }: { children: ReactNode; config: VibeSDKConfig }) => {
    const [sdk] = useState(() => createSdk(config));
    const [user, setUser] = useState<User | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        const initSdk = async () => {
            await sdk.init();
        };
        initSdk();

        const unsubscribe = sdk.onStateChange((state) => {
            setIsLoggedIn(state.isAuthenticated);
            setUser(state.user);
        });

        return () => {
            unsubscribe();
        };
    }, [sdk]);

    const login = () => sdk.login();
    const logout = () => sdk.logout();
    const signup = () => sdk.signup();
    const manageConsent = () => sdk.manageConsent();
    const manageProfile = () => sdk.manageProfile();
    function read(collection: string, callback: ReadCallback): Promise<Subscription>;
    function read(collection: string, query: any, callback: ReadCallback): Promise<Subscription>;
    function read(collection: string, queryOrCallback: any, callback?: ReadCallback): Promise<Subscription> {
        if (typeof queryOrCallback === "function") {
            return sdk.read(collection, {}, queryOrCallback);
        }
        return sdk.read(collection, queryOrCallback, callback as ReadCallback);
    }
    const readOnce = (collection: string, query?: any) => sdk.readOnce(collection, query);
    const write = (collection: string, data: any) => sdk.write(collection, data);
    const remove = (collection: string, data: any) => sdk.remove(collection, data);
    const issueCert = (targetDid: string, certType: DocRef, expires?: string) => sdk.issueCert(targetDid, certType, expires);
    const revokeCert = (certId: string) => sdk.revokeCert(certId);

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
                issueCert,
                revokeCert,
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
export * from "./components/PermissionSelector";
export * from "./components/PermissionPickerDialog";
export * from "./components/ui/avatar";
export * from "./components/ui/button";
export * from "./components/ui/card";
export * from "./components/ui/dialog";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/input";
export * from "./components/ui/label";
export * from "./components/ui/radio-group";
export * from "./components/ui/textarea";
