import Elysia from "elysia";

export const app = new Elysia()
    .ws("/ws", {
        // NO schemas (query, body) defined here
        beforeHandle({ request }) {
            const url = new URL(request.url);
            console.log(`Ultra-Minimal WS: beforeHandle. Path: ${url.pathname}`);
            // Just return a dummy context synchronously
            return { userId: "ultra-minimal-user" };
        },
        open(ws) {
            console.log(`Ultra-Minimal WS: Opened! Context: ${JSON.stringify(ws.data)}`);
            ws.send("Ultra-Minimal Connected!");
        },
        message(ws, message) {
            console.log(`Ultra-Minimal WS: Message: ${message}`);
            ws.send(`Echo: ${message}`);
        },
        close(ws, code, reason) {
            console.log(`Ultra-Minimal WS: Closed. Code: ${code}, Reason: ${reason}`);
        },
    })
    .get("/", () => "Hello")
    .listen(3000, () => {
        console.log("Ultra-Minimal Elysia server running on port 3000");
    });
