import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FiRefreshCw, FiArrowLeft, FiArrowRight, FiX, FiCamera } from 'react-icons/fi';
import { Tab } from '../atoms';
import { useWebView, WebViewElement } from './web-view-context';
import { useTabs } from './tab-context';

interface BrowserTabProps {
  tab: Tab;
  active: boolean;
}

const BrowserTab: React.FC<BrowserTabProps> = ({ tab, active }) => {
  const { webViewRef } = useWebView();
  const { updateTabScreenshot, updateTabTitle, updateTabFavicon } = useTabs();
  const [url, setUrl] = useState(tab.url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const localWebViewRef = useRef<WebViewElement | null>(null);

  // Handle tab reload
  useEffect(() => {
    if (tab.reload && localWebViewRef.current) {
      localWebViewRef.current.reload();
    }
  }, [tab.reload]);

  // Capture a screenshot of the current page
  const captureScreenshot = useCallback(() => {
    if (!localWebViewRef.current || !active) return;

    // Use the Electron API to capture a screenshot of the webView
    localWebViewRef.current.executeJavaScript(`
      // Create a canvas element with the same dimensions as the visible area
      const canvas = document.createElement('canvas');
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      
      // Get drawing context and render the current page to it
      const ctx = canvas.getContext('2d');
      
      // Use html2canvas-like approach
      ctx.drawWindow(window, 0, 0, width, height, 'rgb(255,255,255)');
      
      // Convert the canvas to a data URL (PNG format)
      canvas.toDataURL('image/png', 0.8);
    `)
    .then((dataUrl) => {
      // Update the tab with the screenshot
      updateTabScreenshot(tab.id, dataUrl);
    })
    .catch((error) => {
      console.error('Failed to capture screenshot:', error);
      
      // Fallback: use a simpler method that works in Electron
      if (localWebViewRef.current) {
        // Use Electron's specific capturePage API via IPC
        window.electron.captureWebViewScreenshot(tab.id);
      }
    });
  }, [active, tab.id, updateTabScreenshot]);

  // Initialize webview when the component mounts
  useEffect(() => {
    if (!active) return;

    // We need this because we have multiple tabs but only one global webViewRef
    if (webViewRef.current) {
      localWebViewRef.current = webViewRef.current;
    }

    // Set up event listeners for the webview
    const setupWebViewListeners = () => {
      if (!localWebViewRef.current) return;

      const wv = localWebViewRef.current;

      // Update navigation state
      const updateNavState = () => {
        if (localWebViewRef.current) {
          setCanGoBack(localWebViewRef.current.canGoBack());
          setCanGoForward(localWebViewRef.current.canGoForward());
          setUrl(localWebViewRef.current.getURL());
          
          // Update tab title from page title
          const title = localWebViewRef.current.getTitle();
          if (title) {
            updateTabTitle(tab.id, title);
          }
          
          // Try to capture screenshot after page loads
          setTimeout(captureScreenshot, 500);
        }
      };

      // Event listeners
      wv.addEventListener('did-start-loading', () => setIsLoading(true));
      wv.addEventListener('did-stop-loading', () => {
        setIsLoading(false);
        updateNavState();
      });
      wv.addEventListener('did-navigate', updateNavState);
      wv.addEventListener('did-navigate-in-page', updateNavState);
      
      // Capture favicon
      wv.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) {
          updateTabFavicon(tab.id, e.favicons[0]);
        }
      });

      // Load the URL
      if (tab.url !== 'Home') {
        wv.loadURL(tab.url);
      }
    };

    setupWebViewListeners();

    // Cleanup listeners on unmount
    return () => {
      if (localWebViewRef.current) {
        const wv = localWebViewRef.current;
        wv.removeEventListener('did-start-loading', () => setIsLoading(true));
        wv.removeEventListener('did-stop-loading', () => setIsLoading(false));
        wv.removeEventListener('did-navigate', () => {});
        wv.removeEventListener('did-navigate-in-page', () => {});
        wv.removeEventListener('page-favicon-updated', () => {});
      }
    };
  }, [active, tab.url, updateTabTitle, updateTabFavicon, webViewRef, captureScreenshot, tab.id]);

  const navigateTo = (targetUrl: string) => {
    if (!localWebViewRef.current) return;

    let processedUrl = targetUrl;
    
    // If it doesn't start with a protocol, add https://
    if (!/^(https?:\/\/|file:\/\/|about:)/.test(processedUrl)) {
      // Check if it looks like a domain or a search query
      if (/^[a-zA-Z0-9]+([\-\.]{1}[a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/.test(processedUrl)) {
        processedUrl = `https://${processedUrl}`;
      } else {
        // It's a search query, use the default search engine
        processedUrl = `https://www.google.com/search?q=${encodeURIComponent(processedUrl)}`;
      }
    }

    localWebViewRef.current.loadURL(processedUrl);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Reset URL to current page and blur input
      if (localWebViewRef.current) {
        setUrl(localWebViewRef.current.getURL());
      }
      inputRef.current?.blur();
    }
  };

  const handleGoBack = () => {
    if (localWebViewRef.current && canGoBack) {
      localWebViewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    if (localWebViewRef.current && canGoForward) {
      localWebViewRef.current.goForward();
    }
  };

  const handleRefresh = () => {
    if (localWebViewRef.current) {
      localWebViewRef.current.reload();
    }
  };

  return (
    <div className={`h-full flex flex-col ${active ? '' : 'hidden'}`}>
      {/* Navigation bar */}
      <div className="flex items-center h-10 bg-gray-100 border-b border-gray-200 px-2">
        <button 
          onClick={handleGoBack}
          disabled={!canGoBack}
          className={`p-1 mr-1 rounded ${canGoBack ? 'text-gray-700 hover:bg-gray-200' : 'text-gray-400'}`}
        >
          <FiArrowLeft />
        </button>
        <button 
          onClick={handleGoForward}
          disabled={!canGoForward}
          className={`p-1 mr-1 rounded ${canGoForward ? 'text-gray-700 hover:bg-gray-200' : 'text-gray-400'}`}
        >
          <FiArrowRight />
        </button>
        <button 
          onClick={handleRefresh}
          className="p-1 mr-1 text-gray-700 hover:bg-gray-200 rounded"
        >
          <FiRefreshCw className={isLoading ? 'animate-spin' : ''} />
        </button>
        <button 
          onClick={captureScreenshot}
          className="p-1 mr-2 text-gray-700 hover:bg-gray-200 rounded"
          title="Capture Page Screenshot"
        >
          <FiCamera />
        </button>
        
        <form onSubmit={handleUrlSubmit} className="flex-1">
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-1 border border-gray-300 rounded-lg"
            placeholder="Enter URL or search"
          />
        </form>
      </div>
      
      {/* Content area - this will be filled with the webview component by parent */}
      {tab.type === 'home' ? (
        <div className="flex-1 bg-white p-5">
          <div className="flex items-center justify-center h-full">
            <div className="bg-gray-100 rounded-lg p-8 text-center max-w-lg">
              <h2 className="text-2xl font-bold text-blue-600 mb-4">Welcome to Vibe Desktop</h2>
              <p className="text-gray-600 mb-6">
                Your private, self-sovereign digital space
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <h3 className="font-medium mb-2">Your Recent Sites</h3>
                  <p className="text-sm text-gray-500">No recent sites yet</p>
                </div>
                <div className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <h3 className="font-medium mb-2">Vibe Apps</h3>
                  <p className="text-sm text-gray-500">No apps installed yet</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // WebView content is inserted here by the parent Browser component
        <div className="flex-1 relative" />
      )}
    </div>
  );
};

export default BrowserTab;