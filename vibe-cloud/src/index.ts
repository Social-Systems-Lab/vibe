// index.ts
import server from "./server";
import logger from "./utils/logger";

// Just re-export the server for direct usage
export default server;

logger.info("Vibe Cloud Server initialized");
