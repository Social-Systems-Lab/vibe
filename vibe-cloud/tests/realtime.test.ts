// // realtime.test.ts
// import { describe, it, beforeAll, afterAll, expect } from "bun:test";
// import type { WebSocketServerMessage } from "../src/services/realtime.service";
// import { app } from "../src/index";
// import { permissionService } from "../src/services/permission.service";
// import { createTestCtx } from "./test-context";
// import { logger } from "../src/utils/logger";

// let listener: ReturnType<typeof app.listen>; // the Elysia instance
// let socket: WebSocket;

// const { ctx, cleanup } = await createTestCtx();
// const { api, userDid: testUserDid, token: authToken } = ctx;
// let testUserPermissionsRev = ctx.permsRev;

// // beforeAll(async () => {
// //     listener = app.listen(0);
// //     await Bun.sleep(10);
// // });

// afterAll(async () => {
//     socket?.close();
//     //listener.server?.stop();
//     await cleanup(); // delete this test user
// });

// describe("Real-time sync over WebSockets", () => {
//     const rtCollection = `rt_items_${Date.now()}`;

//     const nextMsg = (ms = 2000) =>
//         new Promise<WebSocketServerMessage>((res, rej) => {
//             const to = setTimeout(() => rej(new Error("WS timeout")), ms);
//             socket.addEventListener(
//                 "message",
//                 (ev) => {
//                     clearTimeout(to);
//                     res(JSON.parse(ev.data));
//                 },
//                 { once: true }
//             );
//         });

//     // suite-level before/after
//     beforeAll(async () => {
//         // grant read/write for this collection
//         const { rev } = await permissionService.setPermissions(testUserDid, [`read:${rtCollection}`, `write:${rtCollection}`], testUserPermissionsRev);
//         testUserPermissionsRev = rev;

//         // open WS once the server is running
//         //const wsUrl = `ws://127.0.0.1:${listener.server!.port}/ws?token=${authToken}`;
//         const wsUrl = `ws://127.0.0.1:3000/ws?token=${authToken}`;
//         socket = new WebSocket(wsUrl);

//         try {
//             await new Promise<void>((resolve, reject) => {
//                 const connectionTimeout = 5000; // 5 seconds timeout
//                 const timer = setTimeout(() => {
//                     reject(new Error(`WebSocket connection timed out after ${connectionTimeout}ms`));
//                 }, connectionTimeout);

//                 const onOpen = () => {
//                     clearTimeout(timer);
//                     logger.info("WebSocket connection opened successfully.");
//                     // Clean up other listeners
//                     socket.removeEventListener("error", onError);
//                     socket.removeEventListener("close", onClose);
//                     resolve();
//                 };

//                 const onError = (event: Event) => {
//                     clearTimeout(timer);
//                     logger.error("WebSocket connection error:", event);
//                     // Clean up other listeners
//                     socket.removeEventListener("open", onOpen);
//                     socket.removeEventListener("close", onClose);
//                     reject(new Error(`WebSocket connection error: ${event.type}`));
//                 };

//                 const onClose = (event: CloseEvent) => {
//                     clearTimeout(timer);
//                     // Only reject if it closed *before* opening successfully
//                     if (!socket.readyState || socket.readyState >= WebSocket.CLOSING) {
//                         logger.error(`WebSocket connection closed before opening. Code: ${event.code}, Reason: ${event.reason}`);
//                         // Clean up other listeners
//                         socket.removeEventListener("open", onOpen);
//                         socket.removeEventListener("error", onError);
//                         reject(new Error(`WebSocket connection closed unexpectedly. Code: ${event.code}, Reason: '${event.reason}'`));
//                     }
//                     // If it closed *after* opening, we don't reject here.
//                 };

//                 socket.addEventListener("open", onOpen, { once: true });
//                 socket.addEventListener("error", onError, { once: true });
//                 socket.addEventListener("close", onClose, { once: true });
//             });
//             logger.info("WebSocket connection promise resolved.");
//         } catch (error) {
//             logger.error("Failed to establish WebSocket connection:", error);
//             // Optionally re-throw or handle the error to fail the test setup clearly
//             throw error;
//         }
//     });

//     it("pushes an update to a subscribed client", async () => {
//         // subscribe
//         socket.send(JSON.stringify({ action: "subscribe", collection: rtCollection }));
//         await nextMsg(); // consume {"status":"subscribed", ...}

//         // create a doc via REST
//         const { data: doc } = await api.api.v1
//             .data({ collection: rtCollection })
//             .post({ $collection: rtCollection, foo: 42 }, { headers: { Authorization: `Bearer ${authToken}` } });

//         // expect a realtime message
//         const msg = await nextMsg();
//         expect(msg).toMatchObject({
//             type: "update",
//             collection: rtCollection,
//             data: { _id: doc!.id, foo: 42 },
//         });
//     });

//     it("does NOT push when read permission is revoked", async () => {
//         // revoke read permission
//         const { rev } = await permissionService.setPermissions(
//             testUserDid!,
//             [`write:${rtCollection}`], // write‑only
//             testUserPermissionsRev!
//         );
//         testUserPermissionsRev = rev;

//         // *** FIX: Set up listener *before* sending the message ***
//         const denialPromise = nextMsg();

//         // Send subscribe message again.
//         socket.send(JSON.stringify({ action: "subscribe", collection: rtCollection }));

//         // Now await the promise we set up earlier
//         const subResponse = await denialPromise; // Wait for the server's response
//         expect(subResponse).toMatchObject({
//             status: "denied", // Verify the server denied the subscription
//             collection: rtCollection,
//             reason: "Permission denied", // Check the reason if available
//         });

//         // write another doc using the REST API (should succeed due to write perm)
//         await api.api.v1.data({ collection: rtCollection }).post({ $collection: rtCollection, bar: 1 }, { headers: { Authorization: `Bearer ${authToken}` } });

//         // Ensure no update arrives via WebSocket within 1 second.
//         // Add a temporary listener, wait, then check if it fired.
//         let messageReceived: WebSocketServerMessage | null = null;
//         const raceListener = (ev: MessageEvent) => {
//             try {
//                 messageReceived = JSON.parse(ev.data);
//                 logger.warn(">>> Unexpected WS message received during timeout check:", messageReceived);
//             } catch (e) {
//                 logger.error(">>> Error parsing unexpected WS message during timeout check:", e);
//             }
//         };
//         socket.addEventListener("message", raceListener); // Add listener (not {once: true})

//         await Bun.sleep(1000); // Wait for 1 second

//         socket.removeEventListener("message", raceListener); // Clean up listener

//         // Assert that no message was received during the sleep period
//         expect(messageReceived).toBeNull();
//     });
// });
