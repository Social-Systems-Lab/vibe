// Account management for vibe-desktop
// Adapted from vibe-app/components/auth/auth-context.tsx

import { app, ipcMain, BrowserWindow } from 'electron';
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
let _accountsInitialized = false;
let _accountsDirectoryWatcher: fs.FSWatcher | null = null;

// Create the accounts directory if it doesn't exist
if (!fs.existsSync(ACCOUNTS_DIR)) {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
}

// Types
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

interface RsaKeys {
  publicKey: string;
  privateKey: string;
}

// --- Account functions ---

// Gets list of accounts on the device
const getAccounts = (): Account[] => {
  console.log('getAccounts called');
  if (_accountsInitialized) {
    return _accounts;
  }

  _accountsInitialized = true;
  
  // Load accounts from disk
  try {
    const accountDirs = fs.readdirSync(ACCOUNTS_DIR);
    
    // Read accounts.json which contains the account metadata
    const accountsFilePath = path.join(ACCOUNTS_DIR, 'accounts.json');
    
    if (fs.existsSync(accountsFilePath)) {
      const accountsData = fs.readFileSync(accountsFilePath, 'utf8');
      _accounts = JSON.parse(accountsData);
      
      // Make sure pictureUrl paths are absolute
      _accounts = _accounts.map(account => {
        if (account.pictureUrl && !path.isAbsolute(account.pictureUrl)) {
          const accountPath = path.join(ACCOUNTS_DIR, account.name);
          account.pictureUrl = path.join(accountPath, PICTURE_FILENAME);
        }
        return account;
      });
    } else {
      _accounts = [];
      // Try loading legacy format accounts
      _accounts = accountDirs
        .map((dir) => {
            const accountPath = path.join(ACCOUNTS_DIR, dir);
            if (fs.statSync(accountPath).isDirectory()) {
                const account: Account = { name: dir }; // assuming the directory name is the display name
                const picturePath = path.join(accountPath, PICTURE_FILENAME);
                if (fs.existsSync(picturePath)) {
                    account.pictureUrl = picturePath;
                }
                return account;
            }
            return null;
        })
        .filter(Boolean) as Account[]; // filter out any null values (non-directory files)
    }
  } catch (error) {
    console.error('Error loading accounts:', error);
    _accounts = [];
  }
  
  return _accounts;
};

// Save accounts to disk
const saveAccounts = async (): Promise<void> => {
  const accountsFilePath = path.join(ACCOUNTS_DIR, 'accounts.json');
  
  // Create a copy of accounts with relative paths for storage
  const accountsToSave = _accounts.map(account => {
    const accountCopy = { ...account };
    
    // Store relative paths for pictures
    if (accountCopy.pictureUrl) {
      const accountPath = path.join(ACCOUNTS_DIR, account.name);
      if (accountCopy.pictureUrl.startsWith(accountPath)) {
        accountCopy.pictureUrl = path.relative(accountPath, accountCopy.pictureUrl);
      }
    }
    
    return accountCopy;
  });
  
  fs.writeFileSync(accountsFilePath, JSON.stringify(accountsToSave, null, 2));
};

// Generate a DID from a public key
const generateDid = (publicKey: string): string => {
  // Hash the public key using SHA-256
  const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
  
  // Convert the hash to Base64 and make it URL safe
  const base64Url = Buffer.from(hash, 'hex')
    .toString('base64')
    .replace(/\+/g, '-') // Replace + with -
    .replace(/\//g, '_') // Replace / with _
    .replace(/=+$/, ''); // Remove trailing =
  
  // Prefix the result to form a DID
  return `did:fan:${base64Url}`;
};

// Generate RSA key pair
const generateRSAKeys = (): RsaKeys => {
  // Generate a new key pair
  const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey
  };
};

