// server.ts
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import logger from "./utils/logger";
import signalingServer from "./services/signaling-server";
import turnService from "./services/turn-server";
import dbService from "./services/db-service";
import { generateChallenge, verifySignature } from "./utils/auth";

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Default route
app.get("/", (req, res) => {
    res.json({
        service: "vibe-cloud",
        status: "running",
        version: process.env.npm_package_version || "0.1.0",
    });
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "healthy" });
});

// TURN credentials route
app.post("/api/turn/credentials", (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }

        const ttl = req.body.ttl ? parseInt(req.body.ttl) : 86400; // Default to 24 hours
        const credentials = turnService.generateCredentials(userId, ttl);

        res.json(credentials);
    } catch (err) {
        logger.error("Error generating TURN credentials", { error: err });
        res.status(500).json({ error: "Failed to generate credentials" });
    }
});

// Server stats (protected endpoint in production)
app.get("/api/stats", (req, res) => {
    const stats = signalingServer.getStats();
    res.json({
        ...stats,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString(),
    });
});

// auth

app.post("/api/account/challenge", (req, res) => {
    try {
        const { did } = req.body;

        if (!did) {
            return res.status(400).json({ error: "DID is required" });
        }

        // Generate a challenge for this DID
        const challengeData = generateChallenge(did);

        // Return the challenge to the client
        res.json({
            success: true,
            challenge: challengeData.challenge,
            timestamp: challengeData.timestamp,
            expiresAt: challengeData.expiresAt,
        });
    } catch (error) {
        logger.error("Error generating challenge", { error, did: req.body.did });
        res.status(500).json({ error: "Failed to generate challenge" });
    }
});

app.post("/api/account/register", async (req, res) => {
    try {
        const { did, publicKey, signature, deviceId, deviceName } = req.body;
        console.log("Registering user with", "did:", did, "signature: ", signature, "DeviceId:", deviceId, "Device Name:", deviceName);

        if (!did || !publicKey || !signature || !deviceId) {
            const missingFields = [];
            if (!did) missingFields.push("did");
            if (!publicKey) missingFields.push("publicKey");
            if (!signature) missingFields.push("signature");
            if (!deviceId) missingFields.push("deviceId");
            return res.status(400).json({
                error: `Missing required fields: ${missingFields.join(", ")}`,
            });
        }

        // Verify the signature
        if (!verifySignature(did, publicKey, signature)) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        // Create user-specific database
        const dbName = did.toLowerCase().replace(/[^a-z0-9_$()+/-]/g, "");

        // Generate DB credentials
        const credentials = await dbService.createUserDatabase(dbName, did, deviceId, deviceName);

        res.json({
            success: true,
            credentials,
            serverInfo: {
                version: process.env.npm_package_version || "0.1.0",
                features: ["sync", "backup", "p2p"],
            },
        });
    } catch (error) {
        logger.error("Registration error", { error, did: req.body.did });
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post("/api/account/authenticate", async (req, res) => {
    try {
        const { did, publicKey, signature } = req.body;

        if (!did || !publicKey || !signature) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Verify the signature
        if (!verifySignature(did, publicKey, signature)) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        res.json({
            success: true,
            serverInfo: {
                version: process.env.npm_package_version || "0.1.0",
                status: "active",
            },
        });
    } catch (error) {
        logger.error("Authentication error", { error, did: req.body.did });
        res.status(500).json({ error: "Authentication failed" });
    }
});

// Initialize the signaling server
signalingServer.initialize(server);

// Start the TURN server
turnService.start();

// Start the HTTP server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, () => {
    logger.info(`Server running on ${HOST}:${PORT}`);
});

// Handle shutdown gracefully
const handleShutdown = () => {
    logger.info("Shutting down...");

    // Stop the TURN server
    turnService.stop();

    // Close the HTTP server
    server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
    }, 10000);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

export default server;
