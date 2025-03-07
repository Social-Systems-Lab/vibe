import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react'

export interface Tab {
  id: string
  url: string
  title: string
  favicon?: string
  isActive: boolean
  isLoading: boolean
  screenshotUrl?: string
  reload: boolean
}

interface TabContextType {
  tabs: Tab[]
  activeTab: Tab | null
  addTab: (url: string) => void
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<Tab>) => void
  updateTabUrl: (tabId: string, url: string) => void
  reloadTab: (tabId: string) => void
  updateTabScreenshot: (tabId: string, screenshotUrl: string) => void
  clearTabs: () => void
  resetTabs: () => void
}

const TabContext = createContext<TabContextType | undefined>(undefined)

export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<Tab | null>(null)

  // Initialize with a home tab
  useEffect(() => {
    if (tabs.length === 0) {
      addTab('about:blank')
    }
  }, [])

  const addTab = useCallback((url: string) => {
    const newTab: Tab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      title: 'New Tab',
      isActive: true,
      isLoading: true,
      reload: false
    }

    setTabs(prevTabs => {
      // Set all other tabs to inactive
      const updatedTabs = prevTabs.map(tab => ({ ...tab, isActive: false }))
      return [...updatedTabs, newTab]
    })

    setActiveTab(newTab)
  }, [])

  const closeTab = useCallback((tabId: string) => {
    const tabIndex = tabs.findIndex(tab => tab.id === tabId)
    if (tabIndex === -1) return

    setTabs(prevTabs => {
      const updatedTabs = [...prevTabs]
      updatedTabs.splice(tabIndex, 1)

      // If we closed the active tab, activate another one
      if (prevTabs[tabIndex].isActive && updatedTabs.length > 0) {
        // Try to activate the tab to the left, or the first tab if none to the left
        const newActiveIndex = Math.max(0, tabIndex - 1)
        updatedTabs[newActiveIndex].isActive = true
        setActiveTab(updatedTabs[newActiveIndex])
      }

      // If we closed the last tab, add a blank one
      if (updatedTabs.length === 0) {
        const newTab: Tab = {
          id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: 'about:blank',
          title: 'New Tab',
          isActive: true,
          isLoading: true,
          reload: false
        }
        setActiveTab(newTab)
        return [newTab]
      }

      return updatedTabs
    })
  }, [tabs])

  const activateTab = useCallback((tabId: string) => {
    const tabToActivate = tabs.find(tab => tab.id === tabId)
    if (!tabToActivate) return

    setTabs(prevTabs => {
      return prevTabs.map(tab => ({
        ...tab,
        isActive: tab.id === tabId
      }))
    })

    setActiveTab(tabToActivate)
  }, [tabs])

  const updateTab = useCallback((tabId: string, updates: Partial<Tab>) => {
    setTabs(prevTabs => {
      const updatedTabs = prevTabs.map(tab => {
        if (tab.id === tabId) {
          const updatedTab = { ...tab, ...updates }
          if (tab.isActive) {
            setActiveTab(updatedTab)
          }
          return updatedTab
        }
        return tab
      })
      return updatedTabs
    })
  }, [])

  const updateTabUrl = useCallback((tabId: string, url: string) => {
    updateTab(tabId, { url, isLoading: true })
  }, [updateTab])

  const reloadTab = useCallback((tabId: string) => {
    updateTab(tabId, { reload: true, isLoading: true })
    // Reset the reload flag after a short delay
    setTimeout(() => {
      updateTab(tabId, { reload: false })
    }, 100)
  }, [updateTab])

  const updateTabScreenshot = useCallback((tabId: string, screenshotUrl: string) => {
    updateTab(tabId, { screenshotUrl })
  }, [updateTab])

  const clearTabs = useCallback(() => {
    setTabs([])
    setActiveTab(null)
  }, [])

  const resetTabs = useCallback(() => {
    clearTabs()
    addTab('about:blank')
  }, [addTab, clearTabs])

  return (
    <TabContext.Provider
      value={{
        tabs,
        activeTab,
        addTab,
        closeTab,
        activateTab,
        updateTab,
        updateTabUrl,
        reloadTab,
        updateTabScreenshot,
        clearTabs,
        resetTabs
      }}
    >
      {children}
    </TabContext.Provider>
  )
}

export const useTabs = (): TabContextType => {
  const context = useContext(TabContext)
  if (context === undefined) {
    throw new Error('useTabs must be used within a TabProvider')
  }
  return context
}