// Encrypt data with a key
const encryptData = (data: string, encryptionKey: string): string => {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(encryptionKey, 'base64').subarray(0, 32);
  const cipher = crypto.createCipheriv(ENCRYPTION, key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Prefix the IV to the encrypted data
  return iv.toString('hex') + ':' + encrypted;
};

// Decrypt data with a key
const decryptData = (encryptedData: string, encryptionKey: string): string => {
  const [ivHex, encryptedHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(encryptionKey, 'base64').subarray(0, 32);
  
  const decipher = crypto.createDecipheriv(ENCRYPTION, key, iv);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

// Generate encryption key
const generateEncryptionKey = (): string => {
  const keyBytes = crypto.randomBytes(32);
  return keyBytes.toString('base64');
};

// Sign challenge with private key
const signChallenge = (privateKey: string, challenge: string): string => {
  const sig = new jsrsasign.KJUR.crypto.Signature({ alg: 'SHA256withRSA' });
  sig.init(privateKey);
  sig.updateString(challenge);
  return sig.sign();
};

// Create a new account
const createAccount = async (
  accountName: string, 
  password: string, 
  picturePath?: string, 
  authType: 'PIN' | 'BIOMETRIC' = 'PIN',
  serverConfig?: { url: string; name?: string; }
): Promise<Account> => {
  console.log('createAccount called');
  
  if (!_accountsInitialized) {
    getAccounts();
  }

  try {
    // Generate keys and encryption key
    const rsaKeys = generateRSAKeys();
    const encryptionKey = generateEncryptionKey();
    
    // Generate DID from public key
    const did = generateDid(rsaKeys.publicKey);
    
    // Create account directory
    const accountDir = path.join(ACCOUNTS_DIR, accountName);
    if (fs.existsSync(accountDir)) {
      throw new Error('Account already exists');
    }
    
    fs.mkdirSync(accountDir, { recursive: true });
    
    // Encrypt private key with the encryption key
    const encryptedPrivateKey = encryptData(rsaKeys.privateKey, encryptionKey);
    
    // Store the public key and encrypted private key
    fs.writeFileSync(path.join(accountDir, PUBLIC_KEY_FILENAME), rsaKeys.publicKey);
    fs.writeFileSync(path.join(accountDir, PRIVATE_KEY_FILENAME), encryptedPrivateKey);
    
    // If PIN auth, create a salt and store the encryption key encrypted with the PIN
    if (authType === 'PIN') {
      // Generate a salt
      const salt = crypto.randomBytes(16);
      fs.writeFileSync(path.join(accountDir, SALT_FILENAME), salt);
      
      // Hash the PIN with the salt to create a key
      const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
      
      // Encrypt the encryption key with the derived key
      const iv = crypto.randomBytes(16);
      fs.writeFileSync(path.join(accountDir, IV_FILENAME), iv);
      
      const cipher = crypto.createCipheriv(ENCRYPTION, derivedKey, iv);
      let encryptedKey = cipher.update(encryptionKey, 'utf8', 'hex');
      encryptedKey += cipher.final('hex');
      
      // Store the encrypted encryption key
      fs.writeFileSync(path.join(accountDir, 'encryption-key.enc'), encryptedKey);
    } else {
      // For biometric, just store the encryption key directly
      // In a real implementation, you'd use the OS keychain
      fs.writeFileSync(path.join(accountDir, 'encryption-key'), encryptionKey);
    }
    
    // Copy profile picture if provided
    let storedPicturePath: string | undefined = undefined;
    if (picturePath && fs.existsSync(picturePath)) {
      const destination = path.join(accountDir, PICTURE_FILENAME);
      fs.copyFileSync(picturePath, destination);
      storedPicturePath = destination;
    } else {
      // Use default picture
      const defaultPicture = path.join(app.getAppPath(), 'resources', 'default-profile.png');
      if (fs.existsSync(defaultPicture)) {
        const destination = path.join(accountDir, PICTURE_FILENAME);
        fs.copyFileSync(defaultPicture, destination);
        storedPicturePath = destination;
      }
    }
    
    // Set up default server config if none provided
    const defaultServer = serverConfig || {
      url: 'http://localhost:5000',
      name: 'Local Server',
      isConnected: false
    };
    
    const now = Date.now();
    const newAccount: Account = {
      did,
      publicKey: rsaKeys.publicKey,
      name: accountName,
      pictureUrl: storedPicturePath,
      requireAuthentication: authType,
      updatedAt: now,
      server: defaultServer
    };
    
    // Add to accounts list and save
    _accounts.push(newAccount);
    await saveAccounts();
    
    return newAccount;
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
};

// Login to an account
const login = async (name: string, password: string): Promise<Account> => {
  console.log('login called');
  
  // Get account
  if (!_accountsInitialized) {
    getAccounts();
  }
  
  const account = _accounts.find(a => a.name === name);
  if (!account) {
    throw new Error('Account not found');
  }
  
  const accountDir = path.join(ACCOUNTS_DIR, name);
  
  try {
    // Get the encryption key based on auth type
    let encryptionKey: string;
    
    if (account.requireAuthentication === 'PIN') {
      // Read salt and derive key from PIN
      const salt = fs.readFileSync(path.join(accountDir, SALT_FILENAME));
      const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
      
      // Read IV and encrypted key
      const iv = fs.readFileSync(path.join(accountDir, IV_FILENAME));
      const encryptedKey = fs.readFileSync(path.join(accountDir, 'encryption-key.enc'), 'utf8');
      
      // Decrypt the encryption key
      const decipher = crypto.createDecipheriv(ENCRYPTION, derivedKey, iv);
      let decryptedKey = decipher.update(encryptedKey, 'hex', 'utf8');
      decryptedKey += decipher.final('utf8');
      
      encryptionKey = decryptedKey;
    } else {
      // For biometric, read the encryption key directly
      // In a real implementation, you'd use the OS keychain
      encryptionKey = fs.readFileSync(path.join(accountDir, 'encryption-key'), 'utf8');
    }
    
    // Read and decrypt the private key as a test
    const encryptedPrivateKey = fs.readFileSync(path.join(accountDir, PRIVATE_KEY_FILENAME), 'utf8');
    
    try {
      const privateKey = decryptData(encryptedPrivateKey, encryptionKey);
      
      // Check if the decrypted private key is valid
      if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid private key format');
      }
      
      // Store the encryption key in-memory for this session
      (account as any).encryptionKey = encryptionKey;
      
      return account;
    } catch (error) {
      console.error('Error decrypting private key:', error);
      throw new Error('Incorrect PIN or authentication failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

// Update account
const updateAccount = async (
  accountName: string, 
  newName?: string, 
  newPictureUri?: string
): Promise<void> => {
  const index = _accounts.findIndex(acc => acc.name === accountName);
  if (index < 0) throw new Error('Account not found');
  
  const account = _accounts[index];
  const accountDir = path.join(ACCOUNTS_DIR, accountName);
  
  // Update picture if provided
  let storedPicturePath = account.pictureUrl;
  if (newPictureUri && fs.existsSync(newPictureUri)) {
    const destination = path.join(accountDir, PICTURE_FILENAME);
    fs.copyFileSync(newPictureUri, destination);
    storedPicturePath = destination;
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

// Set up IPC handlers
export function setupAccountHandlers(): void {
  // Get all accounts
  ipcMain.handle('get-accounts', () => {
    return getAccounts();
  });
  
  // Create a new account
  ipcMain.handle('create-account', (_, accountName, password, picturePath, authType, serverConfig) => {
    return createAccount(accountName, password, picturePath, authType || 'PIN', serverConfig);
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
  stopWatchingAccountsDirectory
};