// app-registry-context.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { InstalledApp } from "../../types/types";

interface AppRegistryContextValue {
    installedApps: InstalledApp[];
    loadInstalledApps: () => Promise<void>;
    addOrUpdateApp: (app: InstalledApp) => Promise<void>;
    removeApp: (appId: string) => Promise<void>;
    setAppPinned: (appId: string, pinned: boolean) => Promise<void>;
    setAppHidden: (appId: string, hidden: boolean) => Promise<void>;
    // ... any other modifications, e.g. reorder apps
}

const AppRegistryContext = createContext<AppRegistryContextValue | undefined>(undefined);

const APPS_KEY = "installed_apps"; // the key in AsyncStorage

export function AppRegistryProvider({ children }: { children: React.ReactNode }) {
    const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);

    // On mount, load from AsyncStorage
    useEffect(() => {
        loadInstalledApps();
    }, []);

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
    async function addOrUpdateApp(app: InstalledApp) {
        let existingIndex = installedApps.findIndex((a) => a.appId === app.appId);
        let newList;
        if (existingIndex >= 0) {
            // update
            newList = [...installedApps];
            newList[existingIndex] = { ...installedApps[existingIndex], ...app };
        } else {
            // add
            newList = [...installedApps, app];
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

    return (
        <AppRegistryContext.Provider
            value={{
                installedApps,
                loadInstalledApps,
                addOrUpdateApp,
                removeApp,
                setAppPinned,
                setAppHidden,
            }}
        >
            {children}
        </AppRegistryContext.Provider>
    );
}

export function useAppRegistry() {
    const context = useContext(AppRegistryContext);
    if (!context) {
        throw new Error("useAppRegistry must be used within an AppRegistryProvider");
    }
    return context;
}
