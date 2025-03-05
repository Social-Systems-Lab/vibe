import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import logger from '../utils/logger';
import turnService from './turn-server';

dotenv.config();

const ROOM_TIMEOUT = parseInt(process.env.SIGNAL_ROOM_TIMEOUT || '3600000'); // Default 1 hour
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.MAX_CONNECTIONS_PER_IP || '50');

// Types for our signaling protocol
interface PeerInfo {
    peerId: string;
    userId: string;
    deviceId: string;
    roomId: string;
    joinedAt: Date;
    socket: Socket;
}

// Room metadata
interface Room {
    roomId: string;
    createdAt: Date;
    peers: Map<string, PeerInfo>;
    creatorId?: string;
    isPrivate: boolean;
    metadata?: Record<string, any>;
}

class SignalingServer {
    private io: Server | null = null;
    private rooms: Map<string, Room> = new Map();
    private peers: Map<string, PeerInfo> = new Map();
    private ipConnectionCounter: Map<string, number> = new Map();
    
    constructor() {
        // Periodically clean up inactive rooms
        setInterval(() => this.cleanupRooms(), ROOM_TIMEOUT / 2);
    }

    /**
     * Initialize the signaling server with an HTTP server
     */
    initialize(httpServer: HttpServer): void {
        this.io = new Server(httpServer, {
            cors: {
                origin: '*', // In production, restrict this to trusted domains
                methods: ['GET', 'POST']
            }
        });

        this.io.on('connection', this.handleConnection.bind(this));
        logger.info('Signaling server initialized');
    }

