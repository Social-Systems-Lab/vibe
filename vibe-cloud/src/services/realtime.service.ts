// src/services/realtime.service.ts
import type { ServerWebSocket } from "bun";
import type { DataService } from "./data.service";
import type { PermissionService } from "./permission.service";
import type Nano from "nano";
import { logger } from "../utils/logger";
import type { DatabaseChangesResultItem } from "nano";
import type { ChangeWithDoc, WebSocketAuthContext, WebSocketClientMessage, WebSocketManagedContext, WebSocketServerMessage } from "../models/models";
import { USER_DB_PREFIX } from "../utils/constants";

export class RealtimeService {
    private nano: Nano.ServerScope;
    private permissionService: PermissionService;
    private connections = new Map<ServerWebSocket<WebSocketAuthContext>, WebSocketManagedContext>();
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
        // Auth context (userDid) should be attached in ws.data by Elysia's beforeHandle
        const { userDid } = ws.data;
        if (!userDid) {
            // This case should ideally be prevented by beforeHandle, but double-check
            logger.error("WebSocket connection opened without userDid in context.");
            ws.close(1008, "Authentication context missing"); // 1008 = Policy Violation
            return;
        }

        logger.info(`WebSocket connected for user: ${userDid}`);

        // Initialize managed context for this connection
        const managedContext: WebSocketManagedContext = {
            userDid: userDid,
            subscriptions: new Set<string>(),
        };
        this.connections.set(ws, managedContext);
        this.ensureListenerStarted(userDid);
    }

    /**
     * Ensures a CouchDB changes listener is running for the given user ID.
     * Increments reference count if already running.
     */
    private ensureListenerStarted(userDid: string) {
        const info = this.listeners.get(userDid);
        const userDbName = `${USER_DB_PREFIX}${userDid}`;

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

                emitter.on("change", (change: ChangeWithDoc) => this.handleChange(change, userDid));

                emitter.on("error", (err: unknown) => {
                    logger.error(`ChangesReader error for ${userDbName}:`, err);
                    this.listeners.delete(userDid);
                });

                this.listeners.set(userDid, { scope, refCount: 1 });
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

        const userDid = context.userDid;
        const userDbName = `${USER_DB_PREFIX}${userDid}`;
        logger.info(`WebSocket disconnected for user: ${userDid}. Code: ${code}, Message: ${message}`);

        this.connections.delete(ws); // Remove connection tracking

        // Manage the CouchDB listener reference count
        const listenerInfo = this.listeners.get(userDid);
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
                this.listeners.delete(userDid);
            }
        } else {
            // This might happen if the listener failed to start initially
            logger.warn(`Listener info not found for user ${userDid} during disconnection (may have failed to start).`);
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
            logger.warn(`Invalid WebSocket message received from user ${context.userDid}:`, rawMessage, error.message);
            this.sendJson(ws, { error: 'Invalid message format. Expecting {"action": "subscribe"|"unsubscribe", "collection": "string"}' });
            return;
        }

        const { action, collection } = parsedMessage;
        const { userDid, appId } = context;

        logger.debug(`Processing action '${action}' for collection '${collection}' from user ${userDid}, app ${appId}`);

        if (action === "subscribe") {
            // **Crucial Permission Check** before subscribing
            const requiredPermission = `read:${collection}`;
            const isAllowed = await this.permissionService.canAppActForUser(userDid, appId, requiredPermission);
            if (isAllowed) {
                context.subscriptions.add(collection);
                logger.info(`User ${userDid} (via app ${appId}) subscribed to collection '${collection}'`);
                this.sendJson(ws, { status: "subscribed", collection: collection });
            } else {
                logger.warn(`App ${appId} denied subscription to '${collection}' for user ${userDid} due to permissions.`);
                this.sendJson(ws, { status: "denied", collection: collection, reason: `App does not have '${requiredPermission}' permission.` });
            }
        } else if (action === "unsubscribe") {
            const removed = context.subscriptions.delete(collection);
            if (removed) {
                logger.info(`User ${userDid} unsubscribed from collection '${collection}'`);
                this.sendJson(ws, { status: "unsubscribed", collection: collection });
            } else {
                // Inform client they weren't subscribed anyway
                logger.debug(`User ${userDid} tried to unsubscribe from '${collection}' but was not subscribed.`);
                this.sendJson(ws, { status: "not_subscribed", collection: collection });
            }
        }
    }

    /**
     * Processes a change detected by a CouchDB listener.
     */
    private async handleChange(change: ChangeWithDoc, userDid: string) {
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
            logger.debug(`Deletion detected for user ${userDid}, doc ID: ${docId}. Collection info unavailable in standard change feed for deletes.`);
            // Example: Push generic delete event (requires client handling)
            // this.pushToSubscribedUserConnections(userDid, null, { type: 'delete', collection: null, data: { _id: docId } });
            return;
        }

        // Handle updates/creations
        const doc = change.doc;
        if (!doc) {
            logger.warn(`Change detected for user ${userDid} (ID: ${docId}) but 'doc' field is missing.`);
            return; // Ignore changes without document data
        }

        // **Crucial: Identify the collection**
        // We rely on a convention: documents must have a '$collection' field.
        const collection = doc.$collection;
        if (!collection || typeof collection !== "string") {
            logger.warn(`Change detected for user ${userDid} in doc ${docId} without a valid '$collection' field. Cannot route update. Document:`, doc);
            return;
        }

        logger.debug(`Change detected for user ${userDid} in collection '${collection}', doc ID: ${docId}`);

        // Prepare the message payload
        const message: WebSocketServerMessage = {
            type: "update", // Could differentiate create vs update if needed based on rev history
            collection: collection,
            data: doc, // Send the full document
        };

        // Push the update to relevant connections for this user
        await this.pushToSubscribedUserConnections(userDid, collection, message);
    }

    /**
     * Sends a message to all connections for a specific user IF they are subscribed
     * to the given collection AND have read permission.
     */
    private async pushToSubscribedUserConnections(userDid: string, collection: string | null, message: WebSocketServerMessage) {
        // **Crucial Permission Check** before pushing data
        // If collection is null (e.g., generic delete), we might skip permission check or apply a default policy
        if (collection) {
            const requiredPermission = `read:${collection}`;
            const canRead = await this.permissionService.can(userDid, requiredPermission);
            if (!canRead) {
                logger.warn(`User ${userDid} change detected for collection '${collection}', but user lacks read permission. Update NOT pushed.`);
                return; // Do not push if permission is missing
            }
        } else {
            // Handle cases without a specific collection (e.g., generic delete)
            // Decide if these should be pushed or if a different permission applies
            logger.debug(`Pushing event without specific collection for user ${userDid}. Skipping collection-specific permission check.`);
        }

        for (const [ws, context] of this.connections.entries()) {
            if (context.userDid === userDid) {
                // Check if this specific connection is subscribed (if collection is known)
                if (collection === null || context.subscriptions.has(collection)) {
                    logger.info(
                        `Pushing update for collection '${collection ?? "N/A"}' (doc: ${
                            "type" in message && message.type === "update" ? message.data._id : "N/A"
                        }) to user ${userDid}`
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
