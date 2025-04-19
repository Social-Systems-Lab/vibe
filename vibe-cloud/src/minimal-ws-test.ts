// minimal_ws_test.ts
import { type WebSocketHandler } from "bun";

console.log("Starting minimal Bun WebSocket server...");

const server = Bun.serve({
    port: 3001, // Use a different port
    fetch(req, server) {
        const url = new URL(req.url);
        if (url.pathname === "/ws_minimal") {
            console.log("Minimal WS: Received upgrade request");
            // Simulate basic auth check - just check if token exists
            const token = url.searchParams.get("token");
            if (!token) {
                console.log("Minimal WS: No token, rejecting.");
                return new Response("Auth token required", { status: 401 });
            }

            console.log("Minimal WS: Token found, attempting upgrade...");
            const success = server.upgrade(req, {
                data: { authToken: token }, // Pass data like Elysia context
            });

            if (success) {
                console.log("Minimal WS: Upgrade call successful.");
                // Bun automatically handles sending the 101 response here
                return undefined;
            } else {
                console.log("Minimal WS: Upgrade call failed.");
                return new Response("Upgrade failed", { status: 500 });
            }
        }
        return new Response("Not Found", { status: 404 });
    },
    websocket: {
        open(ws) {
            console.log(`Minimal WS: Socket opened! Data: ${JSON.stringify(ws.data)}`);
        },
        message(ws, message) {
            console.log(`Minimal WS: Received message "${message}" from ${ws.data.authToken}`);
            ws.send(`Echo: ${message}`);
        },
        close(ws, code, reason) {
            console.log(`Minimal WS: Socket closed. Code: ${code}, Reason: ${reason}`);
        },
    } satisfies WebSocketHandler<{ authToken: string }>,
});

console.log(`Minimal Bun WebSocket server listening on port ${server.port}`);
