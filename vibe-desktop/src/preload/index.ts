import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('minimize-window'),
    maximize: () => ipcRenderer.invoke('maximize-window'),
    close: () => ipcRenderer.invoke('close-window'),
    isMaximized: () => ipcRenderer.invoke('is-window-maximized')
  },

  // Account APIs
  accounts: {
    getAll: () => ipcRenderer.invoke('get-accounts'),
    create: (accountName: string, authType: string, picturePath?: string, pin?: string, serverConfig?: any) => 
      ipcRenderer.invoke('create-account', accountName, authType, picturePath, pin, serverConfig),
    login: (accountDid: string, pin?: string) => 
      ipcRenderer.invoke('login', accountDid, pin),
    update: (accountDid: string, newName?: string, newPictureUri?: string) => 
      ipcRenderer.invoke('update-account', accountDid, newName, newPictureUri),
    updateServerConfig: (accountDid: string, serverConfig: any) => 
      ipcRenderer.invoke('update-server-config', accountDid, serverConfig),
    delete: (accountDid: string) => 
      ipcRenderer.invoke('delete-account', accountDid),
    generateRSAKeys: () => 
      ipcRenderer.invoke('generate-rsa-keys'),
    signChallenge: (privateKey: string, challenge: string) => 
      ipcRenderer.invoke('sign-challenge', privateKey, challenge),
    encryptData: (data: string, encryptionKey: string) => 
      ipcRenderer.invoke('encrypt-data', data, encryptionKey),
    decryptData: (encryptedData: string, encryptionKey: string) => 
      ipcRenderer.invoke('decrypt-data', encryptedData, encryptionKey)
  },

  // Database APIs
  db: {
    open: (dbName: string) => 
      ipcRenderer.invoke('db-open', dbName),
    close: () => 
      ipcRenderer.invoke('db-close'),
    destroy: () => 
      ipcRenderer.invoke('db-destroy'),
    get: (docId: string) => 
      ipcRenderer.invoke('db-get', docId),
    put: (doc: any) => 
      ipcRenderer.invoke('db-put', doc),
    bulkPut: (docs: any[]) => 
      ipcRenderer.invoke('db-bulk-put', docs),
    find: (query: any) => 
      ipcRenderer.invoke('db-find', query),
    subscribe: (subscriptionId: string, query: any) => 
      ipcRenderer.invoke('db-subscribe', subscriptionId, query),
    unsubscribe: (subscriptionId: string) => 
      ipcRenderer.invoke('db-unsubscribe', subscriptionId),
    getDbNameFromDid: (did: string) => 
      ipcRenderer.invoke('db-get-name-from-did', did),
    write: (collection: string, doc: any) => 
      ipcRenderer.invoke('db-write', collection, doc),
    onSubscriptionUpdate: (callback: (data: any) => void) => 
      ipcRenderer.on('db-subscription-update', (_, data) => callback(data))
  },

  // App management APIs
  apps: {
    getInstalledApps: (accountDid: string) => 
      ipcRenderer.invoke('get-installed-apps', accountDid),
    addOrUpdateApp: (accountDid: string, app: any) => 
      ipcRenderer.invoke('add-or-update-app', accountDid, app),
    removeApp: (accountDid: string, appId: string) => 
      ipcRenderer.invoke('remove-app', accountDid, appId),
    setAppPinned: (accountDid: string, appId: string, pinned: boolean) => 
      ipcRenderer.invoke('set-app-pinned', accountDid, appId, pinned),
    setAppHidden: (accountDid: string, appId: string, hidden: boolean) => 
      ipcRenderer.invoke('set-app-hidden', accountDid, appId, hidden),
    checkPermission: (accountDid: string, appId: string, operation: string, collection: string) => 
      ipcRenderer.invoke('check-permission', accountDid, appId, operation, collection),
    updatePermission: (accountDid: string, appId: string, operation: string, collection: string, value: string) => 
      ipcRenderer.invoke('update-permission', accountDid, appId, operation, collection, value)
  },

  // WebView APIs
  webview: {
    getPreloadPath: () => 
      ipcRenderer.invoke('get-webview-preload-path'),
    onInitRequest: (callback: (data: any) => void) => 
      ipcRenderer.on('webview-init-request', (_, data) => callback(data)),
    onReadOnceRequest: (callback: (data: any) => void) => 
      ipcRenderer.on('webview-read-once-request', (_, data) => callback(data)),
    onReadRequest: (callback: (data: any) => void) => 
      ipcRenderer.on('webview-read-request', (_, data) => callback(data)),
    onUnsubscribeRequest: (callback: (data: any) => void) => 
      ipcRenderer.on('webview-unsubscribe-request', (_, data) => callback(data)),
    onWriteRequest: (callback: (data: any) => void) => 
      ipcRenderer.on('webview-write-request', (_, data) => callback(data)),
    sendResponse: (webContentsId: number, response: any) => {
      ipcRenderer.sendTo(webContentsId, 'webview-subscription-update', response);
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
