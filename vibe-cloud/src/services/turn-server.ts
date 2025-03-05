import dotenv from 'dotenv';
import crypto from 'crypto';
import logger from '../utils/logger';

dotenv.config();

const TURN_PORT = parseInt(process.env.TURN_PORT || '3478');
const TURN_PORT_TLS = parseInt(process.env.TURN_PORT_TLS || '5349');
const TURN_REALM = process.env.TURN_REALM || 'vibe.local';
const TURN_AUTH_SECRET = process.env.TURN_AUTH_SECRET || 'default-secret-key';
const COTURN_HOST = process.env.COTURN_HOST || 'localhost';

class TurnService {
    constructor() {
        logger.info(`Using Coturn server at ${COTURN_HOST}:${TURN_PORT}`);
    }

    /**
     * Generate time-limited TURN credentials for Coturn
     * Using the TURN REST API credential mechanism (RFC 7635)
     * 
     * @param username A unique identifier for the user (can be their userId)
     * @param ttl Time-to-live in seconds (default: 86400 = 24 hours)
     * @returns Object containing username, credential, and TTL
     */
    generateCredentials(username: string, ttl: number = 86400): { 
        username: string;
        credential: string;
        ttl: number;
        urls: string[];
    } {
        // Create time-limited username
        const expiresAt = Math.floor(Date.now() / 1000) + ttl;
        const timeUsername = `${expiresAt}:${username}`;
        
        // Create HMAC based on the time-limited username and our secret
        const hmac = crypto.createHmac('sha1', TURN_AUTH_SECRET);
        hmac.update(timeUsername);
        const credential = hmac.digest('base64');
        
        logger.debug(`Generated TURN credentials for ${username} valid for ${ttl} seconds`);
        
        // Create a list of TURN server URLs
        const urls = [
            `turn:${COTURN_HOST}:${TURN_PORT}`,
            `turn:${COTURN_HOST}:${TURN_PORT}?transport=tcp`,
            `turns:${COTURN_HOST}:${TURN_PORT_TLS}`
        ];
        
        return {
            username: timeUsername,
            credential,
            ttl,
            urls
        };
    }

    /**
     * Verify if the given credentials are valid for the TURN server
     * This can be used for testing or verification purposes
     */
    verifyCredentials(username: string, credential: string): boolean {
        try {
            // Parse the username which should be in format timestamp:userId
            const parts = username.split(':');
            if (parts.length !== 2) {
                return false;
            }
            
            const expiry = parseInt(parts[0]);
            const actualUsername = parts[1];
            
            // Check if the credentials are expired
            if (expiry < Math.floor(Date.now() / 1000)) {
                logger.debug(`Expired TURN credentials for ${actualUsername}`);
                return false;
            }
            
            // Generate the expected credential
            const hmac = crypto.createHmac('sha1', TURN_AUTH_SECRET);
            hmac.update(username);
            const expectedCredential = hmac.digest('base64');
            
            // Check if the credentials match
            return credential === expectedCredential;
        } catch (err) {
            logger.error('Error verifying TURN credentials', { error: err });
            return false;
        }
    }

    /**
     * With Coturn as a separate service, we don't need to start/stop it from here.
     * These methods are kept for API compatibility.
     */
    start(): void {
        logger.info(`Using external Coturn server at ${COTURN_HOST}:${TURN_PORT}`);
    }

    stop(): void {
        logger.info('TURN service shutdown');
    }
}

export const turnService = new TurnService();
export default turnService;