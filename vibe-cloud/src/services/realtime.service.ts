import type { ServerWebSocket } from "bun";
import type { DataService } from "./data.service";
import type { PermissionService } from "./permission.service";
import type { User } from "./auth.service"; // Assuming User type is exported
import type Nano from "nano";
import { logger } from "../utils/logger";

// Define the shape of the context data we'll attach to each WebSocket
export interface WebSocketContextData {
    user: User; // Store the authenticated user
    subscriptions: Set<string>; // Collections the user is subscribed to via this specific socket
}

// Define the shape of incoming WebSocket messages
interface WebSocketMessage {
    action: "subscribe" | "unsubscribe";
    collection: string;
}

export class RealtimeService {
    private nano: Nano.ServerScope;
    private permissionService: PermissionService;
    // Map WebSocket instances to their context data (user, subscriptions)
    private connections = new Map<ServerWebSocket<WebSocketContextData>, WebSocketContextData>();
    // Map userId to their active CouchDB change listener and reference count
    private listeners = new Map<string, { listener: Nano.FollowEmitter; refCount: number }>();

    constructor(dataService: DataService, permissionService: PermissionService) {
        this.nano = dataService.getConnection(); // Get the nano instance
        this.permissionService = permissionService;
        logger.info("RealtimeService initialized");
    }

    /**
     * Handles a new WebSocket connection after authentication.
     */
    handleConnection(ws: ServerWebSocket<WebSocketContextData>) {
        const user = ws.data.user; // User should be attached by JWT middleware
        if (!user || !user.id) {
            logger.error("WebSocket connection attempt without authenticated user.");
            ws.close(1008, "Authentication required"); // 1008 = Policy Violation
            return;
        }

        const userId = user.id;
        logger.info(`WebSocket connected for user: ${userId}, socket ID: ${ws.id}`);

        // Initialize context data for this connection
        ws.data.subscriptions = new Set<string>();
        this.connections.set(ws, ws.data);

        // Manage the CouchDB listener for this user's database
        const listenerInfo = this.listeners.get(userId);
        const userDbName = `userdata_${userId}`;

        if (!listenerInfo) {
            logger.info(`No active listener for ${userDbName}. Starting new listener.`);
            try {
                const follower = this.nano.db.follow(userDbName, {
                    include_docs: true,
                    since: "now",
                    feed: "continuous",
                    heartbeat: 10000, // Keep connection alive
                });

                follower.on("change", (change: Nano.FollowResponseChange<any>) => {
                    this.handleChange(change, userId);
                });

                follower.on("error", (err: any) => {
                    logger.error(`Error in CouchDB follower for ${userDbName}:`, err);
                    // Attempt to restart listener? Or rely on new connections to restart?
                    // For now, just log. Consider removing the listener entry if error is fatal.
                    this.listeners.delete(userId); // Remove potentially broken listener
                });

                follower.follow(); // Start listening
                logger.info(`Started CouchDB listener for ${userDbName}`);
                this.listeners.set(userId, { listener: follower, refCount: 1 });
            } catch (error: any) {
                // This might happen if the database doesn't exist yet for a new user
                // It should be created on first write via data.service
                if (error.statusCode === 404) {
                    logger.warn(`Database ${userDbName} not found. Listener will not start yet.`);
                    // Don't store a listener entry if it failed to start
                } else {
                    logger.error(`Failed to start CouchDB listener for ${userDbName}:`, error);
                }
                // We don't store a listener entry if it failed to start
            }
        } else {
            listenerInfo.refCount++;
            logger.debug(`Incremented listener refCount for ${userDbName} to ${listenerInfo.refCount}`);
        }
    }

    /**
     * Handles a WebSocket disconnection.
     */
    handleDisconnection(ws: ServerWebSocket<WebSocketContextData>, code: number, message?: string) {
        const context = this.connections.get(ws);
        if (!context || !context.user) {
            logger.warn(`WebSocket disconnected without context or user. Socket ID: ${ws.id}`);
            return; // Should not happen if handleConnection worked
        }

        const userId = context.user.id;
        const userDbName = `userdata_${userId}`;
        logger.info(`WebSocket disconnected for user: ${userId}, socket ID: ${ws.id}. Code: ${code}, Message: ${message}`);

        this.connections.delete(ws); // Remove connection tracking

        // Manage the CouchDB listener reference count
        const listenerInfo = this.listeners.get(userId);
        if (listenerInfo) {
            listenerInfo.refCount--;
            logger.debug(`Decremented listener refCount for ${userDbName} to ${listenerInfo.refCount}`);
            if (listenerInfo.refCount <= 0) {
                logger.info(`Stopping CouchDB listener for ${userDbName} as refCount reached 0.`);
                try {
                    listenerInfo.listener.stop();
                } catch (error) {
                    logger.error(`Error stopping listener for ${userDbName}:`, error);
                }
                this.listeners.delete(userId);
            }
        } else {
            logger.warn(`Listener info not found for user ${userId} during disconnection.`);
        }
    }

