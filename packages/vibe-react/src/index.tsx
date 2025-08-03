"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { VibeSDK, User, ReadCallback, Subscription, createSdk, DocRef, CertType, VibeManifest, SessionState, Document, ReadOnceResponse } from "vibe-sdk";
import LoadingAnimation from "./components/LoadingAnimation";

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
    readOnce: <T extends Document>(collection: string, query?: any) => Promise<ReadOnceResponse<T>>;
    write: (collection: string, data: any) => Promise<any>;
    remove: (collection: string, data: any) => Promise<any>;
    issueCert: (targetDid: string, certType: DocRef, expires?: string) => Promise<any>;
    revokeCert: (certId: string) => Promise<any>;
    // Storage helpers exposed at top-level for app devs
    upload: (file: File) => Promise<{ storageKey: string }>;
    presignPut: (params: { storageKey: string; contentType?: string; metadata?: Record<string, string>; expiresInSeconds?: number }) => Promise<any>;
    presignGet: (params: { storageKey: string; expiresInSeconds?: number }) => Promise<any>;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

const DefaultLoadingComponent = () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <LoadingAnimation />
    </div>
);

export const VibeProvider = ({ children, config, loadingComponent }: { children: ReactNode; config: VibeManifest; loadingComponent?: ReactNode }) => {
    const [sdk] = useState(() => createSdk(config));
    const [user, setUser] = useState<User | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isSessionChecked, setIsSessionChecked] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const initCalled = useRef(false);

    useEffect(() => {
        if (initCalled.current) return;
        initCalled.current = true;

        let isMounted = true;

        const initSdk = async () => {
            const sessionState = await sdk.init();
            if (isMounted) {
                setIsSessionChecked(true);
            }
            return sessionState;
        };

        const unsubscribe = sdk.onStateChange((state) => {
            if (isMounted) {
                setIsLoggedIn(state.isAuthenticated);
                setUser(state.user);
            }
        });

        initSdk().then((sessionState) => {
            if (isMounted && sessionState) {
                if (sessionState.status === "LOGGED_OUT") {
                    sdk.signup();
                }
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [sdk]);

    const login = () => sdk.login();
    const logout = async () => {
        setIsLoggingOut(true);
        await sdk.logout();
    };
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
    const readOnce = <T extends Document>(collection: string, query?: any) => sdk.readOnce<T>(collection, query);
    const write = (collection: string, data: any) => sdk.write(collection, data);
    const remove = (collection: string, data: any) => sdk.remove(collection, data);
    const issueCert = (targetDid: string, certType: DocRef, expires?: string) => sdk.issueCert(targetDid, certType, expires);
    const revokeCert = (certId: string) => sdk.revokeCert(certId);

    // Storage helpers delegating to SDK
    const upload = (file: File) => sdk.storage.upload(file);
    const presignPut = (storageKey: string, contentType?: string, metadata?: Record<string, string>, expiresInSeconds?: number) =>
        sdk.storage.presignPut(storageKey, contentType, metadata, expiresInSeconds);
    const presignGet = (storageKey: string, expiresInSeconds?: number) => sdk.storage.presignGet(storageKey, expiresInSeconds);

    const LoadingComponent = loadingComponent || <DefaultLoadingComponent />;

    if (!isSessionChecked || isLoggingOut) {
        return <>{LoadingComponent}</>;
    }

    if (!isLoggedIn) {
        // Don't render children, but don't show a loading spinner
        // This allows the signup/consent flow to happen
        return null;
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
                upload,
                presignPut,
                presignGet,
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
