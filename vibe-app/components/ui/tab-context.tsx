// tab-context.tsx - This file contains the context and provider for managing tabs in the app.
import React, { createContext, useContext, useState } from "react";

export interface TabInfo {
    id: string;
    title: string;
    type: "home" | "webview";
    url: string; // for webview tabs
    screenshotUri?: string;
}

// The context will store the array of tabs, the active tab ID, and methods.
interface TabContextValue {
    tabs: TabInfo[];
    activeTabId: string;
    setTabs: (tabs: TabInfo[]) => void;
    setActiveTabId: (id: string) => void;
    addTab: (t: Omit<TabInfo, "id">) => void;
    closeTab: (id: string) => void;
    updateTabScreenshot: (tabId: string, uri: string) => void;
}

const TabContext = createContext<TabContextValue | undefined>(undefined);

export const TabsProvider = ({ children }: { children: React.ReactNode }) => {
    // Start with a single home tab
    const [tabs, setTabsState] = useState<TabInfo[]>([{ id: "home", title: "Home", type: "home", url: "Home" }]);

    const [activeTabId, setActiveTabId] = useState<string>("home");

    function setTabs(newTabs: TabInfo[]) {
        setTabsState(newTabs);
        // if the current active tab is closed, switch to the last tab or none
        if (!newTabs.find((t) => t.id === activeTabId)) {
            if (newTabs.length > 0) {
                setActiveTabId(newTabs[newTabs.length - 1].id);
            } else {
                setActiveTabId("");
            }
        }
    }

    function addTab(tabProps: Omit<TabInfo, "id">) {
        const newId = `tab-${Date.now()}`;
        const newTab: TabInfo = { id: newId, ...tabProps };
        setTabs([...tabs, newTab]);
        setActiveTabId(newId);
    }

    function closeTab(tabId: string) {
        setTabs(tabs.filter((t) => t.id !== tabId));
    }

    function updateTabScreenshot(tabId: string, screenshotUri: string) {
        setTabsState((prevTabs) => {
            return prevTabs.map((t) => (t.id === tabId ? { ...t, screenshotUri } : t));
        });
    }

    return (
        <TabContext.Provider
            value={{
                tabs,
                activeTabId,
                setTabs,
                setActiveTabId,
                addTab,
                closeTab,
                updateTabScreenshot,
            }}
        >
            {children}
        </TabContext.Provider>
    );
};

export const useTabs = () => {
    const context = useContext(TabContext);
    if (!context) {
        throw new Error("useTabs must be used within a TabsProvider");
    }
    return context;
};
