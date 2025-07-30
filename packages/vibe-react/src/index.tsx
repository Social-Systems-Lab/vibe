"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { VibeSDK, User, ReadCallback, Subscription, createSdk, DocRef, CertType, VibeManifest } from "vibe-sdk";

interface VibeContextType {
    sdk: VibeSDK;
    user: User | null;
    isLoggedIn: boolean;
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

const DefaultLoadingComponent = () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p>Loading...</p>
    </div>
);

export const VibeProvider = ({ children, config, loadingComponent }: { children: ReactNode; config: VibeManifest; loadingComponent?: ReactNode }) => {
    const [sdk] = useState(() => createSdk(config));
    const [user, setUser] = useState<User | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isSessionChecked, setIsSessionChecked] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const initSdk = async () => {
            await sdk.init();
            if (isMounted) {
                setIsSessionChecked(true);
            }
        };

        const unsubscribe = sdk.onStateChange((state) => {
            if (isMounted) {
                setIsLoggedIn(state.isAuthenticated);
                setUser(state.user);
            }
        });

        initSdk();

        return () => {
            isMounted = false;
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

    const LoadingComponent = loadingComponent || <DefaultLoadingComponent />;

    if (!isSessionChecked) {
        return <>{LoadingComponent}</>;
    }

    if (!isLoggedIn) {
        sdk.signup();
        return <>{LoadingComponent}</>;
    }

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

export * from "./components/ProfileMenu";
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
export * from "./components/ui/squircle";