    /**
     * Handles incoming messages from a WebSocket client (subscribe/unsubscribe).
     */
    async handleMessage(ws: ServerWebSocket<WebSocketContextData>, message: any) {
        const context = this.connections.get(ws);
        if (!context || !context.user) {
            logger.warn(`Received message from untracked/unauthenticated socket: ${ws.id}`);
            ws.send(JSON.stringify({ error: "Invalid state or not authenticated." }));
            return;
        }

        let parsedMessage: WebSocketMessage;
        try {
            parsedMessage = typeof message === "string" ? JSON.parse(message) : message;
            if (!parsedMessage.action || !parsedMessage.collection || (parsedMessage.action !== "subscribe" && parsedMessage.action !== "unsubscribe")) {
                throw new Error("Invalid message format.");
            }
        } catch (error) {
            logger.warn(`Invalid WebSocket message received from user ${context.user.id}:`, message, error);
            ws.send(JSON.stringify({ error: 'Invalid message format. Expecting {"action": "subscribe"|"unsubscribe", "collection": "string"}' }));
            return;
        }

        const { action, collection } = parsedMessage;
        const userId = context.user.id;

        logger.debug(`Processing action '${action}' for collection '${collection}' from user ${userId}`);

        if (action === "subscribe") {
            // Check permission *before* subscribing
            const canRead = await this.permissionService.can(userId, `read:${collection}`);
            if (canRead) {
                context.subscriptions.add(collection);
                this.connections.set(ws, context); // Update map with new subscriptions
                logger.info(`User ${userId} subscribed to collection '${collection}'`);
                ws.send(JSON.stringify({ status: "subscribed", collection: collection }));
            } else {
                logger.warn(`User ${userId} denied subscription to '${collection}' due to permissions.`);
                ws.send(JSON.stringify({ status: "denied", collection: collection, reason: "Permission denied" }));
            }
        } else if (action === "unsubscribe") {
            const removed = context.subscriptions.delete(collection);
            this.connections.set(ws, context); // Update map
            if (removed) {
                logger.info(`User ${userId} unsubscribed from collection '${collection}'`);
                ws.send(JSON.stringify({ status: "unsubscribed", collection: collection }));
            } else {
                logger.warn(`User ${userId} tried to unsubscribe from '${collection}' but was not subscribed.`);
                ws.send(JSON.stringify({ status: "not_subscribed", collection: collection }));
            }
        }
    }

    /**
     * Processes a change detected by a CouchDB listener.
     */
    private handleChange(change: Nano.FollowResponseChange<any>, userId: string) {
        // Basic check for deleted documents or design docs
        if (change.deleted || !change.doc || change.id.startsWith("_design/")) {
            // logger.debug(`Ignoring change for user ${userId}: deleted=${change.deleted}, no doc=${!change.doc}, id=${change.id}`);
            // We might want to push deletion events later
            return;
        }

        const doc = change.doc;
        const collection = doc.$collection; // Use the $collection field

        if (!collection || typeof collection !== "string") {
            logger.warn(`Change detected for user ${userId} in doc ${change.id} without a valid '$collection' field. Ignoring.`);
            return;
        }

        logger.debug(`Change detected for user ${userId} in collection '${collection}', doc ID: ${change.id}`);

        // Find all connections for this specific user
        for (const [ws, context] of this.connections.entries()) {
            if (context.user.id === userId) {
                // Check if this specific connection is subscribed to the changed collection
                if (context.subscriptions.has(collection)) {
                    // Permission check should have happened at subscription time,
                    // but a belt-and-suspenders check here *could* be added if permissions
                    // could change rapidly *after* subscription. For now, trust subscription check.
                    logger.info(`Pushing update for collection '${collection}' (doc: ${change.id}) to user ${userId}, socket ID: ${ws.id}`);
                    try {
                        // Send the full document as requested
                        ws.send(JSON.stringify({ type: "update", collection: collection, data: doc }));
                    } catch (error) {
                        logger.error(`Failed to send update to socket ${ws.id} for user ${userId}:`, error);
                        // Consider closing the socket if sending fails repeatedly
                    }
                }
            }
        }
    }

    // Optional: Method to broadcast to all connections of a specific user (if needed later)
    // broadcastToUser(userId: string, message: any) { ... }

    // Optional: Method to broadcast to all connections subscribed to a collection (if needed later, requires permission check)
    // broadcastToCollection(collection: string, message: any) { ... }
}
