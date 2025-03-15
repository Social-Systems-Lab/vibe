import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { tabsAtom, activeTabIndexAtom, Tab } from '../atoms';

// The context will store methods to manage tabs
interface TabContextValue {
  tabs: Tab[];
  activeTabId: string | null;
  setActiveTabById: (id: string) => void;
  addTab: (tabProps: Omit<Tab, 'id'>) => void;
  closeTab: (id: string) => void;
  updateTabScreenshot: (tabId: string, screenshot: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabFavicon: (tabId: string, favicon: string) => void;
  resetTabs: () => void;
  reloadTab: (tabId: string) => void;
}

const TabContext = createContext<TabContextValue | undefined>(undefined);

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [activeTabIndex, setActiveTabIndex] = useAtom(activeTabIndexAtom);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Keep activeTabId in sync with activeTabIndex
  useEffect(() => {
    if (tabs.length > 0 && activeTabIndex >= 0 && activeTabIndex < tabs.length) {
      setActiveTabId(tabs[activeTabIndex].id);
    } else {
      setActiveTabId(null);
    }
  }, [tabs, activeTabIndex]);

  // Set active tab by ID instead of index
  const setActiveTabById = (id: string) => {
    const index = tabs.findIndex(tab => tab.id === id);
    if (index !== -1) {
      setActiveTabIndex(index);
    }
  };

  // Add a new tab
  const addTab = (tabProps: Omit<Tab, 'id'>) => {
    const newId = `tab-${Date.now()}`;
    const newTab: Tab = { id: newId, ...tabProps };
    setTabs([...tabs, newTab]);
    setActiveTabIndex(tabs.length); // Set active to the new tab
  };

  // Close a tab by ID
  const closeTab = (tabId: string) => {
    const currentIndex = tabs.findIndex(tab => tab.id === tabId);
    if (currentIndex === -1) return;

    // If we're closing the last tab, create a home tab
    if (tabs.length <= 1) {
      setTabs([{ id: 'home', title: 'Home', url: 'Home', type: 'home' }]);
      setActiveTabIndex(0);
      return;
    }

    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);

    // If we're closing the active tab
    if (currentIndex === activeTabIndex) {
      // If it's the last tab, select the new last tab
      if (currentIndex === tabs.length - 1) {
        setActiveTabIndex(currentIndex - 1);
      }
      // Otherwise, keep the same index (which will now point to the next tab)
    } 
    // If we're closing a tab before the active tab, decrement the active index
    else if (currentIndex < activeTabIndex) {
      setActiveTabIndex(activeTabIndex - 1);
    }
  };

  // Update tab screenshot
  const updateTabScreenshot = (tabId: string, screenshot: string) => {
    setTabs(prevTabs => 
      prevTabs.map(tab => 
        tab.id === tabId ? { ...tab, screenshot } : tab
      )
    );
  };

  // Update tab title
  const updateTabTitle = (tabId: string, title: string) => {
    setTabs(prevTabs => 
      prevTabs.map(tab => 
        tab.id === tabId ? { ...tab, title } : tab
      )
    );
  };

  // Update tab favicon
  const updateTabFavicon = (tabId: string, favicon: string) => {
    setTabs(prevTabs => 
      prevTabs.map(tab => 
        tab.id === tabId ? { ...tab, favicon } : tab
      )
    );
  };

  // Reset tabs to initial state
  const resetTabs = () => {
    setTabs([{ id: 'home', title: 'Home', url: 'Home', type: 'home' }]);
    setActiveTabIndex(0);
  };

  // Reload a tab
  const reloadTab = (tabId: string) => {
    setTabs(prevTabs => 
      prevTabs.map(tab => 
        tab.id === tabId ? { ...tab, reload: Date.now() } : tab
      )
    );
  };

  return (
    <TabContext.Provider
      value={{
        tabs,
        activeTabId,
        setActiveTabById,
        addTab,
        closeTab,
        updateTabScreenshot,
        updateTabTitle,
        updateTabFavicon,
        resetTabs,
        reloadTab
      }}
    >
      {children}
    </TabContext.Provider>
  );
};

export const useTabs = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabs must be used within a TabsProvider');
  }
  return context;
};