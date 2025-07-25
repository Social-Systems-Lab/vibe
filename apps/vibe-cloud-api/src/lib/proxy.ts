import { Elysia } from "elysia";

const NEXT_INTERNAL = process.env.VIBE_CLOUD_UI_URL || "http://127.0.0.1:4000"; // your Next server

function forwardHeaders(req: Request) {
    const headers = new Headers(req.headers);

    // Optionally strip hop-by-hop headers
    headers.delete("connection");
    headers.delete("transfer-encoding");
    headers.set("X-Forwarded-Host", req.headers.get("host") ?? "");
    headers.set("X-Forwarded-Proto", "https"); // or 'http' in dev
    return headers;
}

export const proxy = (app: Elysia) =>
    app.all("/auth/*", async ({ request }) => {
        const url = new URL(request.url);

        // Keep the /auth/* path when you set basePath:'/auth' in Next
        const target = new URL(url.pathname + url.search, NEXT_INTERNAL);

        const res = await fetch(target, {
            method: request.method,
            headers: forwardHeaders(request),
            body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
            duplex: "half",
        } as any);

        // Stream back as-is
        const responseHeaders = new Headers(res.headers);
        return new Response(res.body, {
            status: res.status,
            headers: responseHeaders,
        });
    });
