// src/services/realtime.service.ts
import type { ServerWebSocket } from "bun";
import type { DataService } from "./data.service";
import type { PermissionService } from "./permission.service";
import type Nano from "nano";
import { logger } from "../utils/logger";
import type { DatabaseChangesResultItem } from "nano";

// Define the shape of the context data attached to each WebSocket by our auth logic
export interface WebSocketAuthContext {
    userId: string;
}

// Define the shape of the full context data within the RealtimeService
// We add subscriptions specific to this service's management
interface WebSocketManagedContext extends WebSocketAuthContext {
    subscriptions: Set<string>; // Collections the user is subscribed to via this specific socket
}

// Define the shape of incoming WebSocket messages (client -> server)
interface WebSocketClientMessage {
    action: "subscribe" | "unsubscribe";
    collection: string;
}

// Define the shape of outgoing WebSocket messages (server -> client)
export type WebSocketServerMessage =
    | { status: "subscribed" | "unsubscribed" | "denied" | "not_subscribed"; collection: string; reason?: string }
    | { error: string }
    | { type: "update" | "delete"; collection: string; data: any }; // 'data' could be the doc or just an ID for delete

type ChangeWithDoc = Nano.DatabaseChangesResultItem & { doc?: any };
export class RealtimeService {
    private nano: Nano.ServerScope;
    private permissionService: PermissionService;
    // Map WebSocket instances to their managed context (userId, subscriptions)
    // Note: ServerWebSocket<T> uses the type T for ws.data
    private connections = new Map<ServerWebSocket<WebSocketAuthContext>, WebSocketManagedContext>();
    // Map userId to their active CouchDB change listener and reference count
    private listeners = new Map<string, { scope: Nano.ChangesReaderScope; refCount: number }>();

    constructor(dataService: DataService, permissionService: PermissionService) {
        if (!dataService.isInitialized()) {
            // Throw an error or handle gracefully if nano isn't ready
            // This prevents trying to use an uninitialized connection
            logger.error("RealtimeService initialized before DataService connection was ready.");
            throw new Error("DataService connection not ready for RealtimeService.");
        }
        this.nano = dataService.getConnection(); // Get the nano instance
        this.permissionService = permissionService;
        logger.info("RealtimeService initialized");
    }

    /**
     * Handles a new WebSocket connection *after* authentication context is attached.
     */
    handleConnection(ws: ServerWebSocket<WebSocketAuthContext>) {
        // Auth context (userId) should be attached in ws.data by Elysia's beforeHandle
        const { userId } = ws.data;
        if (!userId) {
            // This case should ideally be prevented by beforeHandle, but double-check
            logger.error("WebSocket connection opened without userId in context.");
            ws.close(1008, "Authentication context missing"); // 1008 = Policy Violation
            return;
        }

        logger.info(`WebSocket connected for user: ${userId}`);

        // Initialize managed context for this connection
        const managedContext: WebSocketManagedContext = {
            userId: userId,
            subscriptions: new Set<string>(),
        };
        this.connections.set(ws, managedContext);

        // Manage the CouchDB listener for this user's database
        this.ensureListenerStarted(userId);
    }

    /**
     * Ensures a CouchDB changes listener is running for the given user ID.
     * Increments reference count if already running.
     */
    private ensureListenerStarted(userId: string) {
        const info = this.listeners.get(userId);
        const userDbName = `userdata-${userId}`;

        if (!info) {
            logger.info(`No active listener for ${userDbName}. Starting new reader.`);
            try {
                // Obtain a document‑scope object once, then…
                const db = this.nano.db.use<any>(userDbName);

                // 🔑  ChangesReader replaces follow()
                const scope = db.changesReader; // <-- this has start/stop
                const emitter = scope.start({
                    since: "now",
                    includeDocs: true,
                    timeout: 60000,
                });

                emitter.on("change", (change: ChangeWithDoc) => this.handleChange(change, userId));

                emitter.on("error", (err: unknown) => {
                    logger.error(`ChangesReader error for ${userDbName}:`, err);
                    this.listeners.delete(userId);
                });

                this.listeners.set(userId, { scope, refCount: 1 });
                logger.info(`Started ChangesReader for ${userDbName}`);
            } catch (err: any) {
                if (err.statusCode === 404) {
                    logger.warn(`DB ${userDbName} not found. Reader not started yet.`);
                } else {
                    logger.error(`Failed to start ChangesReader for ${userDbName}:`, err);
                }
            }
        } else {
            info.refCount++;
            logger.debug(`Incremented reader refCount for ${userDbName} to ${info.refCount}`);
        }
    }

