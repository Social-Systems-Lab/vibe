import { Application, Router, Context, Next } from "oak";
import { createAuthRouter } from "./auth-routes.ts";
import { createDataRouter } from "./data-routes.ts";
import { CouchDBClient } from "./couchdb-client.ts";

// Initialize the database
const couchdbUrl = Deno.env.get("COUCHDB_URL") || "http://localhost:5984";
const couchdbUser = Deno.env.get("COUCHDB_ADMIN_USER") || "admin";
const couchdbPassword = Deno.env.get("COUCHDB_ADMIN_PASSWORD") || "password";
const dbName = "vibe-cloud";

const db = new CouchDBClient({
  url: couchdbUrl,
  username: couchdbUser,
  password: couchdbPassword
});

// Create the database if it doesn't exist
try {
  await db.createDatabase(dbName);
  console.log(`Database '${dbName}' ready`);
} catch (error: any) {
  console.error(`Error creating database: ${error.message}`);
}

// Create the application
const app = new Application();

// Add database to context
app.use(async (ctx: Context, next: Next) => {
  ctx.state.db = db;
  await next();
});

// Add CORS middleware
app.use(async (ctx: Context, next: Next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  ctx.response.headers.set(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204; // No content
    return;
  }
  
  await next();
});

// Create and use the auth router
const authRouter = createAuthRouter(db);
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());

// Create and use the data router
const dataRouter = createDataRouter(db);
app.use(dataRouter.routes());
app.use(dataRouter.allowedMethods());

// Add a simple health check endpoint
const router = new Router();
router.get("/health", (ctx: Context) => {
  ctx.response.body = { status: "ok" };
});

// Add a simple root endpoint
router.get("/", (ctx: Context) => {
  ctx.response.body = { 
    message: "Vibe Cloud API", 
    version: "1.0.0",
    endpoints: [
      "/api/auth/challenge",
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/invite",
      "/api/data/:collection",
      "/health"
    ]
  };
});

app.use(router.routes());
app.use(router.allowedMethods());

// Error handling middleware
app.use(async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    console.error("Unhandled error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Start the server
const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`HTTP server running. Access it at: http://localhost:${port}/`);

await app.listen({ port });
