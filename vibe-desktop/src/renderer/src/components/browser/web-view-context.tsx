import React, { createContext, useContext, useRef } from 'react';

// WebView in Electron is different from React Native WebView
// It's an HTML element with additional Electron-specific properties
export type WebViewElement = HTMLElement & {
  src: string;
  reload: () => void;
  loadURL: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  getTitle: () => string;
  executeJavaScript: (code: string) => Promise<any>;
  addEventListener: (event: string, callback: (event: any) => void) => void;
  removeEventListener: (event: string, callback: (event: any) => void) => void;
};

export type WebViewContextType = {
  webViewRef: React.RefObject<WebViewElement>;
  postMessageToWebView: (message: object) => void;
};

const WebViewContext = createContext<WebViewContextType | undefined>(undefined);

export const WebViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const webViewRef = useRef<WebViewElement>(null);

  const postMessageToWebView = (message: object) => {
    console.log('postMessageToWebView', message);
    webViewRef.current?.executeJavaScript(`
      window.dispatchEvent(new MessageEvent('message', {
        data: ${JSON.stringify(message)}
      }));
    `);
  };

  return (
    <WebViewContext.Provider value={{ webViewRef, postMessageToWebView }}>
      {children}
    </WebViewContext.Provider>
  );
};

export const useWebView = () => {
  const context = useContext(WebViewContext);
  if (!context) {
    throw new Error('useWebView must be used within a WebViewProvider');
  }
  return context;
};