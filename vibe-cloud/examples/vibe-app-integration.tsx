/**
 * Example integration of vibe-cloud with the vibe-app
 * 
 * This shows how to create a P2P context provider that uses vibe-cloud
 * for signaling and TURN services.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { VibeCloudClient, WebRTCPeer } from '../src/client';

// Define types
interface P2PContextProps {
    // Connection state
    isConnected: boolean;
    serverUrl: string;
    setServerUrl: (url: string) => void;
    
    // Peer management
    availablePeers: Peer[];
    connectedPeers: Peer[];
    
    // Actions
    connectToPeer: (peerId: string) => Promise<void>;
    disconnectFromPeer: (peerId: string) => void;
    sendMessage: (peerId: string, message: any) => boolean;
    
    // Events
    onMessage: (callback: (peerId: string, data: any) => void) => () => void;
}

interface Peer {
    peerId: string;
    userId: string;
    deviceId: string;
    isConnected: boolean;
}

interface P2PProviderProps {
    userId: string;
    deviceId: string;
    defaultServerUrl?: string;
    children: React.ReactNode;
}

// Create context
const P2PContext = createContext<P2PContextProps | undefined>(undefined);

// Create provider component
export const P2PProvider: React.FC<P2PProviderProps> = ({ 
    children, 
    userId,
    deviceId,
    defaultServerUrl = 'https://vibe-cloud.example.com'
}) => {
    // State
    const [client, setClient] = useState<VibeCloudClient | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [serverUrl, setServerUrl] = useState(defaultServerUrl);
    const [availablePeers, setAvailablePeers] = useState<Peer[]>([]);
    const [connectedPeers, setConnectedPeers] = useState<Peer[]>([]);
    
    // Store connections
    const [connections, setConnections] = useState<Map<string, WebRTCPeer>>(new Map());
    
    // Message listeners
    const [messageListeners, setMessageListeners] = useState<Set<(peerId: string, data: any) => void>>(new Set());
    
    // Initialize the client
    useEffect(() => {
        const newClient = new VibeCloudClient({
            serverUrl,
            userId,
            deviceId,
            autoReconnect: true
        });
        
        setClient(newClient);
        
        // Connect to server and join a room
        const connectAndJoin = async () => {
            try {
                await newClient.connect();
                setIsConnected(true);
                
                // Join a room - in a real app, this might be based on user's group, etc.
                const { peers } = await newClient.joinRoom();
                
                // Update available peers
                setAvailablePeers(peers.map(peer => ({
                    ...peer,
                    isConnected: false
                })));
            } catch (err) {
                console.error('Failed to connect to P2P server:', err);
                setIsConnected(false);
            }
        };
        
        connectAndJoin();
        
        // Set up event listeners
        const onConnectionState = (connected: boolean) => {
            setIsConnected(connected);
        };
        
        const onPeerJoined = (peer: { peerId: string; userId: string; deviceId: string }) => {
            setAvailablePeers(prev => [
                ...prev.filter(p => p.peerId !== peer.peerId),
                { ...peer, isConnected: false }
            ]);
        };
        
        const onPeerLeft = (peerId: string) => {
            setAvailablePeers(prev => prev.filter(p => p.peerId !== peerId));
            setConnectedPeers(prev => prev.filter(p => p.peerId !== peerId));
            
            // Close and remove the connection
            const connection = connections.get(peerId);
            if (connection) {
                connection.close();
                connections.delete(peerId);
                setConnections(new Map(connections));
            }
        };
        
        const onSignal = (data: { peerId: string; signal: any; type: string }) => {
            const connection = connections.get(data.peerId);
            if (connection) {
                connection.handleSignal(data.signal, data.type);
            }
        };
        
        // Register listeners
        const removeConnectionListener = newClient.onConnectionStateChanged(onConnectionState);
        const removePeerJoinListener = newClient.onPeerJoined(onPeerJoined);
        const removePeerLeftListener = newClient.onPeerLeft(onPeerLeft);
        const removeSignalListener = newClient.onSignal(onSignal);
        
        // Cleanup
        return () => {
            removeConnectionListener();
            removePeerJoinListener();
            removePeerLeftListener();
            removeSignalListener();
            
            // Close all connections
            connections.forEach(connection => connection.close());
            
            // Disconnect from server
            newClient.disconnect();
        };
    }, [userId, deviceId, serverUrl]);
    
    // Function to connect to a peer
    const connectToPeer = useCallback(async (peerId: string) => {
        if (!client) return;
        
        // Find the peer
        const peer = availablePeers.find(p => p.peerId === peerId);
        if (!peer) {
            throw new Error(`Peer ${peerId} not found`);
        }
        
        // Check if already connected
        if (connections.has(peerId)) {
            return;
        }
        
        // Create a new connection
        const connection = new WebRTCPeer(peerId, client.getWebRTCConfig(), true);
        
        // Set up event handlers
        connection.onConnected(() => {
            setConnectedPeers(prev => [
                ...prev.filter(p => p.peerId !== peerId),
                { ...peer, isConnected: true }
            ]);
            
            setAvailablePeers(prev => 
                prev.map(p => p.peerId === peerId ? { ...p, isConnected: true } : p)
            );
        });
        
        connection.onDisconnected(() => {
            setConnectedPeers(prev => prev.filter(p => p.peerId !== peerId));
            setAvailablePeers(prev => 
                prev.map(p => p.peerId === peerId ? { ...p, isConnected: false } : p)
            );
            
            // Remove the connection
            connections.delete(peerId);
            setConnections(new Map(connections));
        });
        
        connection.onData((data) => {
            // Notify all listeners
            messageListeners.forEach(listener => {
                listener(peerId, data);
            });
        });
        
        connection.onSignal((signal, type) => {
            client.signal(peerId, signal, type);
        });
        
        // Store the connection
        connections.set(peerId, connection);
        setConnections(new Map(connections));
        
        // Start the connection process
        connection.connect();
    }, [client, availablePeers, connections, messageListeners]);
    
    // Function to disconnect from a peer
    const disconnectFromPeer = useCallback((peerId: string) => {
        const connection = connections.get(peerId);
        if (connection) {
            connection.close();
            connections.delete(peerId);
            setConnections(new Map(connections));
            
            setConnectedPeers(prev => prev.filter(p => p.peerId !== peerId));
            setAvailablePeers(prev => 
                prev.map(p => p.peerId === peerId ? { ...p, isConnected: false } : p)
            );
        }
    }, [connections]);
    
    // Function to send a message to a peer
    const sendMessage = useCallback((peerId: string, message: any): boolean => {
        const connection = connections.get(peerId);
        if (connection && connection.isActive()) {
            return connection.sendData(message);
        }
        return false;
    }, [connections]);
    
    // Function to register a message listener
    const onMessage = useCallback((callback: (peerId: string, data: any) => void) => {
        messageListeners.add(callback);
        setMessageListeners(new Set(messageListeners));
        
        // Return a function to remove the listener
        return () => {
            messageListeners.delete(callback);
            setMessageListeners(new Set(messageListeners));
        };
    }, [messageListeners]);
    
    // Create context value
    const contextValue: P2PContextProps = {
        isConnected,
        serverUrl,
        setServerUrl,
        availablePeers,
        connectedPeers,
        connectToPeer,
        disconnectFromPeer,
        sendMessage,
        onMessage
    };
    
    return (
        <P2PContext.Provider value={contextValue}>
            {children}
        </P2PContext.Provider>
    );
};

// Custom hook to use the P2P context
export const useP2P = () => {
    const context = useContext(P2PContext);
    if (context === undefined) {
        throw new Error('useP2P must be used within a P2PProvider');
    }
    return context;
};

/**
 * Example usage in a component:
 * 
 * import { useP2P } from './p2p-context';
 * 
 * const ChatComponent = () => {
 *   const { 
 *     availablePeers,
 *     connectedPeers,
 *     connectToPeer,
 *     sendMessage,
 *     onMessage
 *   } = useP2P();
 *   
 *   const [messages, setMessages] = useState([]);
 *   
 *   useEffect(() => {
 *     // Listen for incoming messages
 *     const cleanup = onMessage((peerId, data) => {
 *       setMessages(prev => [...prev, { peerId, data }]);
 *     });
 *     
 *     return cleanup;
 *   }, [onMessage]);
 *   
 *   const handleSendMessage = (peerId, text) => {
 *     sendMessage(peerId, { type: 'chat', text });
 *   };
 *   
 *   return (
 *     <div>
 *       <h2>Available Peers</h2>
 *       {availablePeers.map(peer => (
 *         <div key={peer.peerId}>
 *           {peer.userId} - {peer.isConnected ? 'Connected' : 'Not Connected'}
 *           {!peer.isConnected && (
 *             <button onClick={() => connectToPeer(peer.peerId)}>Connect</button>
 *           )}
 *         </div>
 *       ))}
 *       
 *       <h2>Messages</h2>
 *       {messages.map((msg, i) => (
 *         <div key={i}>
 *           {msg.peerId}: {msg.data.text}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * };
 */