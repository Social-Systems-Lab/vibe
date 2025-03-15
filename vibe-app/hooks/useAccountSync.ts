import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { useDb } from '@/components/db/db-context';
import * as FileSystem from 'expo-file-system';
import { Account } from '@/types/types';
import { getDirNameFromDid } from '@/lib/utils';

type SyncStatus = 'idle' | 'syncing' | 'error' | 'completed';
type ServerStatus = 'checking' | 'online' | 'offline' | 'error';

interface AccountSyncState {
  syncStatus: SyncStatus;
  syncError: string | null;
  serverStatus: ServerStatus;
  isRegistered: boolean;
  lastSyncTime: number | null;
}

/**
 * Hook to manage account synchronization with Vibe Cloud
 */
export function useAccountSync() {
  const { currentAccount, encryptData, decryptData, loadCredentials } = useAuth();
  const { subscribe, syncWithServer } = useDb();
  const [state, setState] = useState<AccountSyncState>({
    syncStatus: 'idle',
    syncError: null,
    serverStatus: 'checking',
    isRegistered: false,
    lastSyncTime: null,
  });

  // Setup sync when account changes or server is updated
  useEffect(() => {
    if (!currentAccount || !currentAccount.server) return;

    async function setupSync() {
      if(!currentAccount || !currentAccount.server) return;

      // First check if the server is online
      setState(prev => ({ ...prev, serverStatus: 'checking' }));
      
      try {
        // Check if server is online
        const response = await fetch(`${currentAccount.server.url}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        const isOnline = response.ok;
        setState(prev => ({ 
          ...prev, 
          serverStatus: isOnline ? 'online' : 'offline' 
        }));

        // If online, check if we have credentials stored for this account
        if (isOnline) {
          const isRegistered = await checkRegistrationStatus();
          setState(prev => ({ ...prev, isRegistered }));

          // If registered, set up synchronization
          if (isRegistered) {
            setupDatabaseSync();
          }
        }
      } catch (error) {
        console.error('Error checking server status:', error);
        setState(prev => ({ 
          ...prev, 
          serverStatus: 'error',
          syncError: error instanceof Error ? error.message : 'Unknown error' 
        }));
      }
    }

    setupSync();

    // Cleanup function
    return () => {
      // Cleanup sync here if needed
    };
  }, [currentAccount]);

  // Check if this account has credentials stored
  async function checkRegistrationStatus(): Promise<boolean> {
    if (!currentAccount) return false;
    
    try {
      // Use the app-specific directory which is guaranteed to be writable
      const accountFolder = `${FileSystem.documentDirectory}accounts/${getDirNameFromDid(currentAccount.did)}/`;
      const credentialsPath = `${accountFolder}cloud-credentials.enc`;

      // Check if credentials exist
      const fileInfo = await FileSystem.getInfoAsync(credentialsPath);

      return fileInfo.exists;
      
    } catch (error) {
      console.error('Error checking registration status:', error);
      // Log more detailed error information for debugging
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      return false;
    }
  }

  async function setupDatabaseSync() {
    if (!currentAccount || !currentAccount.server) return;
    
    try {
      setState(prev => ({ ...prev, syncStatus: 'syncing' }));
      
      // Load credentials using the new helper
      const credentials = await loadCredentials(currentAccount);
      if (!credentials) {
        throw new Error('Cloud credentials not found');
      }
      
      // Use credentials to set up replication
      await syncWithServer(
        currentAccount.server.url,
        credentials.username,
        credentials.password,
        credentials.dbName
      );
      
      console.log(`Sync established with ${currentAccount.server.url}/db/${credentials.dbName}`);
      
      setState(prev => ({ 
        ...prev, 
        syncStatus: 'completed',
        lastSyncTime: Date.now()
      }));
    } catch (error) {
      console.error('Error setting up database sync:', error);
      setState(prev => ({ 
        ...prev, 
        syncStatus: 'error',
        syncError: error instanceof Error ? error.message : 'Unknown error' 
      }));
    }
  }
  
  return {
    ...state,
    checkServerStatus: async () => {
      if (!currentAccount || !currentAccount.server) return;
      
      setState(prev => ({ ...prev, serverStatus: 'checking' }));
      
      try {
        const response = await fetch(`${currentAccount.server.url}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        setState(prev => ({ 
          ...prev, 
          serverStatus: response.ok ? 'online' : 'offline' 
        }));
        
        return response.ok;
      } catch (error) {
        setState(prev => ({ 
          ...prev, 
          serverStatus: 'error',
          syncError: error instanceof Error ? error.message : 'Unknown error' 
        }));
        return false;
      }
    },
    triggerSync: async () => {
      if (!state.isRegistered || state.serverStatus !== 'online') return;
      await setupDatabaseSync();
    }
  };
}