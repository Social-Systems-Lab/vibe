import { contextBridge, ipcRenderer } from 'electron';

// Expose API to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  isWindowMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  
  // Get config
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // Account management
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  createAccount: (name: string, password: string, picturePath?: string, authType?: 'PIN' | 'BIOMETRIC', serverConfig?: any) => 
    ipcRenderer.invoke('create-account', name, password, picturePath, authType, serverConfig),
  login: (name: string, password: string) => ipcRenderer.invoke('login', name, password),
  updateAccount: (name: string, newName?: string, newPictureUri?: string) => 
    ipcRenderer.invoke('update-account', name, newName, newPictureUri),
  updateServerConfig: (name: string, serverConfig: any) => 
    ipcRenderer.invoke('update-server-config', name, serverConfig),
  deleteAccount: (name: string) => ipcRenderer.invoke('delete-account', name),
  getAccountsDirectoryData: () => ipcRenderer.invoke('get-accounts-directory-data'),
  
  // Database operations
  dbOpen: (dbName: string) => ipcRenderer.invoke('db-open', dbName),
  dbClose: () => ipcRenderer.invoke('db-close'),
  dbDestroy: () => ipcRenderer.invoke('db-destroy'),
  dbGet: (docId: string) => ipcRenderer.invoke('db-get', docId),
  dbPut: (doc: any) => ipcRenderer.invoke('db-put', doc),
  dbBulkPut: (docs: any[]) => ipcRenderer.invoke('db-bulk-put', docs),
  dbFind: (query: any) => ipcRenderer.invoke('db-find', query),
  dbSubscribe: (subscriptionId: string, query: any) => 
    ipcRenderer.invoke('db-subscribe', subscriptionId, query),
  dbUnsubscribe: (subscriptionId: string) => 
    ipcRenderer.invoke('db-unsubscribe', subscriptionId),
  dbGetNameFromDid: (did: string) => ipcRenderer.invoke('db-get-name-from-did', did),
  dbWrite: (collection: string, doc: any) => ipcRenderer.invoke('db-write', collection, doc),
  
  // App management
  getInstalledApps: (accountDid: string) => ipcRenderer.invoke('get-installed-apps', accountDid),
  addOrUpdateApp: (accountDid: string, app: any) => 
    ipcRenderer.invoke('add-or-update-app', accountDid, app),
  removeApp: (accountDid: string, appId: string) => ipcRenderer.invoke('remove-app', accountDid, appId),
  setAppPinned: (accountDid: string, appId: string, pinned: boolean) => 
    ipcRenderer.invoke('set-app-pinned', accountDid, appId, pinned),
  setAppHidden: (accountDid: string, appId: string, hidden: boolean) => 
    ipcRenderer.invoke('set-app-hidden', accountDid, appId, hidden),
  checkPermission: (accountDid: string, appId: string, operation: string, collection: string) => 
    ipcRenderer.invoke('check-permission', accountDid, appId, operation, collection),
  updatePermission: (accountDid: string, appId: string, operation: string, collection: string, value: string) => 
    ipcRenderer.invoke('update-permission', accountDid, appId, operation, collection, value),
  
  // IPC events
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  
  // Send messages to main process
  send: (channel: string, data: any) => {
    ipcRenderer.send(channel, data);
  },
  
  // Remove listeners
  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
  
  // Remove all listeners for a specific channel
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // P2P functionality (stubs for now)
  initializeP2P: () => Promise.resolve({ localPeerId: 'local-peer-' + Math.random().toString(36).substr(2, 9) }),
  connectToPeer: (peerId: string) => Promise.resolve(),
  disconnectFromPeer: (peerId: string) => {},
  sendMessageToPeer: (peerId: string, content: string) => Promise.resolve(),
  setP2PServerUrl: (url: string) => {},
  checkP2PServerConnection: () => Promise.resolve(true),
  
  // P2P event listeners (stubs for now)
  onPeerConnected: (callback: (event: any, peerId: string) => void) => {
    const channel = 'peer-connected';
    const subscription = (_event: any, peerId: string) => callback(_event, peerId);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  onPeerDisconnected: (callback: (event: any, peerId: string) => void) => {
    const channel = 'peer-disconnected';
    const subscription = (_event: any, peerId: string) => callback(_event, peerId);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  onMessageReceived: (callback: (event: any, message: { peerId: string; content: string }) => void) => {
    const channel = 'message-received';
    const subscription = (_event: any, message: { peerId: string; content: string }) => callback(_event, message);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  onServerStatusChanged: (callback: (event: any, status: 'disconnected' | 'connecting' | 'connected') => void) => {
    const channel = 'server-status-changed';
    const subscription = (_event: any, status: 'disconnected' | 'connecting' | 'connected') => callback(_event, status);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  
  // P2P event listener removal (stubs for now)
  removePeerConnectedListener: () => {
    ipcRenderer.removeAllListeners('peer-connected');
  },
  removePeerDisconnectedListener: () => {
    ipcRenderer.removeAllListeners('peer-disconnected');
  },
  removeMessageReceivedListener: () => {
    ipcRenderer.removeAllListeners('message-received');
  },
  removeServerStatusChangedListener: () => {
    ipcRenderer.removeAllListeners('server-status-changed');
  }
});