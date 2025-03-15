// WebView management for vibe-desktop
// Handles browser tabs and permissions similar to browser-tab.tsx in vibe-app

import { ipcMain, BrowserWindow, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// Directory for storing app data
const APPS_DIR = path.join(app.getPath('userData'), 'Apps');

// Make sure the apps directory exists
if (!fs.existsSync(APPS_DIR)) {
  fs.mkdirSync(APPS_DIR, { recursive: true });
}

// Types
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

// In-memory state
const installedApps: Record<string, InstalledApp[]> = {};

// Load installed apps for an account
const loadInstalledApps = (accountDid: string): InstalledApp[] => {
  const appsFile = path.join(APPS_DIR, `${accountDid}.json`);
  
  try {
    if (fs.existsSync(appsFile)) {
      const data = fs.readFileSync(appsFile, 'utf8');
      installedApps[accountDid] = JSON.parse(data);
      return installedApps[accountDid];
    }
  } catch (error) {
    console.error(`Error loading apps for account ${accountDid}:`, error);
  }
  
  installedApps[accountDid] = [];
  return installedApps[accountDid];
};

// Save installed apps for an account
const saveInstalledApps = (accountDid: string, apps: InstalledApp[]): void => {
  const appsFile = path.join(APPS_DIR, `${accountDid}.json`);
  
  try {
    installedApps[accountDid] = apps;
    fs.writeFileSync(appsFile, JSON.stringify(apps, null, 2));
  } catch (error) {
    console.error(`Error saving apps for account ${accountDid}:`, error);
  }
};

// Add or update an app
const addOrUpdateApp = (accountDid: string, app: Partial<InstalledApp>): void => {
  if (!accountDid) throw new Error('No account selected');
  
  // Make sure we have loaded apps for this account
  if (!installedApps[accountDid]) {
    loadInstalledApps(accountDid);
  }
  
  const apps = installedApps[accountDid];
  
  const appId = app.appId;
  if (!appId) throw new Error('App ID is required');
  
  const existingIndex = apps.findIndex(a => a.appId === appId);
  
  if (existingIndex >= 0) {
    // Update existing app
    apps[existingIndex] = { ...apps[existingIndex], ...app };
  } else {
    // Add new app
    apps.push(app as InstalledApp);
  }
  
  saveInstalledApps(accountDid, apps);
};

// Remove an app
const removeApp = (accountDid: string, appId: string): void => {
  if (!accountDid) throw new Error('No account selected');
  
  // Make sure we have loaded apps for this account
  if (!installedApps[accountDid]) {
    loadInstalledApps(accountDid);
  }
  
  const apps = installedApps[accountDid];
  const updatedApps = apps.filter(a => a.appId !== appId);
  
  saveInstalledApps(accountDid, updatedApps);
};

// Set an app as pinned
const setAppPinned = (accountDid: string, appId: string, pinned: boolean): void => {
  if (!accountDid) throw new Error('No account selected');
  
  // Make sure we have loaded apps for this account
  if (!installedApps[accountDid]) {
    loadInstalledApps(accountDid);
  }
  
  const apps = installedApps[accountDid];
  const updatedApps = apps.map(a => {
    if (a.appId === appId) {
      return { ...a, pinned };
    }
    return a;
  });
  
  saveInstalledApps(accountDid, updatedApps);
};

// Set an app as hidden
const setAppHidden = (accountDid: string, appId: string, hidden: boolean): void => {
  if (!accountDid) throw new Error('No account selected');
  
  // Make sure we have loaded apps for this account
  if (!installedApps[accountDid]) {
    loadInstalledApps(accountDid);
  }
  
  const apps = installedApps[accountDid];
  const updatedApps = apps.map(a => {
    if (a.appId === appId) {
      return { ...a, hidden };
    }
    return a;
  });
  
  saveInstalledApps(accountDid, updatedApps);
};

// Check app permission
const checkPermission = (accountDid: string, appId: string, operation: string, collection: string): string => {
  if (!accountDid) throw new Error('No account selected');
  
  // Make sure we have loaded apps for this account
  if (!installedApps[accountDid]) {
    loadInstalledApps(accountDid);
  }
  
  const apps = installedApps[accountDid];
  const app = apps.find(a => a.appId === appId);
  
  if (!app) {
    throw new Error('App not installed');
  }
  
  const permKey = `${operation}.${collection}`;
  return app.permissions?.[permKey] ?? 'never';
};

// Update app permission
const updatePermission = (accountDid: string, appId: string, operation: string, collection: string, value: string): void => {
  if (!accountDid) throw new Error('No account selected');
  
  // Make sure we have loaded apps for this account
  if (!installedApps[accountDid]) {
    loadInstalledApps(accountDid);
  }
  
  const apps = installedApps[accountDid];
  const appIndex = apps.findIndex(a => a.appId === appId);
  
  if (appIndex < 0) {
    throw new Error('App not installed');
  }
  
  const app = apps[appIndex];
  const permKey = `${operation}.${collection}`;
  
  const updatedPermissions = {
    ...app.permissions,
    [permKey]: value
  };
  
  apps[appIndex] = {
    ...app,
    permissions: updatedPermissions
  };
  
  saveInstalledApps(accountDid, apps);
};

// Create a preload script for the webview
const createWebViewPreloadScript = (): string => {
  return `
    // Vibe SDK preload script for webviews
    // Injects the Vibe SDK into the webview

    const { ipcRenderer, contextBridge } = require('electron');

    // Initialize vibe API
    contextBridge.exposeInMainWorld('vibe', {
      // Initialize the Vibe SDK
      init: (manifest) => {
        return ipcRenderer.invoke('webview-init', manifest);
      },
      
      // Read data from database (one-time)
      readOnce: (collection, filter) => {
        return ipcRenderer.invoke('webview-read-once', collection, filter);
      },
      
      // Subscribe to data changes
      read: (collection, filter, callback) => {
        const subscriptionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Set up listener for this subscription
        ipcRenderer.on('webview-subscription-update', (event, data) => {
          if (data.subscriptionId === subscriptionId) {
            callback(data.results);
          }
        });
        
        // Start subscription
        ipcRenderer.invoke('webview-read', subscriptionId, collection, filter);
        
        // Return function to unsubscribe
        return () => {
          ipcRenderer.invoke('webview-unsubscribe', subscriptionId);
          ipcRenderer.removeAllListeners('webview-subscription-update');
        };
      },
      
      // Write data to database
      write: (collection, doc) => {
        return ipcRenderer.invoke('webview-write', collection, doc);
      },
      
      // Handle response from native side
      handleNativeResponse: (response) => {
        // This would be used to handle responses to the above requests
        console.log('Received native response:', response);
      }
    });
  `;
};

// Set up IPC handlers for webview
export function setupWebViewHandlers(): void {
  // Get installed apps for an account
  ipcMain.handle('get-installed-apps', (_, accountDid) => {
    return loadInstalledApps(accountDid);
  });
  
  // Add or update an app
  ipcMain.handle('add-or-update-app', (_, accountDid, app) => {
    addOrUpdateApp(accountDid, app);
    return { success: true };
  });
  
  // Remove an app
  ipcMain.handle('remove-app', (_, accountDid, appId) => {
    removeApp(accountDid, appId);
    return { success: true };
  });
  
  // Set app pinned
  ipcMain.handle('set-app-pinned', (_, accountDid, appId, pinned) => {
    setAppPinned(accountDid, appId, pinned);
    return { success: true };
  });
  
  // Set app hidden
  ipcMain.handle('set-app-hidden', (_, accountDid, appId, hidden) => {
    setAppHidden(accountDid, appId, hidden);
    return { success: true };
  });
  
  // Check permission
  ipcMain.handle('check-permission', (_, accountDid, appId, operation, collection) => {
    return checkPermission(accountDid, appId, operation, collection);
  });
  
  // Update permission
  ipcMain.handle('update-permission', (_, accountDid, appId, operation, collection, value) => {
    updatePermission(accountDid, appId, operation, collection, value);
    return { success: true };
  });
  
  // WebView init
  ipcMain.handle('webview-init', (event, manifest) => {
    // Get the sender ID to identify which webview is requesting
    const webContentsId = event.sender.id;
    
    // Get the parent window
    const win = BrowserWindow.fromWebContents(event.sender);
    
    // Forward the request to the renderer process (main window)
    if (win) {
      win.webContents.send('webview-init-request', {
        webContentsId,
        manifest
      });
    }
  });
  
  // WebView read once
  ipcMain.handle('webview-read-once', (event, collection, filter) => {
    // Get the sender ID to identify which webview is requesting
    const webContentsId = event.sender.id;
    
    // Get the parent window
    const win = BrowserWindow.fromWebContents(event.sender);
    
    // Forward the request to the renderer process (main window)
    if (win) {
      win.webContents.send('webview-read-once-request', {
        webContentsId,
        collection,
        filter
      });
    }
  });
  
  // WebView read (subscription)
  ipcMain.handle('webview-read', (event, subscriptionId, collection, filter) => {
    // Get the sender ID to identify which webview is requesting
    const webContentsId = event.sender.id;
    
    // Get the parent window
    const win = BrowserWindow.fromWebContents(event.sender);
    
    // Forward the request to the renderer process (main window)
    if (win) {
      win.webContents.send('webview-read-request', {
        webContentsId,
        subscriptionId,
        collection,
        filter
      });
    }
  });
  
  // WebView unsubscribe
  ipcMain.handle('webview-unsubscribe', (event, subscriptionId) => {
    // Get the sender ID to identify which webview is requesting
    const webContentsId = event.sender.id;
    
    // Get the parent window
    const win = BrowserWindow.fromWebContents(event.sender);
    
    // Forward the request to the renderer process (main window)
    if (win) {
      win.webContents.send('webview-unsubscribe-request', {
        webContentsId,
        subscriptionId
      });
    }
  });
  
  // WebView write
  ipcMain.handle('webview-write', (event, collection, doc) => {
    // Get the sender ID to identify which webview is requesting
    const webContentsId = event.sender.id;
    
    // Get the parent window
    const win = BrowserWindow.fromWebContents(event.sender);
    
    // Forward the request to the renderer process (main window)
    if (win) {
      win.webContents.send('webview-write-request', {
        webContentsId,
        collection,
        doc
      });
    }
  });
  
  // Create a temporary file for the webview preload script
  const preloadPath = path.join(app.getPath('temp'), 'webview-preload.js');
  fs.writeFileSync(preloadPath, createWebViewPreloadScript());
  
  // Register the preload script
  ipcMain.handle('get-webview-preload-path', () => {
    return preloadPath;
  });
}

export default {
  setupWebViewHandlers,
  loadInstalledApps,
  addOrUpdateApp,
  removeApp,
  setAppPinned,
  setAppHidden,
  checkPermission,
  updatePermission
};