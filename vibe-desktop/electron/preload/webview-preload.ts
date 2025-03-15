import { contextBridge, ipcRenderer } from 'electron';

// Safe vibe API to expose to websites
contextBridge.exposeInMainWorld('vibe', {
  // Initialize the Vibe SDK
  init: (manifest: any) => {
    return ipcRenderer.invoke('webview-init', manifest);
  },
  
  // Read data from database (one-time)
  readOnce: (collection: string, filter: any) => {
    return ipcRenderer.invoke('webview-read-once', collection, filter);
  },
  
  // Subscribe to data changes
  read: (collection: string, filter: any, callback: (results: any) => void) => {
    const subscriptionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    
    // Set up listener for this subscription
    const handler = (_event: any, data: any) => {
      if (data.subscriptionId === subscriptionId) {
        callback(data.results);
      }
    };
    
    ipcRenderer.on('webview-subscription-update', handler);
    
    // Start subscription
    ipcRenderer.invoke('webview-read', subscriptionId, collection, filter);
    
    // Return function to unsubscribe
    return () => {
      ipcRenderer.invoke('webview-unsubscribe', subscriptionId);
      ipcRenderer.removeListener('webview-subscription-update', handler);
    };
  },
  
  // Write data to database
  write: (collection: string, doc: any) => {
    return ipcRenderer.invoke('webview-write', collection, doc);
  }
});

// Also expose a minimal electron API for integration
contextBridge.exposeInMainWorld('electron', {
  send: (channel: string, data: any) => {
    // Whitelist channels for security
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  }
});