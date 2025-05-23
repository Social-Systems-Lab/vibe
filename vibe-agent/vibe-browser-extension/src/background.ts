console.log("[BACKGROUND_SCRIPT_RESTORING_CODE] Service worker script has started."); // Keep top-level log
import { Buffer } from "buffer"; // Standard import
import * as Constants from "./background-modules/constants";
import * as SessionManager from "./background-modules/session-manager";
import * as EventListeners from "./background-modules/event-listeners";
import * as MessageHandler from "./background-modules/message-handler"; // Added this import

// Explicitly make Buffer available on self, for environments where it might be needed globally.
if (typeof self !== "undefined" && typeof (self as any).Buffer === "undefined") {
    console.log("[BACKGROUND_SCRIPT_BUFFER_POLYFILL] Assigning imported Buffer to self.Buffer");
    (self as any).Buffer = Buffer;
} else if (typeof self !== "undefined") {
    console.log("[BACKGROUND_SCRIPT_BUFFER_POLYFILL] self.Buffer already exists or self is defined.");
} else {
    console.log("[BACKGROUND_SCRIPT_BUFFER_POLYFILL] self is not defined. Cannot assign Buffer to self.Buffer.");
}

console.log("Vibe Background Service Worker started.");

import * as PouchDBManager from "./lib/pouchdb"; // Import PouchDBManager

// Initialize SessionManager to load persisted active DID
(async () => {
    try {
        await SessionManager.initializeSessionManager();
        if (SessionManager.currentActiveDid) {
            console.log(`[BACKGROUND_SCRIPT] Attempting to initialize PouchDB sync for active DID: ${SessionManager.currentActiveDid} on startup.`);
            // Password is not available at startup, so pass undefined.
            // initializeSync will try to use stored (if decryptable without password, unlikely) or fetch live.
            PouchDBManager.initializeSync(SessionManager.currentActiveDid, undefined).catch((err) =>
                console.error(`[BACKGROUND_SCRIPT] Error initializing PouchDB sync on startup for ${SessionManager.currentActiveDid}:`, err)
            );
        } else {
            console.log("[BACKGROUND_SCRIPT] No active DID found on startup, skipping PouchDB sync initialization.");
        }
    } catch (error) {
        console.error("[BACKGROUND_SCRIPT] Error during SessionManager or PouchDB initialization on startup:", error);
    }
})();

