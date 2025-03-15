// Account management for vibe-desktop
// Adapted from vibe-app/components/auth/auth-context.tsx

import { app, ipcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as jsrsasign from 'jsrsasign';

// Directory for storing account data
const ACCOUNTS_DIR = path.join(app.getPath('userData'), 'Accounts');
const SALT_FILENAME = 'salt.dat';
const IV_FILENAME = 'iv.dat';
const PUBLIC_KEY_FILENAME = 'public-key.pem';
const PRIVATE_KEY_FILENAME = 'private-key.pem.enc';
const PICTURE_FILENAME = 'picture.png';
const ENCRYPTION = 'aes-256-cbc';

// In-memory state
let _accounts: Account[] = [];
let _accountsDirectoryWatcher: fs.FSWatcher | null = null;

// Define account types
interface ServerConfig {
  url: string;
  name?: string;
  isConnected?: boolean;
  lastConnected?: number;
}

interface Account {
  name: string;
  did: string;
  publicKey: string;
  pictureUrl?: string;
  requireAuthentication: 'PIN' | 'BIOMETRIC' | 'NONE';
  updatedAt: number;
  server?: ServerConfig;
}

interface RsaKeys {
  publicKey: string;
  privateKey: string;
}

// Initialize accounts directory
if (!fs.existsSync(ACCOUNTS_DIR)) {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
}

// Load account list from disk
const loadAccounts = (): void => {
  _accounts = [];
  
  try {
    // List all directories in the accounts directory
    const accountDirs = fs.readdirSync(ACCOUNTS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Load each account
    for (const accountDir of accountDirs) {
      try {
        const accountConfigPath = path.join(ACCOUNTS_DIR, accountDir, 'config.json');
        if (fs.existsSync(accountConfigPath)) {
          const accountConfig = JSON.parse(fs.readFileSync(accountConfigPath, 'utf8'));
          
          // Ensure account has required fields
          if (!accountConfig.name || !accountConfig.did || !accountConfig.publicKey) {
            console.error(`Invalid account config in ${accountDir}`);
            continue;
          }
          
          // Add picture URL if available
          const picturePath = path.join(ACCOUNTS_DIR, accountDir, PICTURE_FILENAME);
          let pictureUrl;
          if (fs.existsSync(picturePath)) {
            pictureUrl = `file://${picturePath}`;
          }
          
          // Add account to list
          _accounts.push({
            ...accountConfig,
            pictureUrl
          });
        }
      } catch (error) {
        console.error(`Error loading account ${accountDir}:`, error);
      }
    }
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
};

// Save account list to disk
const saveAccounts = async (): Promise<void> => {
  try {
    // Save each account's config
    for (const account of _accounts) {
      const accountDir = path.join(ACCOUNTS_DIR, account.name);
      
      // Create account directory if it doesn't exist
      if (!fs.existsSync(accountDir)) {
        fs.mkdirSync(accountDir, { recursive: true });
      }
      
      // Save account config without pictureUrl (it's derived)
      const { pictureUrl, ...accountConfig } = account;
      fs.writeFileSync(
        path.join(accountDir, 'config.json'),
        JSON.stringify(accountConfig, null, 2)
      );
    }
  } catch (error) {
    console.error('Error saving accounts:', error);
  }
};

// Get all accounts
const getAccounts = (): Account[] => {
  // Load accounts if not already loaded
  if (_accounts.length === 0) {
    loadAccounts();
  }
  
  return _accounts;
};

// Generate a DID
const generateDid = (): string => {
  const id = crypto.randomBytes(16).toString('hex');
  return `did:vibe:${id}`;
};

// Generate RSA key pair for identity
const generateRSAKeys = async (): Promise<RsaKeys> => {
  try {
    const keyPair = jsrsasign.KEYUTIL.generateKeypair('RSA', 2048);
    
    const publicKey = jsrsasign.KEYUTIL.getPEM(keyPair.pubKeyObj);
    const privateKey = jsrsasign.KEYUTIL.getPEM(keyPair.prvKeyObj, 'PKCS8PRV');
    
    return { publicKey, privateKey };
  } catch (error) {
    console.error('Error generating RSA keys:', error);
    throw error;
  }
};

// Encrypt data with account password
const encryptData = (data: string, password: string, salt: Buffer, iv: Buffer): Buffer => {
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv(ENCRYPTION, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(data)),
    cipher.final()
  ]);
  
  return encrypted;
};

// Decrypt data with account password
const decryptData = (encryptedData: Buffer, password: string, salt: Buffer, iv: Buffer): string => {
  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv(ENCRYPTION, key, iv);
  
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);
  
  return decrypted.toString();
};

