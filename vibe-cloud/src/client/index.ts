import { io, Socket } from 'socket.io-client';

interface TurnCredentials {
    username: string;
    credential: string;
    ttl: number;
    urls: string[];
}

interface Peer {
    peerId: string;
    userId: string;
    deviceId: string;
}

interface SignalData {
    peerId: string;
    signal: any;
    type: string;
}

interface ConnectionOptions {
    serverUrl: string;
    userId: string;
    deviceId: string;
    autoReconnect?: boolean;
}

/**
 * VibeCloudClient provides a client for connecting to the vibe-cloud signaling server
 * and establishing WebRTC connections with peers.
 */
export class VibeCloudClient {
    private socket: Socket | null = null;
    private peerId: string | null = null;
    private roomId: string | null = null;
    private serverUrl: string;
    private userId: string;
    private deviceId: string;
    private turnCredentials: TurnCredentials | null = null;
    private autoReconnect: boolean;
    private peers: Map<string, Peer> = new Map();
    
    // Event listeners
    private connectionListeners: Array<(connected: boolean) => void> = [];
    private peerJoinListeners: Array<(peer: Peer) => void> = [];
    private peerLeaveListeners: Array<(peerId: string) => void> = [];
    private signalListeners: Array<(data: SignalData) => void> = [];
    
    /**
     * Create a new VibeCloudClient
     */
    constructor(options: ConnectionOptions) {
        this.serverUrl = options.serverUrl;
        this.userId = options.userId;
        this.deviceId = options.deviceId;
        this.autoReconnect = options.autoReconnect ?? true;
    }

    /**
     * Connect to the signaling server
     */
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.socket = io(this.serverUrl, {
                    transports: ['websocket'],
                    reconnection: this.autoReconnect,
                    query: {
                        userId: this.userId,
                        deviceId: this.deviceId
                    }
                });
                
                this.socket.on('connect', () => {
                    console.log('Connected to signaling server');
                    this.notifyConnectionListeners(true);
                    
                    // Authenticate with the server
                    this.socket!.emit('authenticate', {
                        userId: this.userId,
                        deviceId: this.deviceId
                    }, (response: any) => {
                        if (response.success) {
                            console.log('Authenticated with server');
                            resolve();
                        } else {
                            console.error('Authentication failed:', response.error);
                            reject(new Error(response.error || 'Authentication failed'));
                        }
                    });
                });
                
                this.socket.on('disconnect', () => {
                    console.log('Disconnected from signaling server');
                    this.notifyConnectionListeners(false);
                });
                
                this.socket.on('error', (error: Error) => {
                    console.error('Socket error:', error);
                    reject(error);
                });
                
                this.socket.on('connect_error', (error: Error) => {
                    console.error('Connection error:', error);
                    reject(error);
                });
                
