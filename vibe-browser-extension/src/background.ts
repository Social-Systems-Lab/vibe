// Vibe Browser Extension - Background Service Worker

console.log("Vibe Background Service Worker started.");

// --- Constants ---
const SETUP_URL = chrome.runtime.getURL("setup.html");
const STORAGE_KEY_SETUP_COMPLETE = "isSetupComplete";

// --- Event Listeners ---

/**
 * Opens the setup page in a new tab if the extension has just been installed
 * and setup is not marked as complete.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        console.log("Vibe extension installed.");

        // Check if setup is already complete (e.g., from a previous partial install)
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY_SETUP_COMPLETE);
            if (!result[STORAGE_KEY_SETUP_COMPLETE]) {
                console.log("Setup not complete, opening setup page:", SETUP_URL);
                // Open the setup page in a new tab
                await chrome.tabs.create({ url: SETUP_URL });
            } else {
                console.log("Setup already marked as complete.");
            }
        } catch (error) {
            console.error("Error checking setup status:", error);
            // Fallback: try opening setup page anyway if storage check fails
            try {
                await chrome.tabs.create({ url: SETUP_URL });
            } catch (tabError) {
                console.error("Error opening setup tab:", tabError);
            }
        }
    } else if (details.reason === "update") {
        console.log("Vibe extension updated to version:", chrome.runtime.getManifest().version);
        // Handle updates if needed in the future
    }
});

// --- Other Background Logic (to be added later) ---

// Example: Listener for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message, "from sender:", sender);
    // Handle messages based on message.action or similar
    // Example: if (message.action === "getSomething") { ... }
    // Remember to return true for async sendResponse:
    // return true;
});

console.log("Vibe Background Service Worker listeners attached.");
