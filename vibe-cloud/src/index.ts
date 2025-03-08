// index.ts
import server from "./server";
import logger from "./utils/logger";

// Export the services and types for SDK usage
export * from "./services/signaling-server";
export * from "./services/turn-server";

// Export client SDK
export * from "./client";
export { default as WebRTCPeer } from "./client/webrtc-peer";

// Just re-export the server for direct usage
export default server;

logger.info("Vibe Cloud Server initialized");
