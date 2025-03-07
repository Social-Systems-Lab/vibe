// Type definitions for webview elements in the browser

interface VibeAPI {
  // Initialize the Vibe SDK
  init: (manifest: any) => Promise<any>;
  
  // Read data from database (one-time)
  readOnce: (collection: string, filter: any) => Promise<any>;
  
  // Subscribe to data changes
  read: (collection: string, filter: any, callback: (results: any) => void) => () => void;
  
  // Write data to database
  write: (collection: string, doc: any) => Promise<any>;
}

interface ElectronAPI {
  // IPC methods
  send: (channel: string, data: any) => void;
  
  // Account methods
  getConfig: () => Promise<any>;
  getInstalledApps: () => Promise<any[]>;
  getAccounts: () => Promise<any[]>;
  createAccount: (data: any) => Promise<any>;
  loginAccount: (accountId: string) => Promise<any>;
  
  // WebView methods
  captureWebViewScreenshot: (tabId: string) => Promise<void>;
}

interface WebviewElement extends HTMLElement {
  src: string;
  nodeintegration?: boolean;
  preload?: string;
  httpreferrer?: string;
  useragent?: string;
  disablewebsecurity?: boolean;
  partition?: string;
  allowpopups?: boolean;
  webpreferences?: string;
  enableblinkfeatures?: string;
  disableblinkfeatures?: string;
  
  // Methods
  loadURL: (url: string) => void;
  getURL: () => string;
  getTitle: () => string;
  reload: () => void;
  stop: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  executeJavaScript: (code: string) => Promise<any>;
  openDevTools: () => void;
  closeDevTools: () => void;
  isDevToolsOpened: () => boolean;
  focus: () => void;
  blur: () => void;
  
  // Events
  addEventListener: (event: string, listener: (event: any) => void) => void;
  removeEventListener: (event: string, listener: (event: any) => void) => void;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.WebViewHTMLAttributes<WebviewElement>, WebviewElement>;
    }
  }
  
  interface Window {
    vibe: VibeAPI;
    electron: ElectronAPI;
  }

  interface HTMLElementTagNameMap {
    'webview': WebviewElement;
  }
}