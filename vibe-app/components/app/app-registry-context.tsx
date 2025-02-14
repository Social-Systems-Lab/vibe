// app-registry-context.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { InstalledApp } from "../../types/types";
import { useAuth } from "../auth/auth-context";

interface AppRegistryContextValue {
    installedApps: InstalledApp[];
    loadInstalledApps: () => Promise<void>;
    addOrUpdateApp: (app: Partial<InstalledApp>) => Promise<void>;
    removeApp: (appId: string) => Promise<void>;
    setAppPinned: (appId: string, pinned: boolean) => Promise<void>;
    setAppHidden: (appId: string, hidden: boolean) => Promise<void>;
}

export const APPS_KEY_PREFIX = "installed_apps_";

const AppRegistryContext = createContext<AppRegistryContextValue | undefined>(undefined);

export function AppRegistryProvider({ children }: { children: React.ReactNode }) {
    const { currentAccount } = useAuth();
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