    /**
     * Handles a WebSocket disconnection.
     */
    handleDisconnection(ws: ServerWebSocket<WebSocketAuthContext>, code: number, message?: string) {
        const context = this.connections.get(ws);
        if (!context) {
            // Could happen if connection failed very early or was already cleaned up
            logger.warn(`WebSocket disconnected but no context found.`);
            return;
        }

        const userId = context.userId;
        const userDbName = `userdata-${userId}`;
        logger.info(`WebSocket disconnected for user: ${userId}. Code: ${code}, Message: ${message}`);

        this.connections.delete(ws); // Remove connection tracking

        // Manage the CouchDB listener reference count
        const listenerInfo = this.listeners.get(userId);
        if (listenerInfo) {
            listenerInfo.refCount--;
            logger.debug(`Decremented listener refCount for ${userDbName} to ${listenerInfo.refCount}`);
            if (listenerInfo.refCount <= 0) {
                logger.info(`Stopping CouchDB listener for ${userDbName} as refCount reached 0.`);
                try {
                    listenerInfo.scope.stop();
                } catch (error) {
                    logger.error(`Error stopping listener for ${userDbName}:`, error);
                }
                this.listeners.delete(userId);
            }
        } else {
            // This might happen if the listener failed to start initially
            logger.warn(`Listener info not found for user ${userId} during disconnection (may have failed to start).`);
        }
    }

    /**
     * Handles incoming messages from a WebSocket client (subscribe/unsubscribe).
     */
    async handleMessage(ws: ServerWebSocket<WebSocketAuthContext>, rawMessage: unknown) {
        const context = this.connections.get(ws);
        if (!context) {
            logger.warn(`Received message from untracked socket.`);
            this.sendJson(ws, { error: "Internal state error." });
            return;
        }

        let parsedMessage: WebSocketClientMessage;
        try {
            // Ensure message is parsed correctly, whether it's a string or already an object
            const messageContent = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;

            // Basic validation of the parsed message structure
            if (
                !messageContent ||
                typeof messageContent !== "object" ||
                !messageContent.action ||
                !messageContent.collection ||
                (messageContent.action !== "subscribe" && messageContent.action !== "unsubscribe")
            ) {
                throw new Error("Invalid message format or missing fields.");
            }
            parsedMessage = messageContent as WebSocketClientMessage;
        } catch (error: any) {
            logger.warn(`Invalid WebSocket message received from user ${context.userId}:`, rawMessage, error.message);
            this.sendJson(ws, { error: 'Invalid message format. Expecting {"action": "subscribe"|"unsubscribe", "collection": "string"}' });
            return;
        }

        const { action, collection } = parsedMessage;
        const { userId } = context; // userId from the established context

        logger.debug(`Processing action '${action}' for collection '${collection}' from user ${userId}`);

        if (action === "subscribe") {
            // **Crucial Permission Check** before subscribing
            const requiredPermission = `read:${collection}`;
            const canRead = await this.permissionService.can(userId, requiredPermission);

            if (canRead) {
                context.subscriptions.add(collection);
                // Note: No need to call this.connections.set again, context is mutable
                logger.info(`User ${userId} subscribed to collection '${collection}'`);
                this.sendJson(ws, { status: "subscribed", collection: collection });
            } else {
                logger.warn(`User ${userId} denied subscription to '${collection}' due to permissions.`);
                this.sendJson(ws, { status: "denied", collection: collection, reason: "Permission denied" });
            }
        } else if (action === "unsubscribe") {
            const removed = context.subscriptions.delete(collection);
            if (removed) {
                logger.info(`User ${userId} unsubscribed from collection '${collection}'`);
                this.sendJson(ws, { status: "unsubscribed", collection: collection });
            } else {
                // Inform client they weren't subscribed anyway
                logger.debug(`User ${userId} tried to unsubscribe from '${collection}' but was not subscribed.`);
                this.sendJson(ws, { status: "not_subscribed", collection: collection });
            }
        }
    }

