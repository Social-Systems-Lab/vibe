import { Router, Context, RouterContext } from "oak";
import { v4 as uuid } from "uuid";

export function createDataRouter(db: any) {
  const router = new Router();
  
  // Middleware to verify authentication
  async function authMiddleware(ctx: Context, next: () => Promise<unknown>) {
    const authHeader = ctx.request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Authentication required" };
      return;
    }
    
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    try {
      // In a real implementation, this would properly verify the JWT
      // For now, we'll do a simplified check
      const [payloadBase64] = token.split('.');
      const payload = JSON.parse(atob(payloadBase64));
      
      // Check if token is expired
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Token expired" };
        return;
      }
      
      // Add user info to context
      ctx.state.user = {
        did: payload.did,
        username: payload.username
      };
      
      await next();
    } catch (error) {
      console.error("Auth error:", error);
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid token" };
    }
  }
  
  // Read data endpoint
  router.post("/api/data/:collection", authMiddleware, async (ctx: RouterContext<"/api/data/:collection">) => {
    try {
      const { collection } = ctx.params;
      const body = await ctx.request.body().value;
      const { filter = {} } = body;
      
      // Add collection and owner filters
      const query = {
        selector: {
          ...filter,
          type: "data",
          collection,
          owner: ctx.state.user.username
        }
      };
      
      // Query the database
      const result = await db.find(query);
      
      ctx.response.body = {
        docs: result.docs.map((doc: any) => {
          // Remove internal fields
          const { _id, _rev, type, owner, ...content } = doc;
          return content;
        })
      };
    } catch (error) {
      console.error("Data read error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });
  
  // Write data endpoint
  router.put("/api/data/:collection", authMiddleware, async (ctx: RouterContext<"/api/data/:collection">) => {
    try {
      const { collection } = ctx.params;
      const body = await ctx.request.body().value;
      const { doc } = body;
      
      if (!doc) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Document is required" };
        return;
      }
      
      // Handle array of documents
      if (Array.isArray(doc)) {
        const docs = doc.map((item: any) => ({
          _id: `data:${ctx.state.user.username}:${collection}:${item.id || uuid()}`,
          type: "data",
          owner: ctx.state.user.username,
          collection,
          ...item,
          created: item.created || new Date().toISOString(),
          updated: new Date().toISOString()
        }));
        
        const result = await db.bulkDocs(docs);
        ctx.response.body = { result };
      } else {
        // Handle single document
        const document = {
          _id: `data:${ctx.state.user.username}:${collection}:${doc.id || uuid()}`,
          type: "data",
          owner: ctx.state.user.username,
          collection,
          ...doc,
          created: doc.created || new Date().toISOString(),
          updated: new Date().toISOString()
        };
        
        const result = await db.put(document);
        ctx.response.body = { result };
      }
    } catch (error) {
      console.error("Data write error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });
  
  // Delete data endpoint
  router.delete("/api/data/:collection/:id", authMiddleware, async (ctx: RouterContext<"/api/data/:collection/:id">) => {
    try {
      const { collection, id } = ctx.params;
      const docId = `data:${ctx.state.user.username}:${collection}:${id}`;
      
      // Get the document first to verify ownership
      try {
        const doc = await db.get(docId);
        
        // Verify ownership
        if (doc.owner !== ctx.state.user.username) {
          ctx.response.status = 403;
          ctx.response.body = { error: "Access denied" };
          return;
        }
        
        // Delete the document
        const result = await db.remove(doc);
        ctx.response.body = { result };
      } catch (error) {
        ctx.response.status = 404;
        ctx.response.body = { error: "Document not found" };
      }
    } catch (error) {
      console.error("Data delete error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });
  
  return router;
}