    /**
     * Handle a new socket connection
     */
    private handleConnection(socket: Socket): void {
        const ip = socket.handshake.address;
        
        // Implement basic rate limiting
        const currentConnections = (this.ipConnectionCounter.get(ip) || 0) + 1;
        this.ipConnectionCounter.set(ip, currentConnections);
        
        if (currentConnections > MAX_CONNECTIONS_PER_IP) {
            logger.warn(`Too many connections from IP: ${ip}`);
            socket.disconnect(true);
            return;
        }

        logger.debug(`New socket connection from ${ip}, socket ID: ${socket.id}`);

        // Handle authentication - we'll expect an auth event with user credentials
        socket.on('authenticate', (data, callback) => {
            // In a real implementation, verify the user's identity here
            // For now, we'll just accept any authentication
            const userId = data.userId || uuidv4();
            const deviceId = data.deviceId || 'unknown-device';
            
            logger.info(`User authenticated: ${userId}, device: ${deviceId}`);
            
            if (typeof callback === 'function') {
                callback({ success: true, userId });
            }
        });

        // Handle room creation and joining
        socket.on('join-room', (data, callback) => {
            try {
                const { roomId = uuidv4(), userId, deviceId, isPrivate = false, metadata = {} } = data;
                
                if (!userId) {
                    throw new Error('User ID is required to join a room');
                }
                
                // Create or get the room
                let room = this.rooms.get(roomId);
                if (!room) {
                    room = {
                        roomId,
                        createdAt: new Date(),
                        peers: new Map(),
                        creatorId: userId,
                        isPrivate,
                        metadata
                    };
                    this.rooms.set(roomId, room);
                    logger.info(`Room created: ${roomId} by user ${userId}`);
                }

                // Create a peer ID for this connection
                const peerId = uuidv4();
                
                // Store peer information
                const peerInfo: PeerInfo = {
                    peerId,
                    userId,
                    deviceId: deviceId || 'unknown',
                    roomId,
                    joinedAt: new Date(),
                    socket
                };
                
                this.peers.set(peerId, peerInfo);
                room.peers.set(peerId, peerInfo);
                
                // Join the socket to the room
                socket.join(roomId);
                
                // Notify existing peers about the new peer
                socket.to(roomId).emit('peer-joined', {
                    peerId,
                    userId,
                    deviceId: peerInfo.deviceId
                });
                
                // Send the new peer information about existing peers
                const existingPeers = Array.from(room.peers.values())
                    .filter(p => p.peerId !== peerId)
                    .map(p => ({
                        peerId: p.peerId,
                        userId: p.userId,
                        deviceId: p.deviceId
                    }));
                
                // Generate TURN credentials for this peer
                const turnCredentials = turnService.generateCredentials(userId);
                
                logger.info(`Peer ${peerId} (user: ${userId}) joined room ${roomId}`);
                
                if (typeof callback === 'function') {
                    callback({
                        success: true,
                        roomId,
                        peerId,
                        existingPeers,
                        turnCredentials
                    });
                }
                
                // Set up other signaling events for this peer
                this.setupPeerEvents(socket, peerId);
            } catch (err) {
                logger.error('Error joining room', { error: err });
                if (typeof callback === 'function') {
                    callback({ success: false, error: (err as Error).message });
                }
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            // Decrement connection counter for this IP
            const currentConnections = (this.ipConnectionCounter.get(ip) || 1) - 1;
            if (currentConnections <= 0) {
                this.ipConnectionCounter.delete(ip);
            } else {
                this.ipConnectionCounter.set(ip, currentConnections);
            }
            
            logger.debug(`Socket disconnected: ${socket.id}`);
        });
    }

    /**
     * Set up WebRTC signaling events for a peer
     */
    private setupPeerEvents(socket: Socket, peerId: string): void {
        const peerInfo = this.peers.get(peerId);
        if (!peerInfo) {
            logger.error(`Cannot setup events for unknown peer: ${peerId}`);
            return;
        }
        
        // Handle SDP offer/answer exchange
        socket.on('signal', (data) => {
            const { target, signal, type } = data;
            
            // Get the target peer's socket
            const targetPeer = this.peers.get(target);
            if (!targetPeer) {
                logger.warn(`Signal sent to unknown peer: ${target}`);
                return;
            }
            
            // Forward the signal to the target peer
            targetPeer.socket.emit('signal', {
                peerId,
                signal,
                type
            });
            
            logger.debug(`Signal (${type}) forwarded from ${peerId} to ${target}`);
        });

        // Handle peer leaving
        socket.on('leave-room', () => {
            this.handlePeerLeaving(peerId);
        });
    }

    /**
     * Handle a peer leaving a room
     */
    private handlePeerLeaving(peerId: string): void {
        const peerInfo = this.peers.get(peerId);
        if (!peerInfo) {
            return;
        }
        
        const { roomId, userId } = peerInfo;
        const room = this.rooms.get(roomId);
        
        if (room) {
            // Remove the peer from the room
            room.peers.delete(peerId);
            
            // Notify other peers about this peer leaving
            peerInfo.socket.to(roomId).emit('peer-left', { peerId, userId });
            
            // If room is empty, schedule it for removal
            if (room.peers.size === 0) {
                logger.info(`Room ${roomId} is now empty, will be removed after timeout`);
            }
            
            logger.info(`Peer ${peerId} (user: ${userId}) left room ${roomId}`);
        }
        
        // Remove the peer from our global map
        this.peers.delete(peerId);
    }

    /**
     * Clean up inactive rooms
     */
    private cleanupRooms(): void {
        const now = new Date();
        let roomsRemoved = 0;
        
        this.rooms.forEach((room, roomId) => {
            // Remove rooms that are empty and older than the timeout
            if (room.peers.size === 0) {
                const roomAge = now.getTime() - room.createdAt.getTime();
                if (roomAge > ROOM_TIMEOUT) {
                    this.rooms.delete(roomId);
                    roomsRemoved++;
                }
            }
        });
        
        if (roomsRemoved > 0) {
            logger.info(`Cleaned up ${roomsRemoved} inactive rooms`);
        }
    }

    /**
     * Get statistics about active rooms and connections
     */
    getStats(): {
        roomCount: number;
        peerCount: number;
        ipConnectionCount: number;
    } {
        return {
            roomCount: this.rooms.size,
            peerCount: this.peers.size,
            ipConnectionCount: this.ipConnectionCounter.size
        };
    }
}

export const signalingServer = new SignalingServer();
export default signalingServer;