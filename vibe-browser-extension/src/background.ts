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

// Listener for messages from content scripts (originating from window.vibe) or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background script received message:", message, "from sender:", sender);

    if (message.type === "VIBE_AGENT_REQUEST" && message.action) {
        const { action, payload, requestId } = message;
        const origin = sender.origin || (sender.tab && sender.tab.url ? new URL(sender.tab.url).origin : "unknown_origin");

        console.log(`Action: ${action}, Origin: ${origin}, Payload:`, payload);

        // Simulate async processing
        (async () => {
            try {
                let responsePayload: any;
                // TODO: Implement actual logic for each action
                switch (action) {
                    case "init":
                        // Placeholder: Simulate successful initialization
                        // In reality: check permissions, maybe show consent, get/store JWT
                        console.log(`Processing 'init' for app: ${payload?.name} from ${origin}`);
                        // TODO: Get actual active DID
                        const activeDid = "did:vibe:placeholder_active_did";
                        // TODO: Get actual granted permissions for this origin and DID
                        const grantedPermissions = { "profile:read": "always" };
                        responsePayload = {
                            did: activeDid,
                            permissions: grantedPermissions,
                            message: `Successfully initialized with ${payload?.name}. Active DID: ${activeDid}`,
                        };
                        break;
                    case "readOnce":
                        console.log(`Processing 'readOnce' for collection: ${payload?.collection} from ${origin}`);
                        // TODO: Permission check, fetch from Vibe Cloud
                        responsePayload = { data: { message: `Data for ${payload?.collection} would be here.` }, success: true };
                        break;
                    case "write":
                        console.log(`Processing 'write' for collection: ${payload?.collection} from ${origin} with data:`, payload?.data);
                        // TODO: Permission check, send to Vibe Cloud
                        responsePayload = { success: true, id: "mock_document_id_123" };
                        break;
                    default:
                        console.warn(`Unknown action: ${action}`);
                        sendResponse({ type: "VIBE_AGENT_RESPONSE_ERROR", requestId, error: { message: `Unknown action: ${action}` } });
                        return;
                }
                sendResponse({ type: "VIBE_AGENT_RESPONSE", requestId, payload: responsePayload });
            } catch (error: any) {
                console.error(`Error processing action ${action}:`, error);
                sendResponse({ type: "VIBE_AGENT_RESPONSE_ERROR", requestId, error: { message: error.message || "Unknown error occurred" } });
            }
        })();

        return true; // Indicates that sendResponse will be called asynchronously
    } else {
        // Handle other types of messages if necessary (e.g., from popup)
        console.log("Received non-agent request or message without action:", message);
        // If not handling this message type or not sending an async response:
        // sendResponse({ status: "unhandled_message_type" }); // Optional: send a synchronous response
    }
    // Return false if not sending an asynchronous response from this top-level path
    return false;
});

console.log("Vibe Background Service Worker listeners attached.");
