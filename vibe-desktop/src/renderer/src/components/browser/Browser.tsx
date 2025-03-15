import React, { useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { FiPlus, FiGrid } from 'react-icons/fi';
import { activeTabIndexAtom, tabsAtom } from '../atoms';
import { WebViewProvider } from './web-view-context';
import { TabsProvider, useTabs } from './tab-context';
import BrowserTab from './BrowserTab';
import TabSwitcher from './TabSwitcher';
import { useWebView } from './web-view-context';

const BrowserTabs: React.FC = () => {
  const [tabs] = useAtom(tabsAtom);
  const [activeTabIndex, setActiveTabIndex] = useAtom(activeTabIndexAtom);
  const { addTab, closeTab } = useTabs();
  const { webViewRef } = useWebView();
  const [showTabSwitcher, setShowTabSwitcher] = useState(false);
  
  // Reference to webview container element
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  
  // Effect to attach webViewRef to the actual webview DOM element
  useEffect(() => {
    if (webviewContainerRef.current) {
      const webviewElement = webviewContainerRef.current.querySelector('webview');
      
      if (webviewElement && webViewRef.current !== webviewElement) {
        // @ts-ignore - we know this is the correct type
        webViewRef.current = webviewElement;
      }
    }
  }, [webViewRef, tabs, activeTabIndex]);

  // Capture tab screenshots
  useEffect(() => {
    // Set up keyboard shortcut for tab switcher
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+Tab or Cmd+Tab for tab switcher
      if ((e.altKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        setShowTabSwitcher(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Create a new tab
  const handleAddTab = () => {
    addTab({ title: 'New Tab', url: 'about:blank', type: 'webview' });
  };

  // Close a tab
  const handleCloseTab = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (index < tabs.length) {
      closeTab(tabs[index].id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center bg-gray-100 h-[40px] border-b border-gray-200 px-2 overflow-x-auto">
        {tabs.map((tab, index) => (
          <div 
            key={tab.id}
            className={`flex items-center px-3 py-1 mr-1 max-w-[180px] rounded-t-md cursor-pointer ${
              index === activeTabIndex ? 'bg-white border-t border-l border-r border-gray-200' : 'hover:bg-gray-200'
            }`}
            onClick={() => setActiveTabIndex(index)}
          >
            {tab.favicon && (
              <img src={tab.favicon} className="w-4 h-4 mr-2" alt="" />
            )}
            <span className="truncate">{tab.title}</span>
            {tabs.length > 1 && (
              <button 
                className="ml-2 text-gray-500 hover:text-gray-700"
                onClick={(e) => handleCloseTab(index, e)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button 
          className="p-1 text-gray-600 hover:bg-gray-200 rounded flex-shrink-0"
          onClick={handleAddTab}
        >
          <FiPlus />
        </button>
        <button 
          className="p-1 ml-1 text-gray-600 hover:bg-gray-200 rounded flex-shrink-0"
          onClick={() => setShowTabSwitcher(true)}
          title="Show Tab Switcher (Alt+Tab)"
        >
          <FiGrid />
        </button>
      </div>
      
      {/* Tab content and webview */}
      <div className="flex-1 relative">
        {tabs.map((tab, index) => (
          <BrowserTab
            key={tab.id}
            tab={tab}
            active={index === activeTabIndex}
          />
        ))}
        
        {/* This is where we actually render the webview element */}
        <div 
          ref={webviewContainerRef}
          className="absolute inset-0 top-10"
          dangerouslySetInnerHTML={{
            __html: `<webview id="electron-webview" class="w-full h-full" ${tabs[activeTabIndex]?.type === 'home' ? 'style="display:none"' : ''} src="${tabs[activeTabIndex]?.type === 'webview' ? (tabs[activeTabIndex]?.url || 'about:blank') : 'about:blank'}" webpreferences="contextIsolation=no"></webview>`
          }}
        />
      </div>

      {/* Tab Switcher Modal */}
      {showTabSwitcher && <TabSwitcher onClose={() => setShowTabSwitcher(false)} />}
    </div>
  );
};

const Browser: React.FC = () => {
  const [tabs, setTabs] = useAtom(tabsAtom);
  
  // Initialize with a home tab if none exist
  useEffect(() => {
    if (tabs.length === 0) {
      setTabs([{ id: 'home', title: 'Home', url: 'Home', type: 'home' }]);
    }
  }, []);
  
  return (
    <WebViewProvider>
      <TabsProvider>
        <BrowserTabs />
      </TabsProvider>
    </WebViewProvider>
  );
};

export default Browser;