// Create a new account
const createAccount = async (
  accountName: string, 
  password: string, 
  picturePath?: string, 
  authType: 'PIN' | 'BIOMETRIC' | 'NONE' = 'PIN',
  serverConfig?: ServerConfig
): Promise<Account> => {
  console.log('Creating account with params:', { accountName, password, picturePath, authType, serverConfig });
  
  // Check if account already exists
  const existingAccount = _accounts.find(account => account.name === accountName);
  if (existingAccount) {
    throw new Error(`Account ${accountName} already exists`);
  }
  
  try {
    // Generate DID
    const did = generateDid();
    
    // Generate RSA keys
    const { publicKey, privateKey } = await generateRSAKeys();
    
    // Create account directory
    const accountDir = path.join(ACCOUNTS_DIR, accountName);
    if (!fs.existsSync(accountDir)) {
      fs.mkdirSync(accountDir, { recursive: true });
    }
    
    // Generate salt and IV
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    
    // Save salt and IV
    fs.writeFileSync(path.join(accountDir, SALT_FILENAME), salt);
    fs.writeFileSync(path.join(accountDir, IV_FILENAME), iv);
    
    // Save public key
    fs.writeFileSync(path.join(accountDir, PUBLIC_KEY_FILENAME), publicKey);
    
    // Encrypt and save private key
    if (password) {
      const encryptedPrivateKey = encryptData(privateKey, password, salt, iv);
      fs.writeFileSync(path.join(accountDir, PRIVATE_KEY_FILENAME), encryptedPrivateKey);
    } else {
      // For 'NONE' auth type, just save the private key unencrypted (in a real app, use system keychain)
      fs.writeFileSync(path.join(accountDir, PRIVATE_KEY_FILENAME), privateKey);
    }
    
    // Save profile picture if provided
    let pictureUrl;
    if (picturePath) {
      try {
        const pictureDest = path.join(accountDir, PICTURE_FILENAME);
        fs.copyFileSync(picturePath, pictureDest);
        pictureUrl = `file://${pictureDest}`;
      } catch (error) {
        console.error('Error copying profile picture:', error);
      }
    }
    
    // Default server config
    const defaultServerConfig: ServerConfig = {
      url: 'https://cloud.vibeapp.dev',
      name: 'Official Vibe Cloud',
      isConnected: false,
    };
    
    // Create account object
    const now = Date.now();
    const account: Account = {
      name: accountName,
      did,
      publicKey,
      pictureUrl,
      requireAuthentication: authType,
      updatedAt: now,
      server: serverConfig || defaultServerConfig
    };
    
    // Save account config
    fs.writeFileSync(
      path.join(accountDir, 'config.json'),
      JSON.stringify(account, null, 2)
    );
    
    // Add to accounts list
    _accounts.push(account);
    
    return account;
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
};

// Login to account
const login = async (accountName: string, password: string): Promise<Account> => {
  // Find account
  const account = _accounts.find(acc => acc.name === accountName);
  if (!account) {
    throw new Error('Account not found');
  }
  
  const accountDir = path.join(ACCOUNTS_DIR, accountName);
  
  // If auth type is NONE, just return the account
  if (account.requireAuthentication === 'NONE') {
    return account;
  }
  
  // Verify password by attempting to decrypt the private key
  try {
    const salt = fs.readFileSync(path.join(accountDir, SALT_FILENAME));
    const iv = fs.readFileSync(path.join(accountDir, IV_FILENAME));
    const encryptedPrivateKey = fs.readFileSync(path.join(accountDir, PRIVATE_KEY_FILENAME));
    
    // Try to decrypt the private key
    decryptData(encryptedPrivateKey, password, salt, iv);
    
    // If decryption succeeds, return the account
    return account;
  } catch (error) {
    throw new Error('Invalid password');
  }
};

// Update account info
const updateAccount = async (
  accountName: string, 
  newName?: string, 
  newPictureUri?: string
): Promise<void> => {
  const index = _accounts.findIndex(acc => acc.name === accountName);
  if (index < 0) throw new Error('Account not found');
  
  const account = _accounts[index];
  const accountDir = path.join(ACCOUNTS_DIR, accountName);
  
  // If renaming account, update directory
  if (newName && newName !== accountName) {
    const newAccountDir = path.join(ACCOUNTS_DIR, newName);
    
    // Check if new name is already taken
    if (fs.existsSync(newAccountDir)) {
      throw new Error(`Account ${newName} already exists`);
    }
    
    // Rename directory
    fs.renameSync(accountDir, newAccountDir);
  }
  
  // Update profile picture if provided
  let storedPicturePath;
  if (newPictureUri) {
    try {
      // Extract file path from URI
      const picturePath = newPictureUri.replace('file://', '');
      
      // Target path for picture
      const pictureDest = path.join(
        newName ? path.join(ACCOUNTS_DIR, newName) : accountDir, 
        PICTURE_FILENAME
      );
      
      // Copy file
      fs.copyFileSync(picturePath, pictureDest);
      storedPicturePath = `file://${pictureDest}`;
    } catch (error) {
      console.error('Error updating profile picture:', error);
    }
  } else {
    // Keep existing picture
    storedPicturePath = account.pictureUrl;
  }
  
  // Update account object
  const now = Date.now();
  const updatedAccount = {
    ...account,
    name: newName || account.name,
    pictureUrl: storedPicturePath,
    updatedAt: now
  };
  
  // Update accounts list and save
  _accounts[index] = updatedAccount;
  await saveAccounts();
};

// Update server config
const updateServerConfig = async (
  accountName: string, 
  serverConfig: { url: string; name?: string; isConnected?: boolean; }
): Promise<void> => {
  const index = _accounts.findIndex(acc => acc.name === accountName);
  if (index < 0) throw new Error('Account not found');
  
  const account = _accounts[index];
  
  // Update account object
  const now = Date.now();
  const updatedAccount = {
    ...account,
    server: serverConfig,
    updatedAt: now
  };
  
  // Update accounts list and save
  _accounts[index] = updatedAccount;
  await saveAccounts();
};

// Delete account
const deleteAccount = async (accountName: string): Promise<void> => {
  const accountDir = path.join(ACCOUNTS_DIR, accountName);
  
  // Check if directory exists
  if (fs.existsSync(accountDir)) {
    // Delete the account directory and all contents
    fs.rmSync(accountDir, { recursive: true, force: true });
  }
  
  // Remove from accounts list
  _accounts = _accounts.filter(account => account.name !== accountName);
  await saveAccounts();
};

// Read directory structure for file explorer
const getIconForPath = async (filePath: string): Promise<string | null> => {
  try {
    const icon = await app.getFileIcon(filePath, { size: 'normal' });
    return icon.toDataURL();
  } catch (error) {
    console.error('Error fetching icon:', error);
    return null; // or a default icon path
  }
};

const readDirectory = async (dir: string, parentPath = ''): Promise<any[]> => {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  let directoryTree = [];
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    const id = path.join(parentPath, dirent.name);
    const icon = await getIconForPath(fullPath); // Fetch icon for the path

    directoryTree.push({
      id,
      name: dirent.name,
      icon: icon, // add the icon data URL
      children: dirent.isDirectory() ? await readDirectory(fullPath, id) : [],
    });
  }
  
  return directoryTree;
};

