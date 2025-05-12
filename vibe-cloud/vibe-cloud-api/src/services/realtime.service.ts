// src/services/realtime.service.ts
import type { ServerWebSocket } from "bun";
import type { DataService } from "./data.service";
import type { PermissionService } from "./permission.service";
import type Nano from "nano";
import { logger } from "../utils/logger";
import type {
    ChangeWithDoc,
    GenericDataDocumentSchema,
    WebSocketAuthContext,
    WebSocketClientMessage,
    WebSocketManagedContext,
    WebSocketServerMessage,
} from "../models/models";
import { getUserDbName } from "../utils/identity.utils";

export class RealtimeService {
    private nano: Nano.ServerScope;
    private permissionService: PermissionService;
    private connections = new Map<ServerWebSocket<WebSocketAuthContext>, WebSocketManagedContext>();
    private listeners = new Map<string, { scope: Nano.ChangesReaderScope; refCount: number }>(); // userDid -> listener

    constructor(dataService: DataService, permissionService: PermissionService) {
        if (!dataService.isInitialized()) {
            logger.error("RealtimeService initialized before DataService connection was ready.");
            throw new Error("DataService connection not ready for RealtimeService.");
        }
        this.nano = dataService.getConnection();
        this.permissionService = permissionService;
        logger.info("RealtimeService initialized");
    }

    /**
     * Handles a new WebSocket connection *after* authentication context is attached.
     */
    handleConnection(ws: ServerWebSocket<WebSocketAuthContext>) {
        const { userDid, appId } = ws.data;
        if (!userDid || !appId) {
            logger.error("WebSocket connection opened without userDid or appId in context.");
            ws.close(1008, "Authentication context missing");
            return;
        }

        logger.info(`WebSocket connected for user: ${userDid}, app: ${appId}`);

        const managedContext: WebSocketManagedContext = {
            userDid: userDid,
            appId: appId,
            subscriptions: new Set<string>(),
        };
        this.connections.set(ws, managedContext);
        this.ensureListenerStarted(userDid); // Start listener for the user's DB
    }