    /**
     * Processes a change detected by a CouchDB listener.
     */
    private async handleChange(change: ChangeWithDoc, userId: string) {
        const docId = change.id;

        // Ignore design doc changes
        if (docId.startsWith("_design/")) {
            return;
        }

        // Handle deletions
        if (change.deleted === true) {
            // We need to know the collection *before* deletion.
            // The 'change' object for deletions doesn't include the old doc by default.
            // A robust solution might involve fetching the doc *just before* delete
            // or storing collection info separately.
            // For now, we can't easily determine the collection for deleted docs via _changes.
            // We could potentially send a generic delete event with just the ID if needed.
            logger.debug(`Deletion detected for user ${userId}, doc ID: ${docId}. Collection info unavailable in standard change feed for deletes.`);
            // Example: Push generic delete event (requires client handling)
            // this.pushToSubscribedUserConnections(userId, null, { type: 'delete', collection: null, data: { _id: docId } });
            return;
        }

        // Handle updates/creations
        const doc = change.doc;
        if (!doc) {
            logger.warn(`Change detected for user ${userId} (ID: ${docId}) but 'doc' field is missing.`);
            return; // Ignore changes without document data
        }

        // **Crucial: Identify the collection**
        // We rely on a convention: documents must have a '$collection' field.
        const collection = doc.$collection;
        if (!collection || typeof collection !== "string") {
            logger.warn(`Change detected for user ${userId} in doc ${docId} without a valid '$collection' field. Cannot route update. Document:`, doc);
            return;
        }

        logger.debug(`Change detected for user ${userId} in collection '${collection}', doc ID: ${docId}`);

        // Prepare the message payload
        const message: WebSocketServerMessage = {
            type: "update", // Could differentiate create vs update if needed based on rev history
            collection: collection,
            data: doc, // Send the full document
        };

        // Push the update to relevant connections for this user
        await this.pushToSubscribedUserConnections(userId, collection, message);
    }

    /**
     * Sends a message to all connections for a specific user IF they are subscribed
     * to the given collection AND have read permission.
     */
    private async pushToSubscribedUserConnections(userId: string, collection: string | null, message: WebSocketServerMessage) {
        // **Crucial Permission Check** before pushing data
        // If collection is null (e.g., generic delete), we might skip permission check or apply a default policy
        if (collection) {
            const requiredPermission = `read:${collection}`;
            const canRead = await this.permissionService.can(userId, requiredPermission);
            if (!canRead) {
                logger.warn(`User ${userId} change detected for collection '${collection}', but user lacks read permission. Update NOT pushed.`);
                return; // Do not push if permission is missing
            }
        } else {
            // Handle cases without a specific collection (e.g., generic delete)
            // Decide if these should be pushed or if a different permission applies
            logger.debug(`Pushing event without specific collection for user ${userId}. Skipping collection-specific permission check.`);
        }

        for (const [ws, context] of this.connections.entries()) {
            if (context.userId === userId) {
                // Check if this specific connection is subscribed (if collection is known)
                if (collection === null || context.subscriptions.has(collection)) {
                    logger.info(
                        `Pushing update for collection '${collection ?? "N/A"}' (doc: ${
                            "type" in message && message.type === "update" ? message.data._id : "N/A"
                        }) to user ${userId}`
                    );
                    this.sendJson(ws, message);
                }
            }
        }
    }

    /**
     * Helper to safely send JSON over WebSocket.
     */
    private sendJson(ws: ServerWebSocket<any>, data: WebSocketServerMessage | { error: string }) {
        try {
            ws.send(JSON.stringify(data));
        } catch (error) {
            logger.error(`Failed to send JSON message to socket:`, error);
            // Optionally close the socket if sending fails
            // ws.close(1011, "Internal server error during send");
        }
    }
}
