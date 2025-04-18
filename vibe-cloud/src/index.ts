import { Elysia } from "elysia";

export const app = new Elysia().get("/health", () => ({ status: "ok" }));

// Start the server only if the file is run directly
if (import.meta.main) {
    app.listen(3000);
    console.log(`🦊 Vibe Cloud is running at ${app.server?.hostname}:${app.server?.port}`);
}
