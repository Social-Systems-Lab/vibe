import { ElectronAPI } from '@electron-toolkit/preload'

interface Account {
  did: string
  publicKey: string
  name: string
  pictureUrl?: string
  requireAuthentication: 'PIN' | 'BIOMETRIC'
  updatedAt?: number
  server?: {
    url: string
    name?: string
    isConnected?: boolean
    lastConnected?: number
  }
}

interface InstalledApp {
  appId: string
  name: string
  description: string
  pictureUrl?: string
  url: string
  permissions: Record<string, string>
  hidden: boolean
  homeScreenPage?: number
  homeScreenPosition?: number
  pinned?: boolean
}

interface VibeAPI {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
  
  accounts: {
    getAll: () => Promise<Account[]>
    create: (accountName: string, authType: string, picturePath?: string, pin?: string, serverConfig?: any) => Promise<Account>
    login: (accountDid: string, pin?: string) => Promise<Account>
    update: (accountDid: string, newName?: string, newPictureUri?: string) => Promise<void>
    updateServerConfig: (accountDid: string, serverConfig: any) => Promise<void>
    delete: (accountDid: string) => Promise<void>
    generateRSAKeys: () => Promise<{ publicKey: string; privateKey: string }>
    signChallenge: (privateKey: string, challenge: string) => Promise<string>
    encryptData: (data: string, encryptionKey: string) => Promise<string>
    decryptData: (encryptedData: string, encryptionKey: string) => Promise<string>
  }
  
  db: {
    open: (dbName: string) => Promise<{ success: boolean; error?: string }>
    close: () => Promise<{ success: boolean; error?: string }>
    destroy: () => Promise<{ success: boolean; error?: string }>
    get: (docId: string) => Promise<{ success: boolean; doc?: any; error?: string }>
    put: (doc: any) => Promise<{ success: boolean; result?: any; error?: string }>
    bulkPut: (docs: any[]) => Promise<{ success: boolean; result?: any; error?: string }>
    find: (query: any) => Promise<{ success: boolean; result?: any; error?: string }>
    subscribe: (subscriptionId: string, query: any) => Promise<{ success: boolean; error?: string }>
    unsubscribe: (subscriptionId: string) => Promise<{ success: boolean; error?: string }>
    getDbNameFromDid: (did: string) => Promise<string>
    write: (collection: string, doc: any) => Promise<{ success: boolean; result?: any; error?: string }>
    onSubscriptionUpdate: (callback: (data: any) => void) => void
  }
  
  apps: {
    getInstalledApps: (accountDid: string) => Promise<InstalledApp[]>
    addOrUpdateApp: (accountDid: string, app: Partial<InstalledApp>) => Promise<{ success: boolean }>
    removeApp: (accountDid: string, appId: string) => Promise<{ success: boolean }>
    setAppPinned: (accountDid: string, appId: string, pinned: boolean) => Promise<{ success: boolean }>
    setAppHidden: (accountDid: string, appId: string, hidden: boolean) => Promise<{ success: boolean }>
    checkPermission: (accountDid: string, appId: string, operation: string, collection: string) => Promise<string>
    updatePermission: (accountDid: string, appId: string, operation: string, collection: string, value: string) => Promise<{ success: boolean }>
  }
  
  webview: {
    getPreloadPath: () => Promise<string>
    onInitRequest: (callback: (data: any) => void) => void
    onReadOnceRequest: (callback: (data: any) => void) => void
    onReadRequest: (callback: (data: any) => void) => void
    onUnsubscribeRequest: (callback: (data: any) => void) => void
    onWriteRequest: (callback: (data: any) => void) => void
    sendResponse: (webContentsId: number, response: any) => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: VibeAPI
  }
}
