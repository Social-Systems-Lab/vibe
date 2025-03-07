import { app, BrowserWindow, shell, ipcMain } from 'electron';
import * as path from 'path';
import { setupAccountHandlers, startWatchingAccountsDirectory, stopWatchingAccountsDirectory } from './account';
import { setupDatabaseHandlers } from './database';
import { setupWebViewHandlers } from './webview';

// Main window reference
let mainWindow: BrowserWindow | null = null;

// Preload paths
const preloadPath = path.join(__dirname, '../preload/index.js');
const webviewPreloadPath = path.join(app.getPath('temp'), 'webview-preload.js');

// Create the main application window
function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    frame: false, // Frameless window for custom title bar
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true // Enable webview tag for browser tabs
    }
  });

  // Show window once it's ready
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open links in external browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Window controls
  ipcMain.handle('minimize-window', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('maximize-window', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('close-window', () => {
    mainWindow?.close();
  });

  ipcMain.handle('is-window-maximized', () => {
    return mainWindow?.isMaximized();
  });

  // Get application configuration
  ipcMain.handle('get-config', () => {
    return {
      webviewPreloadPath,
      appPath: app.getAppPath(),
      accountsPath: path.join(app.getPath('userData'), 'Accounts')
    };
  });

  // Handle WebView message passing
  ipcMain.on('toMain', (event, message) => {
    console.log('Message received in main process:', message);
    mainWindow?.webContents.send('fromMain', message);
  });

  // Window blur events
  ipcMain.on('blur', () => {
    console.log('blur');
    mainWindow?.webContents.send('fromMain', { type: 'window-blur' });
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('fromMain', { type: 'window-blur' });
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    // Development mode - load from dev server
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode - load from local file
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Set up all the main process handlers
  setupAccountHandlers();
  setupDatabaseHandlers();
  setupWebViewHandlers();
  
  // Create the application window
  createWindow();
  
  // Start watching the accounts directory
  if (mainWindow) {
    startWatchingAccountsDirectory(mainWindow);
  }

  // On macOS, re-create the window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  mainWindow = null;
  stopWatchingAccountsDirectory();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});