    /**
     * Ensures a CouchDB changes listener is running for the given user ID.
     */
    private ensureListenerStarted(userDid: string) {
        const info = this.listeners.get(userDid);
        const userDbName = getUserDbName(userDid);

        if (!info) {
            logger.info(`Starting new ChangesReader for ${userDbName}.`);
            try {
                const db = this.nano.db.use<any>(userDbName);
                const scope = db.changesReader;
                const emitter = scope.start({ since: "now", includeDocs: true, timeout: 60000 });
                emitter.on("change", (change: ChangeWithDoc<typeof GenericDataDocumentSchema>) => this.handleChange(change, userDid));
                emitter.on("error", (err: unknown) => {
                    logger.error(`ChangesReader error for ${userDbName}:`, err);
                    this.listeners.delete(userDid);
                });
                this.listeners.set(userDid, { scope, refCount: 1 });
                logger.info(`Started ChangesReader for ${userDbName}`);
            } catch (err: any) {
                if (err.statusCode === 404 || err.message?.includes("does not exist")) {
                    logger.warn(`Database ${userDbName} not found when trying to start listener.`);
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
            logger.warn(`WebSocket disconnected but no context found.`);
            return;
        }
        const userDid = context.userDid;
        const userDbName = getUserDbName(userDid);
        logger.info(`WebSocket disconnected for user: ${userDid}, app: ${context.appId}. Code: ${code}`); // Log appId too
        this.connections.delete(ws);
        const listenerInfo = this.listeners.get(userDid);
        if (listenerInfo) {
            listenerInfo.refCount--;
            logger.debug(`Decremented listener refCount for ${userDbName} to ${listenerInfo.refCount}`);
            if (listenerInfo.refCount <= 0) {
                logger.info(`Stopping ChangesReader for ${userDbName} (refCount 0).`);
                try {
                    listenerInfo.scope.stop();
                } catch (error) {
                    logger.error(`Error stopping listener:`, error);
                }
                this.listeners.delete(userDid);
            }
        } else {
            logger.warn(`Listener info not found for user ${userDid} during disconnection.`);
        }
    }

    /**
     * Handles incoming messages from a WebSocket client (subscribe/unsubscribe).
     */
    async handleMessage(ws: ServerWebSocket<WebSocketAuthContext>, rawMessage: unknown) {
        const context = this.connections.get(ws);
        if (!context) {
            return;
        }

        let parsedMessage: WebSocketClientMessage;
        try {
            /* ... parse message ... */
            const messageContent = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;
            if (!messageContent?.action || !messageContent.collection || (messageContent.action !== "subscribe" && messageContent.action !== "unsubscribe")) {
                throw new Error("Invalid message format.");
            }
            parsedMessage = messageContent as WebSocketClientMessage;
        } catch (error: any) {
            logger.warn(`Invalid WebSocket message received from user ${context.userDid}, app ${context.appId}:`, rawMessage, error.message);
            this.sendJson(ws, { error: "Invalid message format." });
            return;
        }

        const { action, collection } = parsedMessage;
        const { userDid, appId } = context;

        logger.debug(`Processing action '${action}' for collection '${collection}' from user ${userDid}, app ${appId}`);

        if (action === "subscribe") {
            const requiredPermission = `read:${collection}`;
            // This check now uses the correct appId from the context
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
                logger.info(`User ${userDid} (via app ${appId}) unsubscribed from collection '${collection}'`);
                this.sendJson(ws, { status: "unsubscribed", collection: collection });
            } else {
                logger.debug(`User ${userDid} (via app ${appId}) tried to unsubscribe from '${collection}' but was not subscribed.`);
                this.sendJson(ws, { status: "not_subscribed", collection: collection });
            }
        }
    }

    /**
     * Processes a change detected by a CouchDB listener.
     */
    private handleChange(change: ChangeWithDoc<typeof GenericDataDocumentSchema>, userDid: string) {
        // Renamed from async as it doesn't await now
        const docId = change.id;
        if (docId.startsWith("_design/")) return;

        if (change.deleted === true) {
            logger.debug(`Deletion detected for user ${userDid}, doc ID: ${docId}. Collection info unavailable.`);
            // Optional: Push generic delete event
            // this.pushToSubscribedUserConnections(userDid, null, { type: 'delete', collection: null, data: { _id: docId } });
            return;
        }

        const doc = change.doc;
        if (!doc) return;

        // Use 'collection' (no $)
        const collection = doc.collection;
        if (!collection || typeof collection !== "string") {
            logger.warn(`Change in user ${userDid} DB (doc ${docId}) missing 'collection' field.`);
            return;
        }

        logger.debug(`Change detected for user ${userDid} in collection '${collection}', doc ID: ${docId}`);
        const message: WebSocketServerMessage = { type: "update", collection: collection, data: doc };

        // Push update to subscribed connections for this user
        // No await needed as pushToSubscribedUserConnections is not async anymore
        this.pushToSubscribedUserConnections(userDid, collection, message);
    }

    /**
     * Sends a message to all connections for a specific user IF they are subscribed
     * to the given collection.
     */
    private pushToSubscribedUserConnections(userDid: string, collection: string, message: WebSocketServerMessage) {
        let pushedCount = 0;
        for (const [ws, context] of this.connections.entries()) {
            if (context.userDid === userDid && context.subscriptions.has(collection)) {
                this.sendJson(ws, message);
                pushedCount++;
            }
        }
        if (pushedCount > 0) {
            // Use optional chaining for message.data._id in case message type changes
            logger.info(`Pushed update for collection '${collection}' to ${pushedCount} connection(s) for user ${userDid}`);
        }
    }

    /**
     * Helper to safely send JSON over WebSocket.
     */
    private sendJson(ws: ServerWebSocket<any>, data: WebSocketServerMessage | { error: string }) {
        try {
            ws.send(JSON.stringify(data));
        } catch (error) {
            logger.error(`Failed to send JSON message:`, error);
        }
    }
}
