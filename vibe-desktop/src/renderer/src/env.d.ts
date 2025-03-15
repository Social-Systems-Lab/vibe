/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Account {
  did?: string;
  publicKey?: string;
  name: string;
  pictureUrl?: string;
  requireAuthentication?: 'PIN' | 'BIOMETRIC';
  updatedAt?: number;
  server?: {
    url: string;
    name?: string;
    isConnected?: boolean;
    lastConnected?: number;
  };
}

interface InstalledApp {
  appId: string;
  name: string;
  description: string;
  pictureUrl?: string;
  url: string;
  permissions: Record<string, string>;
  hidden: boolean;
  homeScreenPage?: number;
  homeScreenPosition?: number;
  pinned?: boolean;
}

interface ElectronAPI {
  // Window controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  
  // Get config
  getConfig: () => Promise<{
    webviewPreloadPath: string;
    appPath: string;
    accountsPath: string;
  }>;
  
  // Account management
  getAccounts: () => Promise<Account[]>;
  createAccount: (
    name: string, 
    password: string, 
    picturePath?: string, 
    authType?: 'PIN' | 'BIOMETRIC', 
    serverConfig?: any
  ) => Promise<Account>;
  login: (name: string, password: string) => Promise<Account>;
  updateAccount: (
    name: string, 
    newName?: string, 
    newPictureUri?: string
  ) => Promise<void>;
  updateServerConfig: (
    name: string, 
    serverConfig: any
  ) => Promise<void>;
  deleteAccount: (name: string) => Promise<void>;
  getAccountsDirectoryData: () => Promise<any[]>;
  
  // Database operations
  dbOpen: (dbName: string) => Promise<{ success: boolean; error?: string }>;
  dbClose: () => Promise<{ success: boolean; error?: string }>;
  dbDestroy: () => Promise<{ success: boolean; error?: string }>;
  dbGet: (docId: string) => Promise<{ success: boolean; doc?: any; error?: string }>;
  dbPut: (doc: any) => Promise<{ success: boolean; result?: any; error?: string }>;
  dbBulkPut: (docs: any[]) => Promise<{ success: boolean; result?: any; error?: string }>;
  dbFind: (query: any) => Promise<{ success: boolean; result?: any; error?: string }>;
  dbSubscribe: (subscriptionId: string, query: any) => Promise<{ success: boolean; error?: string }>;
  dbUnsubscribe: (subscriptionId: string) => Promise<{ success: boolean; error?: string }>;
  dbGetNameFromDid: (did: string) => Promise<string>;
  dbWrite: (collection: string, doc: any) => Promise<{ success: boolean; result?: any; error?: string }>;
  
  // App management
  getInstalledApps: (accountDid: string) => Promise<InstalledApp[]>;
  addOrUpdateApp: (accountDid: string, app: Partial<InstalledApp>) => Promise<{ success: boolean }>;
  removeApp: (accountDid: string, appId: string) => Promise<{ success: boolean }>;
  setAppPinned: (accountDid: string, appId: string, pinned: boolean) => Promise<{ success: boolean }>;
  setAppHidden: (accountDid: string, appId: string, hidden: boolean) => Promise<{ success: boolean }>;
  checkPermission: (accountDid: string, appId: string, operation: string, collection: string) => Promise<string>;
  updatePermission: (accountDid: string, appId: string, operation: string, collection: string, value: string) => Promise<{ success: boolean }>;
  
  // IPC events
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
  send: (channel: string, data: any) => void;
  removeListener: (channel: string, callback: (...args: any[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}