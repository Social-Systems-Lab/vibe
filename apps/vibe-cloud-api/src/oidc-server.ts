import { IdentityService } from "./services/identity";
import { StorageService } from "./services/storage";
import { configureOidcProvider } from "./lib/oidc";
import http from "http";

const startOidcServer = async () => {
    console.log("Starting OIDC server...");

    const identityService = new IdentityService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
        instanceIdSecret: process.env.INSTANCE_ID_SECRET!,
    });

    const storageService = new StorageService({
        url: process.env.COUCHDB_URL!,
        user: process.env.COUCHDB_USER!,
        pass: process.env.COUCHDB_PASSWORD!,
    });

    try {
        await identityService.onApplicationBootstrap(process.env.COUCHDB_USER!, process.env.COUCHDB_PASSWORD!);
        await storageService.onApplicationBootstrap();
        console.log("OIDC services initialized.");
    } catch (error) {
        console.error("Failed to initialize OIDC services:", error);
        process.exit(1);
    }

    const issuer = process.env.OIDC_ISSUER_URL || "http://localhost:5001";
    const oidc = configureOidcProvider(issuer, identityService, storageService, process.env.VIBE_WEB_CLIENT_SECRET!);

    // A simple middleware to expose interaction details
    oidc.use(async (ctx, next) => {
        if (ctx.path.endsWith("/details")) {
            try {
                const details = await oidc.interactionDetails(ctx.req, ctx.res);
                ctx.body = details;
                ctx.status = 200;
            } catch (err) {
                console.error("Error getting interaction details:", err);
                ctx.status = 500;
                ctx.body = { error: "Internal Server Error" };
            }
        } else {
            await next();
        }
    });

    const server = http.createServer(oidc.callback());

    server.listen(5001, () => {
        console.log(`OIDC server is running at ${issuer}`);
    });
};

startOidcServer().catch((err) => {
    console.error("Failed to start OIDC server:", err);
    process.exit(1);
});
