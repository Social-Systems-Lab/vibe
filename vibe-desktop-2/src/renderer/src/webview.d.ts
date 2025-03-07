// Type definitions for webview elements in the browser

import { Account, InstalledApp, ServerConfig, AuthType } from './components/auth/auth-context';

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
  
  // Config
  getConfig: () => Promise<any>;
  
  // Account management
  getAccounts: () => Promise<Account[]>;
  createAccount: (data: { 
    name: string; 
    authType: AuthType; 
    pictureUrl?: string; 
    pin?: string;
    serverConfig?: ServerConfig 
  }) => Promise<Account>;
  updateAccount: (data: { did: string; name?: string; pictureUrl?: string }) => Promise<Account>;
  updateServerConfig: (data: { did: string; serverConfig: ServerConfig }) => Promise<Account>;
  deleteAccount: (accountDid: string) => Promise<void>;
  loginAccount: (accountDid: string, pin?: string) => Promise<Account>;
  logout: () => Promise<void>;
  
  // Image selection
  selectImage: () => Promise<string>;
  
  // App management
  getInstalledApps: (accountDid: string) => Promise<InstalledApp[]>;
  saveInstalledApps: (data: { did: string; apps: InstalledApp[] }) => Promise<void>;
  
  // Crypto
  generateRSAKeys: () => Promise<{ publicKey: string; privateKey: string }>;
  signChallenge: (data: { privateKey: string; challenge: string }) => Promise<string>;
  encryptData: (data: { data: string; did: string }) => Promise<string>;
  decryptData: (data: { encryptedData: string; did: string }) => Promise<string>;
  
  // Database
  openDatabase: (dbName: string) => Promise<void>;
  closeDatabase: () => Promise<void>;
  destroyDatabase: () => Promise<void>;
  getDocument: (docId: string) => Promise<any>;
  putDocument: (doc: any) => Promise<any>;
  bulkPutDocuments: (docs: any[]) => Promise<any>;
  findDocuments: (query: any) => Promise<{ docs: any[] }>;
  subscribeToChanges: (subscriptionId: string, query: any) => Promise<void>;
  unsubscribe: (subscriptionId: string) => Promise<void>;
  onSubscriptionChange: (callback: (event: any, data: any) => void) => void;
  removeSubscriptionChangeListener: (callback: (event: any, data: any) => void) => void;
  
  // P2P
  initializeP2P: () => Promise<{ localPeerId: string }>;
  connectToPeer: (peerId: string) => Promise<void>;
  disconnectFromPeer: (peerId: string) => void;
  sendMessageToPeer: (peerId: string, content: string) => Promise<void>;
  setP2PServerUrl: (url: string) => void;
  checkP2PServerConnection: () => Promise<boolean>;
  onPeerConnected: (callback: (event: any, peerId: string) => void) => void;
  onPeerDisconnected: (callback: (event: any, peerId: string) => void) => void;
  onMessageReceived: (callback: (event: any, message: { peerId: string; content: string }) => void) => void;
  onServerStatusChanged: (callback: (event: any, status: 'disconnected' | 'connecting' | 'connected') => void) => void;
  removePeerConnectedListener: () => void;
  removePeerDisconnectedListener: () => void;
  removeMessageReceivedListener: () => void;
  removeServerStatusChangedListener: () => void;
  
  // WebView
  captureWebViewScreenshot: (tabId: string) => Promise<string>;
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