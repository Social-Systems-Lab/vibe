// app-service-context.tsx - Manages installed apps, stored permissions, and provides
// high-level "read/write" methods.

import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { InstalledApp, Operation, PermissionSetting, ReadResult } from "../../types/types";
import { useAuth } from "../auth/auth-context";
import { APPS_KEY_PREFIX } from "@/constants/constants";
import { useDb } from "../db/db-context";

interface AppServiceContextValue {
    installedApps: InstalledApp[];
    loadInstalledApps: () => Promise<void>;
    addOrUpdateApp: (app: Partial<InstalledApp>) => Promise<void>;
    removeApp: (appId: string) => Promise<void>;
    setAppPinned: (appId: string, pinned: boolean) => Promise<void>;
    setAppHidden: (appId: string, hidden: boolean) => Promise<void>;

    checkPermission: (appId: string, operation: Operation, collection: string) => Promise<PermissionSetting>;
    updatePermission: (appId: string, operation: Operation, collection: string, newValue: PermissionSetting) => Promise<void>;
    readOnce: (collection: string, filter: any) => Promise<ReadResult>;
    write: (collection: string, docs: any) => Promise<void>;
}

const AppServiceContext = createContext<AppServiceContextValue | undefined>(undefined);

export function AppServiceProvider({ children }: { children: React.ReactNode }) {
    const { currentAccount } = useAuth();
    const { find, put } = useDb();
    const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
    const APPS_KEY = `${APPS_KEY_PREFIX}${currentAccount?.did}`;

    // On mount, load from AsyncStorage
    useEffect(() => {
        loadInstalledApps();
    }, [currentAccount?.did]);

    async function loadInstalledApps() {
        const data = await AsyncStorage.getItem(APPS_KEY);
        if (data) {
            setInstalledApps(JSON.parse(data));
        } else {
            setInstalledApps([]);
        }
    }

    async function saveInstalledApps(apps: InstalledApp[]) {
        setInstalledApps(apps);
        await AsyncStorage.setItem(APPS_KEY, JSON.stringify(apps));
    }

    // Add or update an app
    async function addOrUpdateApp(app: Partial<InstalledApp>) {
        let existingIndex = installedApps.findIndex((a) => a.appId === app.appId);
        let newList;
        if (existingIndex >= 0) {
            // update
            newList = [...installedApps];
            newList[existingIndex] = { ...installedApps[existingIndex], ...app } as InstalledApp;
        } else {
            // add
            newList = [...installedApps, app as InstalledApp];
        }
        await saveInstalledApps(newList);
    }

    async function removeApp(appId: string) {
        const filtered = installedApps.filter((a) => a.appId !== appId);
        await saveInstalledApps(filtered);
    }

    async function setAppPinned(appId: string, pinned: boolean) {
        const newList = installedApps.map((a) => {
            if (a.appId === appId) return { ...a, pinned };
            return a;
        });
        await saveInstalledApps(newList);
    }

    async function setAppHidden(appId: string, hidden: boolean) {
        const newList = installedApps.map((a) => {
            if (a.appId === appId) return { ...a, hidden };
            return a;
        });
        await saveInstalledApps(newList);
    }

    async function checkPermission(appId: string, operation: Operation, collection: string): Promise<PermissionSetting> {
        // e.g. expecting "read.contacts" or "write.contacts"
        const permKey = `${operation}.${collection}`;
        const app = installedApps.find((a) => a.appId === appId);
        if (!app) throw new Error("App not installed");

        // Get or default to "never"
        const permission = app.permissions?.[permKey] ?? "never";
        return permission;
    }

    async function updatePermission(appId: string, operation: Operation, collection: string, newValue: PermissionSetting) {
        const permKey = `${operation}.${collection}`;
        const app = installedApps.find((a) => a.appId === appId);
        if (!app) return;
        app.permissions = {
            ...app.permissions,
            [permKey]: newValue,
        };
        await saveInstalledApps([...installedApps]);
    }

    async function readOnce(collection: string, filter: any) {
        const query = {
            selector: {
                ...filter,
                $collection: collection,
            },
        };

        console.log("Calling find with the following query: ", JSON.stringify(query, null, 2));

        const result = await find(query);
        let ret: ReadResult = {
            docs: result.docs,
            doc: result.docs[0],
        };
        return ret;
    }

    async function write(collection: string, doc: any) {
        if (!doc) return undefined; // TODO return error message
        if (!doc._id) {
            // create random ID for the document
            // TODO generate uuid
            doc._id = `${collection}/${Date.now()}-${Math.random().toString(16).slice(2)}`;
        } else if (!doc._id.startsWith(`${collection}/`)) {
            // TODO return error message
            return undefined;
        }
        doc.$collection = collection;

        console.log("writing doc", doc);
        const result = await put(doc);
        return result;
    }

    return (
        <AppServiceContext.Provider
            value={{
                installedApps,
                loadInstalledApps,
                addOrUpdateApp,
                removeApp,
                setAppPinned,
                setAppHidden,
                checkPermission,
                updatePermission,
                readOnce,
                write,
            }}
        >
            {children}
        </AppServiceContext.Provider>
    );
}

export function useAppService() {
    const context = useContext(AppServiceContext);
    if (!context) {
        throw new Error("useAppService must be used within an AppServiceProvider");
    }
    return context;
}
