// useAccountSync.ts - Hook to sync account server settings with P2P context
import { useEffect } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { useP2P } from '@/components/p2p/p2p-context';

/**
 * Custom hook to sync account server settings with P2P context
 * Used in layout or app root to keep contexts in sync
 */
export function useAccountSync() {
  const { currentAccount } = useAuth();
  const { setServerUrl, serverStatus, checkServerConnection } = useP2P();

  // Effect to sync P2P context with account server settings
  useEffect(() => {
    if (currentAccount?.server?.url) {
      console.log("Syncing P2P context with account server settings", currentAccount.server.url);
      
      // Update server URL in P2P context
      setServerUrl(currentAccount.server.url);
      
      // Check connection if needed
      if (serverStatus === 'disconnected' && currentAccount.server.isConnected) {
        // Only check if we think it should be connected
        checkServerConnection();
      }
    }
  }, [currentAccount, setServerUrl, checkServerConnection]);

  return null;
}