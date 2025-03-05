import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import logger from './utils/logger';
import signalingServer from './services/signaling-server';
import turnService from './services/turn-server';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Default route
app.get('/', (req, res) => {
    res.json({ 
        service: 'vibe-cloud', 
        status: 'running',
        version: process.env.npm_package_version || '0.1.0'
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// TURN credentials route
app.post('/api/turn/credentials', (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const ttl = req.body.ttl ? parseInt(req.body.ttl) : 86400; // Default to 24 hours
        const credentials = turnService.generateCredentials(userId, ttl);
        
        res.json(credentials);
    } catch (err) {
        logger.error('Error generating TURN credentials', { error: err });
        res.status(500).json({ error: 'Failed to generate credentials' });
    }
});

// Server stats (protected endpoint in production)
app.get('/api/stats', (req, res) => {
    const stats = signalingServer.getStats();
    res.json({
        ...stats,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Initialize the signaling server
signalingServer.initialize(server);

// Start the TURN server
turnService.start();

// Start the HTTP server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, () => {
    logger.info(`Server running on ${HOST}:${PORT}`);
});

// Handle shutdown gracefully
const handleShutdown = () => {
    logger.info('Shutting down...');
    
    // Stop the TURN server
    turnService.stop();
    
    // Close the HTTP server
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
    
    // Force exit after timeout
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

export default server;