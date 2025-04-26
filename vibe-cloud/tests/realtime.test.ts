// tests/realtime.test.ts
import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import { startServer } from "../src/index"; // Removed permissionService import
import { createTestCtx, type TestCtx } from "./test-context";
import { logger } from "../src/utils/logger";
import type { WebSocketServerMessage, AppManifest, PermissionSetting } from "../src/models/models"; // Added AppManifest, PermissionSetting
import type { Server } from "bun";

// --- Test Setup ---
let testCtx: TestCtx;
let cleanup: () => Promise<void>;
let testCollection: string;
let socket: WebSocket;
let serverInstance: Server | null = null;
let closeListenerForSetup: ((event: CloseEvent) => void) | null = null;

describe("Real-time sync over WebSockets", () => {
    // Create one user context for all realtime tests
    beforeAll(async () => {
        logger.info("Setting up Realtime test context...");
        // 1. Start the server on a random available port (port 0)
        try {
            serverInstance = startServer(0); // Use 0 for random port
            await Bun.sleep(50); // Short pause to ensure server is ready
            if (!serverInstance?.port) {
                throw new Error("Server started but port is not available.");
            }
            logger.info(`Test server started on port ${serverInstance.port}`);
        } catch (error) {
            logger.error("Failed to start test server:", error);
            throw error; // Fail setup if server doesn't start
        }

        // 2. Create user context (this initializes services via index import)
        const { ctx, cleanup: contextCleanup } = await createTestCtx();
        testCtx = ctx;
        cleanup = contextCleanup;
        testCollection = `rt_items_${testCtx.ts}`;

        // 3. Permissions are now set during createTestCtx using /upsert. No need to set them again here.
        logger.debug(`Permissions for app '${testCtx.appId}' and collection '${testCollection}' assumed set by createTestCtx.`);
        // We can optionally verify using the /status endpoint if needed, but createTestCtx should handle it.

        // 4. Establish WebSocket connection
        const wsPort = serverInstance.port;
        const wsUrl = `ws://127.0.0.1:${wsPort}/ws?token=${testCtx.token}&appId=${encodeURIComponent(testCtx.appId)}`;
        logger.info(`Attempting to connect WebSocket to: ${wsUrl.replace(testCtx.token, "<token>")}`);
        socket = new WebSocket(wsUrl);

        // 5. Wait for connection
        try {
            await new Promise<void>((resolve, reject) => {
                const connectionTimeout = 5000;
                const timer = setTimeout(() => {
                    socket?.close();
                    reject(new Error(`WS connection timed out`));
                }, connectionTimeout);

                const onOpen = () => {
                    clearTimeout(timer);
                    logger.info("WebSocket connection opened successfully.");
                    // Clean up the close listener *after* successful open,
                    // as it's no longer needed for setup error detection.
                    if (closeListenerForSetup) {
                        socket.removeEventListener("close", closeListenerForSetup);
                        closeListenerForSetup = null; // Clear the reference
                    }
                    resolve();
                };

                const onError = (event: Event) => {
                    clearTimeout(timer);
                    logger.error("WS connection error:", event);
                    // Also remove the close listener on error
                    if (closeListenerForSetup) {
                        socket.removeEventListener("close", closeListenerForSetup);
                        closeListenerForSetup = null;
                    }
                    reject(new Error(`WS connection error: ${event.type}`));
                };

                // Assign the function to the tracked variable
                closeListenerForSetup = (event: CloseEvent) => {
                    clearTimeout(timer);
                    // Only reject if the socket is closing/closed *before* 'open' fired.
                    // This check implicitly handles the case where 'open' already succeeded.
                    if (!socket.readyState || socket.readyState === WebSocket.CONNECTING || socket.readyState >= WebSocket.CLOSING) {
                        logger.error(`WS closed before opening or during connection. Code: ${event.code}`);
                        reject(new Error(`WS closed unexpectedly during setup. Code: ${event.code}`));
                    }
                    // No need for an else, if it opened successfully, onOpen handles resolution.
                    // We leave the listener attached until open or error occurs.
                };

                socket.addEventListener("open", onOpen, { once: true });
                socket.addEventListener("error", onError, { once: true });
                // Add the tracked listener
                socket.addEventListener("close", closeListenerForSetup, { once: true });
            });
            logger.info("WebSocket connection promise resolved.");
        } catch (error) {
            logger.error("Failed to establish WebSocket connection:", error);
            serverInstance?.stop(true);
            throw error;
        }
        logger.info("Realtime test context setup complete.");
    });

    afterAll(async () => {
        logger.info("Cleaning up Realtime test context...");
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            logger.debug(`Closing WebSocket (readyState: ${socket.readyState})...`);
            socket.close(1000, "Test suite finished"); // Explicit normal close
        } else {
            logger.debug(`WebSocket already closed or not initialized (readyState: ${socket?.readyState}). Skipping explicit close.`);
        }

        // Stop the test server instance
        if (serverInstance) {
            logger.info(`Stopping test server on port ${serverInstance.port}...`);
            serverInstance.stop(true); // Use true to force close immediately
            serverInstance = null;
            logger.info("Test server stopped.");
        }
        // Run user cleanup
        if (cleanup) {
            await cleanup();
        }
        logger.info("Realtime test cleanup complete.");
    });

    // Helper to get the next message from the WebSocket
    const nextMsg = (ms = 2000) =>
        new Promise<WebSocketServerMessage>((res, rej) => {
            const to = setTimeout(() => rej(new Error(`WS message timeout after ${ms}ms`)), ms);
            socket.addEventListener(
                "message",
                (ev) => {
                    clearTimeout(to);
                    try {
                        const parsed = JSON.parse(ev.data as string);
                        res(parsed);
                    } catch (e) {
                        rej(new Error(`Failed to parse WS message: ${e}. Data: ${ev.data}`));
                    }
                },
                { once: true }
            );
        });

    // Helper to create headers for REST API calls
    const getHeaders = () => ({
        Authorization: `Bearer ${testCtx.token}`,
        "X-Vibe-App-ID": testCtx.appId,
    });

    it("should subscribe successfully and push an update to a subscribed client", async () => {
        // 1. Subscribe
        logger.debug(`Sending subscribe message for collection: ${testCollection}`);
        socket.send(JSON.stringify({ action: "subscribe", collection: testCollection }));
        const subResponse = await nextMsg();
        expect(subResponse).toEqual({ status: "subscribed", collection: testCollection });
        logger.debug("Subscription confirmation received.");

        // 2. Create a doc via REST API (using correct headers)
        const docData = { name: "Realtime Test Doc", value: 42 };
        logger.debug(`Creating document via REST in collection: ${testCollection}`);
        const {
            data: createData,
            error: createError,
            status: createStatus,
        } = await testCtx.api.api.v1.data.write.post({ collection: testCollection, data: docData }, { headers: getHeaders() });
        expect(createStatus, `REST Create Status: ${createStatus}, Error: ${JSON.stringify(createError?.value)}`).toBe(200);
        expect(createError).toBeNull();
        const createdDocId = (createData as any)?.id;
        expect(createdDocId).toBeTypeOf("string");
        logger.debug(`Document created via REST, ID: ${createdDocId}`);

        // 3. Expect a realtime message via WebSocket
        logger.debug("Waiting for WebSocket update message...");
        const updateMsg = (await nextMsg()) as any;
        logger.debug("WebSocket update message received:", updateMsg);

        // 4. Verify the message content
        expect(updateMsg.type).toBe("update");
        expect(updateMsg.collection).toBe(testCollection);
        expect(updateMsg.data).toBeDefined();
        expect(updateMsg.data._id).toBe(createdDocId);
        expect(updateMsg.data.name).toBe(docData.name);
        expect(updateMsg.data.value).toBe(docData.value);
        expect(updateMsg.data.collection).toBe(testCollection); // Verify collection field in data
    });

    it("should deny subscription and NOT push updates when read permission is revoked", async () => {
        const readPerm = `read:${testCollection}`;
        const writePerm = `write:${testCollection}`; // Keep write permission

        try {
            // 1. Revoke read permission for the app by calling /upsert with updated grants
            logger.debug(`Revoking read permission '${readPerm}' via /upsert for app ${testCtx.appId}, user ${testCtx.userDid}`);
            const grantsWithoutRead: Record<string, PermissionSetting> = {
                [writePerm]: "ask", // Keep write permission (or 'always' depending on test needs)
            };
            // Need a minimal manifest for the upsert
            const minimalManifest: AppManifest = {
                appId: testCtx.appId,
                name: `Test App ${testCtx.ts}`, // Use consistent name or fetch from status?
                permissions: [writePerm], // Only list permissions being granted/kept
            };
            const revokeResponse = await testCtx.api.api.v1.apps.upsert.post({ ...minimalManifest, grants: grantsWithoutRead }, { headers: getHeaders() });
            if (revokeResponse.status !== 200) {
                // Cast error data based on ErrorResponseSchema
                const errorData = revokeResponse.data as { error?: string; details?: any };
                throw new Error(`Failed to revoke read permission via upsert: ${errorData?.error || `Status ${revokeResponse.status}`}`);
            }
            logger.debug(`Read permission revoked via /upsert`);

            // Verify permissions using /status endpoint
            // Pass appId as parameter to the function call, and only options object to .get()
            const statusAfterRevoke = await testCtx.api.api.v1.user.apps({ appId: testCtx.appId }).status.get({ headers: getHeaders() });
            expect(statusAfterRevoke.data?.grants?.[readPerm]).toBeUndefined();
            expect(statusAfterRevoke.data?.grants?.[writePerm]).toBeDefined(); // Check write is still there

            // 2. Attempt to subscribe (should be denied)
            logger.debug(`Sending subscribe message for collection: ${testCollection} (expecting denial)`);
            socket.send(JSON.stringify({ action: "subscribe", collection: testCollection }));
            const subResponse = await nextMsg();
            expect(subResponse).toEqual({
                status: "denied",
                collection: testCollection,
                reason: `App does not have '${readPerm}' permission.`, // Check reason
            });
            logger.debug("Subscription denial confirmation received.");

            // ***** ADD THIS STEP *****
            // 3. Explicitly Unsubscribe (to clear state from the previous test)
            // Even though the subscribe failed, ensure we clear any prior subscription state.
            logger.debug(`Sending unsubscribe message for collection: ${testCollection} to ensure clean state`);
            socket.send(JSON.stringify({ action: "unsubscribe", collection: testCollection }));
            const unsubResponse = (await nextMsg()) as any; // Wait for confirmation or 'not_subscribed'
            expect(unsubResponse.status).toMatch(/unsubscribed|not_subscribed/);
            logger.debug(`Unsubscribe confirmation received: ${unsubResponse.status}`);
            // ***** END ADDED STEP *****

            // 4. Write another doc using the REST API (should succeed due to write perm)
            const docData = { name: "Write While Read Denied", value: 1 };
            logger.debug(`Creating document via REST (should succeed): ${testCollection}`);
            const { status: createStatus } = await testCtx.api.api.v1.data.write.post({ collection: testCollection, data: docData }, { headers: getHeaders() });
            expect(createStatus).toBe(200);
            logger.debug("Document created successfully via REST.");

            // 5. Ensure NO update arrives via WebSocket within 1 second.
            logger.debug("Checking for unexpected WebSocket messages...");
            let messageReceived: WebSocketServerMessage | null = null;
            const raceListener = (ev: MessageEvent) => {
                try {
                    messageReceived = JSON.parse(ev.data);
                    logger.warn(">>> Unexpected WS message received:", messageReceived);
                } catch (e) {
                    /* ignore parse error */
                }
            };
            socket.addEventListener("message", raceListener);
            await Bun.sleep(1000); // Wait
            socket.removeEventListener("message", raceListener);

            expect(messageReceived).toBeNull(); // Assert no message was received
            logger.debug("No unexpected WebSocket message received, as expected.");
        } finally {
            // 5. Restore read permission via /upsert
            logger.debug(`Restoring read permission '${readPerm}' via /upsert for app ${testCtx.appId}, user ${testCtx.userDid}`);
            const grantsWithRead: Record<string, PermissionSetting> = {
                [readPerm]: "always",
                [writePerm]: "ask", // Keep write as well
            };
            const restoreManifest: AppManifest = {
                appId: testCtx.appId,
                name: `Test App ${testCtx.ts}`,
                permissions: [readPerm, writePerm], // List all permissions
            };
            const restoreResponse = await testCtx.api.api.v1.apps.upsert.post({ ...restoreManifest, grants: grantsWithRead }, { headers: getHeaders() });
            if (restoreResponse.status !== 200) {
                // Cast error data based on ErrorResponseSchema
                const errorData = restoreResponse.data as { error?: string; details?: any };
                logger.error(`Failed to restore read permission via upsert: ${errorData?.error || `Status ${restoreResponse.status}`}`);
                // Don't throw in finally, just log
            } else {
                logger.debug(`Read permission restored via /upsert`);
            }
        }
    });
});
