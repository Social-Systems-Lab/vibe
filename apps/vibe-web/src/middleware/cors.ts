import type { Middleware } from "waku/config";

const corsMiddleware: Middleware = () => {
    return async (ctx, next) => {
        console.log(`[CORS] Middleware executing for: ${ctx.req.method} ${ctx.req.url}`);
        await next();
        if (ctx.res) {
            console.log(`[CORS] Setting headers for response with status ${ctx.res.status}`);
            // Waku seems to use a plain object for headers, not a Headers object.
            if (!ctx.res.headers) {
                ctx.res.headers = {};
            }
            ctx.res.headers["Access-Control-Allow-Origin"] = "*";
            ctx.res.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
            ctx.res.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
        } else {
            console.log("[CORS] No response object found to set headers on.");
        }
    };
};

export default corsMiddleware;
