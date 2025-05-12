// Basic logger implementation
// TODO: Enhance with levels, formatting, potential external logging service integration

const getTimestamp = (): string => new Date().toISOString();

export const logger = {
    info: (...args: any[]) => {
        console.log(`[${getTimestamp()}] [INFO]`, ...args);
    },
    warn: (...args: any[]) => {
        console.warn(`[${getTimestamp()}] [WARN]`, ...args);
    },
    error: (...args: any[]) => {
        console.error(`[${getTimestamp()}] [ERROR]`, ...args);
    },
    debug: (...args: any[]) => {
        // Only log debug messages if NODE_ENV is 'development' or similar
        if (process.env.NODE_ENV === "development") {
            console.debug(`[${getTimestamp()}] [DEBUG]`, ...args);
        }
    },
};