EventListeners.registerEventListeners();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && typeof message === "object" && message.type === "VIBE_AGENT_REQUEST" && message.action) {
        if (message.action === "USER_CLICKED_CONSENT_POPOVER") {
            // Attempt to open side panel immediately in response to user gesture
            if (sender.tab && sender.tab.id) {
                // Check both sender.tab and sender.tab.id
                const tabId = sender.tab.id; // Assign to a new const
                chrome.sidePanel
                    .open({ tabId: tabId }) // Use the new const
                    .then(() => console.log(`[BG] Side panel open triggered for tab ${tabId} by USER_CLICKED_CONSENT_POPOVER.`))
                    .catch((err) => console.error(`[BG] Error opening side panel for USER_CLICKED_CONSENT_POPOVER on tab ${tabId}:`, err));
            } else {
                console.error("[BG] USER_CLICKED_CONSENT_POPOVER: sender.tab or sender.tab.id is undefined. Cannot trigger side panel open.");
            }
            // Regardless of side panel success/failure, proceed to MessageHandler for data processing & response.
            // MessageHandler will call sendResponse.
            MessageHandler.handleMessage(message, sender, sendResponse);
        } else {
            // For other VIBE_AGENT_REQUEST actions
            MessageHandler.handleMessage(message, sender, sendResponse);
        }
        return true; // Crucial for asynchronous sendResponse from MessageHandler for all VIBE_AGENT_REQUEST types
    } else if (message && typeof message === "object" && message.type === "SHOW_VIBE_PROFILE") {
        console.log("Background: Received SHOW_VIBE_PROFILE for", message.payload);
        (async () => {
            try {
                if (sender.tab && sender.tab.windowId) {
                    await chrome.sidePanel.open({ windowId: sender.tab.windowId });
                    // Send a message to the side panel to display the profile
                    // This assumes the side panel is listening for "DISPLAY_MOCKED_PROFILE"
                    await chrome.runtime.sendMessage({
                        type: "DISPLAY_MOCKED_PROFILE",
                        payload: {
                            username: message.payload.username,
                            site: message.payload.site,
                            mockBio: `This is a mocked Vibe user profile for ${message.payload.username} on ${message.payload.site}.`,
                            mockAvatar: chrome.runtime.getURL("icon-dev.png"), // Use the extension icon as a placeholder
                            // Add other dummy data as needed
                        },
                    });
                    sendResponse({ success: true, message: "Side panel opened and profile display requested." });
                } else {
                    console.error("Background: Cannot open side panel, sender.tab.windowId is missing.");
                    sendResponse({ success: false, error: "Missing tab context to open side panel." });
                }
            } catch (error: any) {
                console.error("Background: Error handling SHOW_VIBE_PROFILE:", error);
                sendResponse({ success: false, error: { message: error.message || "Unknown error opening side panel or sending profile data." } });
            }
        })();
        return true; // Crucial for asynchronous sendResponse
    } else if (message && typeof message === "object" && message.type === "MARK_SETUP_COMPLETE") {
        // Handle MARK_SETUP_COMPLETE separately as before
        (async () => {
            try {
                await chrome.storage.local.set({ [Constants.STORAGE_KEY_SETUP_COMPLETE]: true });
                sendResponse({ success: true });
                if (sender.tab && sender.tab.id && sender.tab.url?.includes(Constants.SETUP_URL)) {
                    chrome.tabs.remove(sender.tab.id);
                }
            } catch (error: any) {
                sendResponse({ success: false, error: { message: error.message || "Unknown error" } });
            }
        })();
        return true; // Crucial for asynchronous sendResponse
    }
    // If the message is not handled by the above conditions,
    // it's good practice to return false or undefined.
    // The original code implicitly returned undefined for unhandled messages.
    // return false; // Let's be explicit about not handling if it falls through

    // Handle INSTANCE_READY_FOR_SYNC notification
    if (message && typeof message === "object" && message.type === "VIBE_INTERNAL_NOTIFICATION" && message.action === "INSTANCE_READY_FOR_SYNC") {
        const { did } = message.payload;
        if (did && SessionManager.currentActiveDid === did) {
            // Check if it's for the currently active DID
            if (SessionManager.isUnlocked) {
                const decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
                if (decryptedSeed) {
                    console.log(`[BG] INSTANCE_READY_FOR_SYNC for ${did}: Vault unlocked. Initializing PouchDB sync with password.`);
                    PouchDBManager.initializeSync(did, decryptedSeed).catch((err) =>
                        console.error(`[BG] Error initializing PouchDB sync for ${did} (with password) after INSTANCE_READY_FOR_SYNC:`, err)
                    );
                } else {
                    // This case should ideally not happen if isUnlocked is true, but as a fallback:
                    console.warn(
                        `[BG] INSTANCE_READY_FOR_SYNC for ${did}: Vault unlocked but no in-memory seed. Attempting sync without password (live credentials only).`
                    );
                    PouchDBManager.initializeSync(did, undefined).catch((err) =>
                        console.error(`[BG] Error initializing PouchDB sync for ${did} (no password, post-unlock anomaly) after INSTANCE_READY_FOR_SYNC:`, err)
                    );
                }
            } else {
                // Vault is locked, but instance is ready. Attempt sync using live credentials (will not be stored encrypted).
                console.log(`[BG] INSTANCE_READY_FOR_SYNC for ${did}: Vault locked. Attempting PouchDB sync without password (live credentials only).`);
                PouchDBManager.initializeSync(did, undefined).catch((err) =>
                    console.error(`[BG] Error initializing PouchDB sync for ${did} (no password, vault locked) after INSTANCE_READY_FOR_SYNC:`, err)
                );
            }
        } else {
            console.log(
                `[BG] Received INSTANCE_READY_FOR_SYNC for ${did}, but it's not the current active DID (${SessionManager.currentActiveDid}). Sync not initiated by this event.`
            );
        }
        // This is a notification, no response needed to sender.
        return false; // Or undefined
    }
    return false; // Default for unhandled messages
});

console.log("Vibe Background Service Worker listeners attached.");
