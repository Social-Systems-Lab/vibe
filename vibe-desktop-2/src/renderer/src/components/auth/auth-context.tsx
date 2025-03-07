// auth-context.tsx - User account and auth management
// For vibe-desktop-2, adaptation of vibe-app/components/auth/auth-context.tsx

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { 
  signInStatusAtom, 
  activeAccountAtom, 
  signedInAccountsAtom,
  installedAppsAtom 
} from '../atoms';
import { useTabs } from '../browser/tab-context';

// Type definitions
export type AuthType = 'BIOMETRIC' | 'PIN' | 'NONE';
export type PermissionSetting = 'always' | 'ask' | 'never';
export type Operation = 'read' | 'write';

export interface ServerConfig {
  url: string;
  name: string;
  isConnected: boolean;
  lastConnected?: number;
}

export interface Account {
  did: string;
  name: string;
  pictureUrl?: string;
  publicKey: string;
  requireAuthentication: AuthType;
  updatedAt: number;
  server: ServerConfig;
}

export interface RsaKeys {
  publicKey: string;
  privateKey: string;
}

export interface InstalledApp {
  appId: string;
  name: string;
  description: string;
  pictureUrl?: string;
  url: string;
  permissions: Record<string, PermissionSetting>;
  hidden: boolean;
  pinned?: boolean;
}

interface AuthContextType {
  // Account management
  accounts: Account[];
  currentAccount: Account | null;
  loading: boolean;
  initialized: boolean;
  generateRSAKeys: () => Promise<RsaKeys>;
  signChallenge: (privateKey: string, challenge: string) => Promise<string>;
  createAccount: (accountName: string, authType: AuthType, pictureUrl?: string, pin?: string, serverConfig?: ServerConfig) => Promise<Account>;
  updateAccount: (accountDid: string, newName?: string, newPictureUri?: string) => Promise<void>;
  updateServerConfig: (accountDid: string, serverConfig: ServerConfig) => Promise<void>;
  deleteAccount: (accountDid: string) => Promise<void>;
  encryptData: (data: string) => Promise<string>;
  decryptData: (encryptedData: string) => Promise<string>;
  login: (accountDid: string, pin?: string) => Promise<void>;
  logout: () => Promise<void>;

  // App management
  installedApps: InstalledApp[];
  addOrUpdateApp: (app: Partial<InstalledApp>, account?: Account) => Promise<void>;
  removeApp: (appId: string) => Promise<void>;
  setAppPinned: (appId: string, pinned: boolean) => Promise<void>;
  setAppHidden: (appId: string, hidden: boolean) => Promise<void>;

  // Permissions
  checkPermission: (appId: string, operation: Operation, collection: string) => Promise<PermissionSetting>;
  updatePermission: (appId: string, operation: Operation, collection: string, newValue: PermissionSetting) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use atoms for state that needs to be accessed elsewhere
  const [, setSignInStatus] = useAtom(signInStatusAtom);
  const [, setActiveAccount] = useAtom(activeAccountAtom);
  const [signedInAccounts, setSignedInAccounts] = useAtom(signedInAccountsAtom);
  const [installedApps, setInstalledApps] = useAtom(installedAppsAtom);

  // Internal state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [encryptionKey, setEncryptionKey] = useState<string>('');

  // Get the tabs context functions
  const { resetTabs } = useTabs();

