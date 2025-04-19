// realtime.test.ts
import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import type { WebSocketServerMessage } from "../src/services/realtime.service";
import { app } from "../src/index";
import { permissionService } from "../src/services/permission.service";
import { createTestCtx } from "./test-context";

let listener: ReturnType<typeof app.listen>; // the Elysia instance
let socket: WebSocket;

const { ctx, cleanup } = await createTestCtx();
const { api, userId: testUserId, token: authToken } = ctx;
let testUserPermissionsRev = ctx.permsRev;

// beforeAll(async () => {
//     listener = app.listen(0);
//     await Bun.sleep(10);
// });

afterAll(async () => {
    socket?.close();
    //listener.server?.stop();
    await cleanup(); // delete this test user
});

describe("Real‑time sync over WebSockets", () => {
    const rtCollection = `rt_items_${Date.now()}`;

    const nextMsg = (ms = 2000) =>
        new Promise<WebSocketServerMessage>((res, rej) => {
            const to = setTimeout(() => rej(new Error("WS timeout")), ms);
            socket.addEventListener(
                "message",
                (ev) => {
                    clearTimeout(to);
                    res(JSON.parse(ev.data));
                },
                { once: true }
            );
        });

    // suite‑level before/after
    beforeAll(async () => {
        // grant read/write for this collection
        const { rev } = await permissionService.setPermissions(testUserId, [`read:${rtCollection}`, `write:${rtCollection}`], testUserPermissionsRev);
        testUserPermissionsRev = rev;

        // open WS once the server is running
        //const wsUrl = `ws://127.0.0.1:${listener.server!.port}/ws?token=${authToken}`;
        const wsUrl = `ws://127.0.0.1:3000/ws?token=${authToken}`;
        console.log(`Attempting to connect WebSocket to: ${wsUrl}`); // Log URL
        socket = new WebSocket(wsUrl);

        try {
            await new Promise<void>((resolve, reject) => {
                const connectionTimeout = 5000; // 5 seconds timeout
                const timer = setTimeout(() => {
                    reject(new Error(`WebSocket connection timed out after ${connectionTimeout}ms`));
                }, connectionTimeout);

                const onOpen = () => {
                    clearTimeout(timer);
                    console.log("WebSocket connection opened successfully.");
                    // Clean up other listeners
                    socket.removeEventListener("error", onError);
                    socket.removeEventListener("close", onClose);
                    resolve();
                };

                const onError = (event: Event) => {
                    clearTimeout(timer);
                    console.error("WebSocket connection error:", event);
                    // Clean up other listeners
                    socket.removeEventListener("open", onOpen);
                    socket.removeEventListener("close", onClose);
                    reject(new Error(`WebSocket connection error: ${event.type}`));
                };

                const onClose = (event: CloseEvent) => {
                    clearTimeout(timer);
                    // Only reject if it closed *before* opening successfully
                    if (!socket.readyState || socket.readyState >= WebSocket.CLOSING) {
                        console.error(`WebSocket connection closed before opening. Code: ${event.code}, Reason: ${event.reason}`);
                        // Clean up other listeners
                        socket.removeEventListener("open", onOpen);
                        socket.removeEventListener("error", onError);
                        reject(new Error(`WebSocket connection closed unexpectedly. Code: ${event.code}, Reason: '${event.reason}'`));
                    }
                    // If it closed *after* opening, we don't reject here.
                };

                socket.addEventListener("open", onOpen, { once: true });
                socket.addEventListener("error", onError, { once: true });
                socket.addEventListener("close", onClose, { once: true });
            });
            console.log("WebSocket connection promise resolved.");
        } catch (error) {
            console.error("Failed to establish WebSocket connection:", error);
            // Optionally re-throw or handle the error to fail the test setup clearly
            throw error;
        }
    });

    it("pushes an update to a subscribed client", async () => {
        // subscribe
        socket.send(JSON.stringify({ action: "subscribe", collection: rtCollection }));
        await nextMsg(); // consume {"status":"subscribed", ...}

        // create a doc via REST
        const { data: doc } = await api.api.v1
            .data({ collection: rtCollection })
            .post({ $collection: rtCollection, foo: 42 }, { headers: { Authorization: `Bearer ${authToken}` } });

        // expect a realtime message
        const msg = await nextMsg();
        expect(msg).toMatchObject({
            type: "update",
            collection: rtCollection,
            data: { _id: doc!.id, foo: 42 },
        });
    });

    it("does NOT push when read permission is revoked", async () => {
        // revoke read permission
        const { rev } = await permissionService.setPermissions(
            testUserId!,
            [`write:${rtCollection}`], // write‑only
            testUserPermissionsRev!
        );
        testUserPermissionsRev = rev;

        // subscribe again (will succeed but user lacks read)
        socket.send(JSON.stringify({ action: "subscribe", collection: rtCollection }));
        await nextMsg(); // consume {"status":"subscribed", ...}

        // write another doc
        await api.api.v1.data({ collection: rtCollection }).post({ $collection: rtCollection, bar: 1 }, { headers: { Authorization: `Bearer ${authToken}` } });

        // ensure no update arrives within 1 s
        await expect(Promise.race([nextMsg(1000), Bun.sleep(1000).then(() => "none")])).resolves.toBe("none");
    });
});
