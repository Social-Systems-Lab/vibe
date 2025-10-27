"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import "../input.css";
import LoadingAnimation from "./LoadingAnimation";
import {
    VibeSDK,
    User,
    ReadCallback,
    Subscription,
    createSdk,
    DocRef,
    VibeManifest,
    Document,
    ReadOnceResponse,
} from "vibe-sdk";
import { getStreamUrl } from "../lib/storage";

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
    upload: (file: File) => Promise<{ storageKey: string }>;
    presignPut: (name: string, mime?: string, size?: number, sha256?: string) => Promise<any>;
    presignGet: (storageKey: string, expires?: number) => Promise<any>;
    apiBase: string;
    getToken: () => string | null;
    getStreamUrl: (storageKey: string) => string;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

const DefaultLoadingComponent = () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <LoadingAnimation />
    </div>
);

export const VibeProvider = ({
    children,
    config,
    loadingComponent,
    requireAuth = true,
}: {
    children: ReactNode;
    config: VibeManifest;
    loadingComponent?: ReactNode;
    requireAuth?: boolean;
}) => {
    const [sdk] = useState(() => createSdk(config));
    const [user, setUser] = useState<User | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isSessionChecked, setIsSessionChecked] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const requireAuthRef = useRef(requireAuth);
    const authAttemptRef = useRef(false);
    const isSessionCheckedRef = useRef(false);

    useEffect(() => {
        requireAuthRef.current = requireAuth;
        if (!requireAuth) {
            authAttemptRef.current = false;
        }
    }, [requireAuth]);

    useEffect(() => {
        let isMounted = true;

        const triggerAuth = () => {
            if (!requireAuthRef.current) {
                return;
            }
            if (authAttemptRef.current) {
                return;
            }
            authAttemptRef.current = true;
            sdk.signup();
        };

        const unsubscribe = sdk.onStateChange((state) => {
            if (!isMounted) {
                return;
            }
            setIsLoggedIn(state.isAuthenticated);
            setUser(state.user);
            if (state.isAuthenticated) {
                authAttemptRef.current = false;
            } else {
                // Avoid premature redirects before init completes
                if (isSessionCheckedRef.current) {
                    triggerAuth();
                }
            }
        });

        const initSdk = async () => {
            const sessionState = await sdk.init();
            if (!isMounted) {
                return;
            }
            setIsSessionChecked(true);
            isSessionCheckedRef.current = true;
            if (sessionState && sessionState.status === "LOGGED_OUT") {
                triggerAuth();
            }
        };

        initSdk();

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
    const issueCert = (targetDid: string, certType: DocRef, expires?: string) =>
        sdk.issueCert(targetDid, certType, expires);
    const revokeCert = (certId: string) => sdk.revokeCert(certId);

    // Storage helpers delegating to SDK
    const upload = async (file: File): Promise<{ storageKey: string }> => {
        const res = await sdk.storage.upload(file);
        if (!res || !res.storageKey) {
            throw new Error("upload did not return a storageKey");
        }
        return { storageKey: res.storageKey as string };
    };
    const presignPut = (name: string, mime?: string, size?: number, sha256?: string) =>
        sdk.storage.presignPut(name, mime, size, sha256);
    const presignGet = (storageKey: string, expires?: number) => sdk.storage.presignGet(storageKey, expires);
    const LoadingComponent = loadingComponent || <DefaultLoadingComponent />;

    if (!isSessionChecked || isLoggingOut) {
        return <>{LoadingComponent}</>;
    }

    if (requireAuth && !isLoggedIn) {
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
                apiBase: (config.apiUrl || "").replace(/\/$/, ""),
                getToken: () => sdk.getToken(),
                getStreamUrl: (storageKey: string) =>
                    getStreamUrl(config.apiUrl, storageKey, sdk.getToken() || undefined),
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

