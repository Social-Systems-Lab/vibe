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

export async function proxyRequest(request: Request) {
    const url = new URL(request.url);
    console.log(`[PROXY] Incoming request: ${request.method} ${url.pathname}`);

    // Keep the /auth/* path when you set basePath:'/auth' in Next
    const target = new URL(url.pathname + url.search, NEXT_INTERNAL);
    console.log(`[PROXY] Forwarding to: ${target.href}`);

    try {
        const res = await fetch(target, {
            method: request.method,
            headers: forwardHeaders(request),
            body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        } as RequestInit);

        console.log(`[PROXY] Received response with status: ${res.status}`);

        // Stream back as-is
        const responseHeaders = new Headers(res.headers);
        return new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        console.error("[PROXY] Error forwarding request:", error);
        return new Response("Proxy error", { status: 502 });
    }
}