                // Set up signaling event handlers
                this.setupSignalHandlers();
            } catch (err) {
                console.error('Error connecting to signaling server:', err);
                reject(err);
            }
        });
    }

    /**
     * Join a room on the signaling server
     */
    joinRoom(roomId?: string): Promise<{
        roomId: string;
        peerId: string;
        peers: Peer[];
        turnCredentials: TurnCredentials;
    }> {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.socket.connected) {
                reject(new Error('Not connected to signaling server'));
                return;
            }
            
            this.socket.emit('join-room', {
                roomId,
                userId: this.userId,
                deviceId: this.deviceId
            }, (response: any) => {
                if (response.success) {
                    this.roomId = response.roomId;
                    this.peerId = response.peerId;
                    this.turnCredentials = response.turnCredentials;
                    
                    // Store the existing peers
                    this.peers.clear();
                    response.existingPeers.forEach((peer: Peer) => {
                        this.peers.set(peer.peerId, peer);
                    });
                    
                    console.log(`Joined room: ${this.roomId} as peer: ${this.peerId}`);
                    
                    // Make sure these values are not null for TypeScript
                    if (!this.roomId || !this.peerId || !this.turnCredentials) {
                        reject(new Error('Server returned incomplete data'));
                        return;
                    }
                    
                    resolve({
                        roomId: this.roomId,
                        peerId: this.peerId,
                        peers: response.existingPeers, 
                        turnCredentials: this.turnCredentials
                    });
                } else {
                    console.error('Failed to join room:', response.error);
                    reject(new Error(response.error || 'Failed to join room'));
                }
            });
        });
    }

    /**
     * Leave the current room
     */
    leaveRoom(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.roomId) {
                resolve();
                return;
            }
            
            this.socket.emit('leave-room', { roomId: this.roomId }, (response: any) => {
                this.roomId = null;
                this.peerId = null;
                this.peers.clear();
                resolve();
            });
        });
    }

    /**
     * Send a signal to a specific peer
     */
    signal(targetPeerId: string, signal: any, type: string): void {
        if (!this.socket || !this.peerId) {
            console.error('Cannot signal: not connected or not in a room');
            return;
        }
        
        this.socket.emit('signal', {
            target: targetPeerId,
            signal,
            type
        });
    }

    /**
     * Get WebRTC configuration with TURN servers
     */
    getWebRTCConfig(): RTCConfiguration {
        const config: RTCConfiguration = {
            iceServers: []
        };
        
        // Add TURN server if we have credentials
        if (this.turnCredentials) {
            config.iceServers = this.turnCredentials.urls.map(url => ({
                urls: url,
                username: this.turnCredentials!.username,
                credential: this.turnCredentials!.credential
            }));
            
            // Add Google's public STUN servers as fallback
            config.iceServers.push({
                urls: 'stun:stun.l.google.com:19302'
            });
        } else {
            // Just use Google's STUN server if no TURN credentials
            config.iceServers = [{
                urls: 'stun:stun.l.google.com:19302'
            }];
        }
        
        return config;
    }

    /**
     * Refresh TURN credentials (they are time-limited)
     */
    async refreshTurnCredentials(): Promise<TurnCredentials> {
        try {
            const response = await fetch(`${this.serverUrl}/api/turn/credentials`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.userId
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            const credentials: TurnCredentials = await response.json();
            this.turnCredentials = credentials;
            return credentials;
        } catch (err) {
            console.error('Error refreshing TURN credentials:', err);
            throw err;
        }
    }

    /**
     * Disconnect from the signaling server
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.roomId = null;
        this.peerId = null;
        this.peers.clear();
    }

    /**
     * Set up signal handlers for the socket.io connection
     */
    private setupSignalHandlers(): void {
        if (!this.socket) return;
        
        // Handle peer joining the room
        this.socket.on('peer-joined', (peer: Peer) => {
            console.log(`Peer joined: ${peer.peerId} (${peer.userId})`);
            this.peers.set(peer.peerId, peer);
            this.notifyPeerJoinListeners(peer);
        });
        
        // Handle peer leaving the room
        this.socket.on('peer-left', (data: { peerId: string, userId: string }) => {
            console.log(`Peer left: ${data.peerId} (${data.userId})`);
            this.peers.delete(data.peerId);
            this.notifyPeerLeaveListeners(data.peerId);
        });
        
        // Handle incoming signals (SDP offers/answers, ICE candidates)
        this.socket.on('signal', (data: SignalData) => {
            this.notifySignalListeners(data);
        });
    }

    // Event listener methods
    
    /**
     * Add a listener for connection state changes
     */
    onConnectionStateChanged(listener: (connected: boolean) => void): () => void {
        this.connectionListeners.push(listener);
        return () => {
            this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
        };
    }
    
    /**
     * Add a listener for when a peer joins the room
     */
    onPeerJoined(listener: (peer: Peer) => void): () => void {
        this.peerJoinListeners.push(listener);
        return () => {
            this.peerJoinListeners = this.peerJoinListeners.filter(l => l !== listener);
        };
    }
    
    /**
     * Add a listener for when a peer leaves the room
     */
    onPeerLeft(listener: (peerId: string) => void): () => void {
        this.peerLeaveListeners.push(listener);
        return () => {
            this.peerLeaveListeners = this.peerLeaveListeners.filter(l => l !== listener);
        };
    }
    
    /**
     * Add a listener for when a signal is received
     */
    onSignal(listener: (data: SignalData) => void): () => void {
        this.signalListeners.push(listener);
        return () => {
            this.signalListeners = this.signalListeners.filter(l => l !== listener);
        };
    }
    
    // Helper methods for notifying listeners
    
    private notifyConnectionListeners(connected: boolean): void {
        this.connectionListeners.forEach(listener => listener(connected));
    }
    
    private notifyPeerJoinListeners(peer: Peer): void {
        this.peerJoinListeners.forEach(listener => listener(peer));
    }
    
    private notifyPeerLeaveListeners(peerId: string): void {
        this.peerLeaveListeners.forEach(listener => listener(peerId));
    }
    
    private notifySignalListeners(data: SignalData): void {
        this.signalListeners.forEach(listener => listener(data));
    }
}

export default VibeCloudClient;