const getAccountsDirectoryData = async (): Promise<any[]> => {
  console.log('getAccountsDirectoryData');
  let directoryData = await readDirectory(ACCOUNTS_DIR);
  return directoryData;
};

// Watch the accounts directory for changes
export const startWatchingAccountsDirectory = (win: BrowserWindow): boolean => {
  if (!fs.existsSync(ACCOUNTS_DIR)) {
    fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  }

  if (_accountsDirectoryWatcher) _accountsDirectoryWatcher.close();
  _accountsDirectoryWatcher = fs.watch(ACCOUNTS_DIR, { recursive: true }, () => {
    win.webContents.send('accounts-directory-changed');
  });

  return true;
};

export const stopWatchingAccountsDirectory = (): void => {
  if (_accountsDirectoryWatcher) _accountsDirectoryWatcher.close();
  _accountsDirectoryWatcher = null;
};

// Image selection helper
export async function selectImage(): Promise<string | undefined> {
  console.log('Selecting image...');
  const mainWindow = BrowserWindow.getFocusedWindow();
  if (!mainWindow) return undefined;
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] }
    ]
  });
  
  console.log('Dialog result:', result);
  
  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }
  
  return result.filePaths[0];
}

// Set up IPC handlers
export function setupAccountHandlers(): void {
  console.log('Setting up account handlers');
  
  // Image selection
  ipcMain.handle('select-image', async () => {
    console.log('Handling select-image');
    return await selectImage();
  });
  
  // Get all accounts
  ipcMain.handle('get-accounts', () => {
    return getAccounts();
  });
  
  // Create a new account
  ipcMain.handle('create-account', (_, accountName, password, picturePath, authType, serverConfig) => {
    console.log('Creating account with args:', { accountName, password, picturePath, authType, serverConfig });
    return createAccount(accountName, password, picturePath, authType, serverConfig);
  });
  
  // Login to an account
  ipcMain.handle('login', (_, name, password) => {
    return login(name, password);
  });
  
  // Update account
  ipcMain.handle('update-account', (_, accountName, newName, newPictureUri) => {
    return updateAccount(accountName, newName, newPictureUri);
  });
  
  // Update server config
  ipcMain.handle('update-server-config', (_, accountName, serverConfig) => {
    return updateServerConfig(accountName, serverConfig);
  });
  
  // Delete account
  ipcMain.handle('delete-account', (_, accountName) => {
    return deleteAccount(accountName);
  });
  
  // Directory data
  ipcMain.handle('get-accounts-directory-data', async () => {
    return await getAccountsDirectoryData();
  });
}

export default {
  setupAccountHandlers,
  getAccounts,
  createAccount,
  login,
  updateAccount,
  updateServerConfig,
  deleteAccount,
  startWatchingAccountsDirectory,
  stopWatchingAccountsDirectory,
  selectImage
};