  // Load accounts from storage
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        // In Electron, we'll get accounts from the main process
        const loadedAccounts = await window.electron.getAccounts();
        setAccounts(loadedAccounts);
        setInitialized(true);
      } catch (error) {
        console.error('Error loading accounts:', error);
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  // RSA key generation - use Electron IPC to call main process
  const generateRSAKeys = useCallback(async (): Promise<RsaKeys> => {
    // Call main process to generate RSA keys
    try {
      // This will be implemented in the main process
      return await window.electron.generateRSAKeys();
    } catch (error) {
      console.error('Error generating RSA keys:', error);
      throw error;
    }
  }, []);

  // Sign a challenge with private key
  const signChallenge = useCallback(async (privateKey: string, challenge: string): Promise<string> => {
    try {
      // This will be implemented in the main process
      return await window.electron.signChallenge({ privateKey, challenge });
    } catch (error) {
      console.error('Error signing challenge:', error);
      throw error;
    }
  }, []);

  // Setup an account: load apps and other initialization
  const setupAccount = async (account: Account) => {
    if (!account) return;

    try {
      // Load installed apps for this account from main process
      const apps = await window.electron.getInstalledApps(account.did);
      setInstalledApps(apps);
    } catch (error) {
      console.error('Error setting up account:', error);
      // Continue anyway as we want basic functionality to work
    }
  };

  // Create a new account
  const createAccount = async (
    accountName: string, 
    authType: AuthType, 
    pictureUrl?: string, 
    pin?: string,
    serverConfig?: ServerConfig
  ): Promise<Account> => {
    setLoading(true);
    try {
      // Call main process to create account
      const newAccount = await window.electron.createAccount({
        name: accountName,
        authType,
        pictureUrl,
        pin,
        serverConfig
      });

      // Update local state
      setAccounts(prev => [...prev, newAccount]);
      setCurrentAccount(newAccount);
      setActiveAccount(newAccount);
      
      // Update signed in accounts atom
      const accountInfo = {
        id: newAccount.did,
        name: newAccount.name,
        pictureUrl: newAccount.pictureUrl
      };
      setSignedInAccounts([accountInfo]);
      
      // Set up the account (load apps and initialize)
      await setupAccount(newAccount);
      
      // Update sign in status
      setSignInStatus('loggedIn');
      
      return newAccount;
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Update account information
  const updateAccount = async (accountDid: string, newName?: string, newPictureUri?: string): Promise<void> => {
    try {
      // Call main process to update account
      const updatedAccount = await window.electron.updateAccount({
        did: accountDid,
        name: newName,
        pictureUrl: newPictureUri
      });

      // Update local state
      setAccounts(prev => {
        const index = prev.findIndex(acc => acc.did === accountDid);
        if (index >= 0) {
          const newAccounts = [...prev];
          newAccounts[index] = updatedAccount;
          return newAccounts;
        }
        return prev;
      });

      // If this is the current account, update it
      if (currentAccount?.did === accountDid) {
        setCurrentAccount(updatedAccount);
        setActiveAccount(updatedAccount);
        
        // Update signed in accounts atom
        setSignedInAccounts(prev => {
          const index = prev.findIndex(acc => acc.id === accountDid);
          if (index >= 0) {
            const newAccounts = [...prev];
            newAccounts[index] = {
              id: updatedAccount.did,
              name: updatedAccount.name,
              pictureUrl: updatedAccount.pictureUrl
            };
            return newAccounts;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Error updating account:', error);
      throw error;
    }
  };

  // Update server configuration
  const updateServerConfig = async (accountDid: string, serverConfig: ServerConfig): Promise<void> => {
    try {
      // Call main process to update server config
      const updatedAccount = await window.electron.updateServerConfig({
        did: accountDid,
        serverConfig
      });

      // Update local state
      setAccounts(prev => {
        const index = prev.findIndex(acc => acc.did === accountDid);
        if (index >= 0) {
          const newAccounts = [...prev];
          newAccounts[index] = updatedAccount;
          return newAccounts;
        }
        return prev;
      });

      // If this is the current account, update it
      if (currentAccount?.did === accountDid) {
        setCurrentAccount(updatedAccount);
        setActiveAccount(updatedAccount);
      }
    } catch (error) {
      console.error('Error updating server config:', error);
      throw error;
    }
  };

  // Delete an account
  const deleteAccount = async (accountDid: string): Promise<void> => {
    setLoading(true);
    try {
      // Call main process to delete account
      await window.electron.deleteAccount(accountDid);

      // Update local state
      setAccounts(prev => prev.filter(acc => acc.did !== accountDid));

      // If the deleted account was the current account, clear it
      if (currentAccount?.did === accountDid) {
        setCurrentAccount(null);
        setActiveAccount(null);
        setSignInStatus('notLoggedIn');
        resetTabs();
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Encrypt data using the current account's encryption key
  const encryptData = async (data: string): Promise<string> => {
    if (!currentAccount) throw new Error('No account selected');
    
    try {
      // Call main process to encrypt data
      return await window.electron.encryptData({
        data,
        did: currentAccount.did
      });
    } catch (error) {
      console.error('Error encrypting data:', error);
      throw error;
    }
  };

  // Decrypt data using the current account's encryption key
  const decryptData = async (encryptedData: string): Promise<string> => {
    if (!currentAccount) throw new Error('No account selected');
    
    try {
      // Call main process to decrypt data
      return await window.electron.decryptData({
        encryptedData,
        did: currentAccount.did
      });
    } catch (error) {
      console.error('Error decrypting data:', error);
      throw error;
    }
  };

  // Login to an account
  const login = async (accountDid: string, pin?: string): Promise<void> => {
    try {
      // Call main process to login
      const account = await window.electron.loginAccount(accountDid, pin);
      
      // Update local state
      setCurrentAccount(account);
      setActiveAccount(account);
      
      // Update signed in accounts atom
      const accountInfo = {
        id: account.did,
        name: account.name,
        pictureUrl: account.pictureUrl
      };
      setSignedInAccounts([accountInfo]);
      
      // Set up the account (load apps and initialize)
      await setupAccount(account);
      
      // Update sign in status
      setSignInStatus('loggedIn');
      
      // Reset tabs when logging in
      resetTabs();
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  // Logout from the current account
  const logout = async (): Promise<void> => {
    try {
      // Call main process to logout
      await window.electron.logout();
      
      // Clear local state
      setCurrentAccount(null);
      setActiveAccount(null);
      setInstalledApps([]);
      
      // Update sign in status
      setSignInStatus('notLoggedIn');
      
      // Reset tabs
      resetTabs();
    } catch (error) {
      console.error('Error during logout:', error);
      // Still clear the account even if there was an error
      setCurrentAccount(null);
      setActiveAccount(null);
      setSignInStatus('notLoggedIn');
      resetTabs();
    }
  };

  // App management functions
  async function saveInstalledApps(apps: InstalledApp[], account?: Account) {
    const targetAccount = account || currentAccount;
    if (!targetAccount) {
      throw new Error('Cannot add app: No account selected');
    }

    // Call main process to save installed apps
    await window.electron.saveInstalledApps({
      did: targetAccount.did,
      apps
    });
    
    // Update local state
    setInstalledApps(apps);
  }

  // Add or update an app
  async function addOrUpdateApp(app: Partial<InstalledApp>, account?: Account) {
    const targetAccount = account || currentAccount;
    if (!targetAccount) {
      throw new Error('Cannot add app: No account selected');
    }

    console.log('addOrUpdateApp for account:', targetAccount.did, ', app:', app);

    let existingIndex = installedApps.findIndex(a => a.appId === app.appId);
    let newList;
    if (existingIndex >= 0) {
      // update
      newList = [...installedApps];
      newList[existingIndex] = { ...installedApps[existingIndex], ...app } as InstalledApp;
    } else {
      // add
      newList = [...installedApps, app as InstalledApp];
    }
    await saveInstalledApps(newList, account);
  }

  // Remove an app
  async function removeApp(appId: string) {
    const filtered = installedApps.filter(a => a.appId !== appId);
    await saveInstalledApps(filtered);
  }

  // Set an app as pinned
  async function setAppPinned(appId: string, pinned: boolean) {
    const newList = installedApps.map(a => {
      if (a.appId === appId) return { ...a, pinned };
      return a;
    });
    await saveInstalledApps(newList);
  }

  // Set an app as hidden
  async function setAppHidden(appId: string, hidden: boolean) {
    const newList = installedApps.map(a => {
      if (a.appId === appId) return { ...a, hidden };
      return a;
    });
    await saveInstalledApps(newList);
  }

  // Permission management functions
  async function checkPermission(appId: string, operation: Operation, collection: string): Promise<PermissionSetting> {
    // e.g. expecting "read.contacts" or "write.contacts"
    const permKey = `${operation}.${collection}`;
    const app = installedApps.find(a => a.appId === appId);
    if (!app) throw new Error('App not installed');

    // Get or default to "never"
    const permission = app.permissions?.[permKey] ?? 'never';
    return permission;
  }

  // Update a permission setting
  async function updatePermission(appId: string, operation: Operation, collection: string, newValue: PermissionSetting) {
    const permKey = `${operation}.${collection}`;
    const app = installedApps.find(a => a.appId === appId);
    if (!app) return;
    
    // Create updated app with new permission
    const updatedApp = {
      ...app,
      permissions: {
        ...app.permissions,
        [permKey]: newValue,
      }
    };
    
    // Update app in list
    const newList = installedApps.map(a => 
      a.appId === appId ? updatedApp : a
    );
    
    // Save updated apps
    await saveInstalledApps(newList);
  }

  // Provide the auth context
  return (
    <AuthContext.Provider
      value={{
        // Account management
        generateRSAKeys,
        signChallenge,
        accounts,
        currentAccount,
        createAccount,
        updateAccount,
        updateServerConfig,
        encryptData,
        decryptData,
        login,
        logout,
        loading,
        initialized,
        deleteAccount,

        // App management
        installedApps,
        addOrUpdateApp,
        removeApp,
        setAppPinned,
        setAppHidden,

        // Permissions
        checkPermission,
        updatePermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};