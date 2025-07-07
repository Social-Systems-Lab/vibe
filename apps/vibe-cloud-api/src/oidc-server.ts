import { IdentityService } from "./services/identity";
import { StorageService } from "./services/storage";
import { configureOidcProvider } from "./lib/oidc";
import http from "http";
import path from "path";
import ejs from "ejs";
import bodyParser from "koa-bodyparser";
import { inspect } from "util";

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

    oidc.use(bodyParser());

    const render = async (ctx: any, template: string, data: object) => {
        const layout = path.resolve(__dirname, "views/layout.ejs");
        const body = await ejs.renderFile(path.resolve(__dirname, `views/${template}.ejs`), data);
        ctx.body = await ejs.renderFile(layout, { body });
    };

    oidc.use(async (ctx, next) => {
        const pathParts = ctx.path.split("/");
        if (pathParts[1] !== "interaction") {
            return next();
        }
        const uid = pathParts[2];

        try {
            const details = await storageService.find(uid);
            if (!details) {
                throw new Error("Interaction not found");
            }
            const { prompt, params, session } = details as any;

            if (ctx.method === "GET") {
                if (prompt.details.error) {
                    return render(ctx, "login", { uid, error: prompt.details.error_description || prompt.details.error });
                }

                if (prompt.name === "login") {
                    return render(ctx, "login", { uid, error: null });
                }
                if (prompt.name === "create") {
                    return render(ctx, "signup", { uid, error: null });
                }
                // TODO: Add consent view
                return render(ctx, "login", { uid, error: "Unhandled prompt" });
            }

            if (ctx.method === "POST") {
                let did;
                const { email, password } = ctx.request.body as any;

                if (pathParts[3] === "login") {
                    const user = await identityService.login(email, password);
                    did = user.did;
                } else if (pathParts[3] === "signup") {
                    const existingUser = await identityService.findByEmail(email);
                    if (existingUser) throw new Error("User already exists");
                    const password_hash = await Bun.password.hash(password);
                    const user = await identityService.register(email, password_hash, password);
                    did = user.did;
                }

                if (did) {
                    const result = { login: { accountId: did } };
                    // The oidc-provider library requires the session cookie to be present on the raw request
                    // to finish the interaction. We manually inject it into the headers here.
                    if (details.session) {
                        const sessionCookie = `_session=${details.session.uid}`;
                        if (ctx.req.headers.cookie) {
                            ctx.req.headers.cookie = `${ctx.req.headers.cookie}; ${sessionCookie}`;
                        } else {
                            ctx.req.headers.cookie = sessionCookie;
                        }
                    }
                    await oidc.interactionFinished(ctx.req, ctx.res, result, { mergeWithLastSubmission: false });
                } else {
                    throw new Error("Authentication failed");
                }
            }
        } catch (err: any) {
            console.error("An error occurred in the interaction middleware:", err);
            const template = ctx.path.includes("/login") ? "login" : "signup";
            const errorMessage = err.error_description || err.message || "An unexpected error occurred.";
            return render(ctx, template, { uid, error: errorMessage });
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
