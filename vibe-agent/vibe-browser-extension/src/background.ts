console.log("[BACKGROUND_SCRIPT_RESTORING_CODE] Service worker script has started."); // Keep top-level log
import { Buffer } from "buffer"; // Standard import
import * as Constants from "./background-modules/constants";
import * as Types from "./background-modules/types";
import * as TokenManager from "./background-modules/token-manager";
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

import {
    generateMnemonic,
    generateSalt,
    deriveEncryptionKey,
    encryptData,
    seedFromMnemonic,
    getMasterHDKeyFromSeed,
    deriveChildKeyPair,
    wipeMemory,
    decryptData,
    validateMnemonic,
    signMessage,
} from "./lib/crypto";
import { didFromEd25519 } from "./lib/identity";

console.log("Vibe Background Service Worker started.");

EventListeners.registerEventListeners();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && typeof message === "object" && message.type === "VIBE_AGENT_REQUEST" && message.action) {
        // Delegate to the new message handler
        MessageHandler.handleMessage(message, sender, sendResponse);
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
    return false;
});

console.log("Vibe Background Service Worker listeners attached.");
