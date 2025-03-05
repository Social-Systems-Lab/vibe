import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

const logLevel = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'vibe-cloud' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [${level}]: ${message} ${
                        Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
                    }`;
                })
            ),
        }),
    ],
});

// Add file logging in production
if (process.env.NODE_ENV === 'production') {
    logger.add(
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error' 
        })
    );
    logger.add(
        new winston.transports.File({ 
            filename: 'logs/combined.log' 
        })
    );
}

export default logger;