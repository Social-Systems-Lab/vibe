// src/utils/logger.ts
// Determine if we are in the test environment
const isTest = process.env.NODE_ENV === "test";
// Check for an explicit verbose flag during tests (e.g., VERBOSE_TEST=true bun test)
const isVerboseTest = isTest && process.env.VERBOSE_TEST === "true";

// Define log levels (simple example)
const LogLevel = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
    SILENT: 100,
};

// Determine the current log level
// Default to INFO outside tests, ERROR inside tests (unless verbose)
let currentLogLevel = LogLevel.INFO;
let loggingDisabled = false; // Flag to disable logging
if (isTest && !isVerboseTest) {
    currentLogLevel = LogLevel.ERROR;
}
// Allow overriding with environment variable (e.g., LOG_LEVEL=debug bun run src/index.ts)
const envLogLevel = process.env.LOG_LEVEL?.toLowerCase();
if (envLogLevel === "debug") currentLogLevel = LogLevel.DEBUG;
if (envLogLevel === "info") currentLogLevel = LogLevel.INFO;
if (envLogLevel === "warn") currentLogLevel = LogLevel.WARN;
if (envLogLevel === "error") currentLogLevel = LogLevel.ERROR;
if (envLogLevel === "silent") currentLogLevel = LogLevel.SILENT;

export const disableLogging = () => {
    loggingDisabled = true;
};

export const enableLogging = () => {
    loggingDisabled = false;
};

export const logger = {
    debug: (...args: any[]) => {
        if (!loggingDisabled && currentLogLevel <= LogLevel.DEBUG) {
            console.debug("[DEBUG]", ...args);
        }
    },
    log: (...args: any[]) => {
        // Treat console.log as ERROR level
        if (!loggingDisabled && currentLogLevel <= LogLevel.ERROR) {
            // Optional: Add a prefix like [INFO] if desired
            console.log(...args);
        }
    },
    info: (...args: any[]) => {
        if (!loggingDisabled && currentLogLevel <= LogLevel.INFO) {
            console.info("[INFO]", ...args);
        }
    },
    warn: (...args: any[]) => {
        if (!loggingDisabled && currentLogLevel <= LogLevel.WARN) {
            console.warn("[WARN]", ...args);
        }
    },
    error: (...args: any[]) => {
        if (!loggingDisabled && currentLogLevel <= LogLevel.ERROR) {
            console.error("[ERROR]", ...args);
        }
    },
};

// Log the effective log level on startup (but not during silent tests)
if (!loggingDisabled && currentLogLevel < LogLevel.SILENT && !isTest) {
    logger.info(
        `Logger initialized with level: ${Object.keys(LogLevel).find((key) => LogLevel[key as keyof typeof LogLevel] === currentLogLevel) ?? currentLogLevel}`
    );
}
