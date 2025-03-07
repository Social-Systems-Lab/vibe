// p2p-context.tsx - Peer-to-peer communication using WebRTC
// For vibe-desktop-2, adaptation of vibe-app/components/p2p/p2p-context.tsx

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/auth-context';

// Message type definitions
interface Message {
  peerId: string;
  content: string;
  incoming: boolean;
  timestamp: Date;
}

interface P2PContextType {
  connections: Map<string, boolean>; // Map of connected peer IDs -> connection status
  messages: Message[];
  connectToPeer: (peerId: string) => Promise<void>;
  disconnectFromPeer: (peerId: string) => void;
  sendMessage: (peerId: string, content: string) => Promise<void>;
  localPeerId: string | null;
  isReady: boolean;
  serverUrl: string | null;
  serverStatus: 'disconnected' | 'connecting' | 'connected';
  setServerUrl: (url: string) => void;
  checkServerConnection: () => Promise<boolean>;
}

export const P2PContext = createContext<P2PContextType | null>(null);

export const P2PProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAccount } = useAuth();
  const [connections, setConnections] = useState<Map<string, boolean>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Initialize P2P when component mounts
  useEffect(() => {
    const initializeP2P = async () => {
      try {
        // Get server URL from current account if available
        if (currentAccount?.server?.url) {
          setServerUrl(currentAccount.server.url);
        }
        
        // Initialize P2P in main process
        const result = await window.electron.initializeP2P();
        setLocalPeerId(result.localPeerId);
        setIsReady(true);
        
        // Set up event listeners for P2P events
        window.electron.onPeerConnected((event, peerId) => {
          setConnections(prev => {
            const newConnections = new Map(prev);
            newConnections.set(peerId, true);
            return newConnections;
          });
        });
        
        window.electron.onPeerDisconnected((event, peerId) => {
          setConnections(prev => {
            const newConnections = new Map(prev);
            newConnections.delete(peerId);
            return newConnections;
          });
        });
        
        window.electron.onMessageReceived((event, message) => {
          setMessages(prev => [
            ...prev,
            {
              peerId: message.peerId,
              content: message.content,
              incoming: true,
              timestamp: new Date(),
            },
          ]);
        });
        
        window.electron.onServerStatusChanged((event, status) => {
          setServerStatus(status);
        });
      } catch (error) {
        console.error('Error initializing P2P:', error);
      }
    };
    
    if (currentAccount) {
      initializeP2P();
    }
    
    // Clean up on unmount
    return () => {
      // Remove event listeners
      window.electron.removePeerConnectedListener();
      window.electron.removePeerDisconnectedListener();
      window.electron.removeMessageReceivedListener();
      window.electron.removeServerStatusChangedListener();
    };
  }, [currentAccount]);
  
  // Update server URL when it changes
  useEffect(() => {
    if (isReady && serverUrl) {
      window.electron.setP2PServerUrl(serverUrl);
      checkServerConnection();
    }
  }, [isReady, serverUrl]);

  // Connect to a peer
  const connectToPeer = async (peerId: string): Promise<void> => {
    if (peerId === localPeerId) {
      throw new Error('Cannot connect to your own peer ID');
    }
    
    try {
      await window.electron.connectToPeer(peerId);
    } catch (error) {
      console.error('Error connecting to peer:', error);
      throw error;
    }
  };

  // Disconnect from a peer
  const disconnectFromPeer = (peerId: string): void => {
    window.electron.disconnectFromPeer(peerId);
  };

  // Send a message to a peer
  const sendMessage = async (peerId: string, content: string): Promise<void> => {
    try {
      await window.electron.sendMessageToPeer(peerId, content);
      
      // Add to local messages
      setMessages(prev => [
        ...prev,
        {
          peerId,
          content,
          incoming: false,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('Error sending message to peer:', error);
      throw error;
    }
  };

  // Check if the server is reachable
  const checkServerConnection = async (): Promise<boolean> => {
    if (!serverUrl || !isReady) {
      setServerStatus('disconnected');
      return false;
    }
    
    try {
      setServerStatus('connecting');
      const connected = await window.electron.checkP2PServerConnection();
      setServerStatus(connected ? 'connected' : 'disconnected');
      return connected;
    } catch (error) {
      console.error('Error checking server connection:', error);
      setServerStatus('disconnected');
      return false;
    }
  };

  const contextValue: P2PContextType = {
    connections,
    messages,
    connectToPeer,
    disconnectFromPeer,
    sendMessage,
    localPeerId,
    isReady,
    serverUrl,
    serverStatus,
    setServerUrl,
    checkServerConnection,
  };

  return (
    <P2PContext.Provider value={contextValue}>
      {children}
    </P2PContext.Provider>
  );
};

export const useP2P = () => {
  const context = useContext(P2PContext);
  if (!context) {
    throw new Error('useP2P must be used within a P2PProvider');
  }
  return context;
};