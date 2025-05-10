// Vibe Browser Extension - Content Script

/**
 * Injects the vibe-inpage.js script into the page's main world.
 * This allows web pages to access the window.vibe API.
 */
function injectScript(filePath: string, tag: string) {
    const node = document.head || document.documentElement;
    const script = document.createElement("script");
    script.setAttribute("type", "text/javascript");
    script.setAttribute("src", filePath);
    script.setAttribute("id", "vibe-inpage-script"); // Add an ID for easy identification
    node.appendChild(script);
    console.log(`Vibe: Injected ${filePath} into page.`);
}

// Inject the inpage script
// The path must match what's in web_accessible_resources and how the build places it.
// Assuming vibe-inpage.js will be at the root of the extension build output.
injectScript(chrome.runtime.getURL("vibe-inpage.js"), "body");

// Listen for messages from the injected script (window.vibe)
window.addEventListener(
    "message",
    (event) => {
        // We only accept messages from ourselves
        if (event.source !== window) {
            return;
        }

        if (event.data.type && event.data.type.startsWith("VIBE_AGENT_REQUEST")) {
            console.log("Content script received VIBE_AGENT_REQUEST:", event.data);
            // Forward the request to the background script
            chrome.runtime.sendMessage(event.data, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Content script error sending message to background or receiving response:", chrome.runtime.lastError);
                    // Optionally, post a message back to the page if there's an error
                    window.postMessage({ type: "VIBE_AGENT_RESPONSE_ERROR", requestId: event.data.requestId, error: chrome.runtime.lastError.message }, "*");
                    return;
                }
                console.log("Content script received response from background:", response);
                // Forward the response back to the injected script (window.vibe)
                window.postMessage(response, "*");
            });
        }
    },
    false
);

console.log("Vibe Content Script loaded and listener attached.");

// To handle responses from the background script for async operations initiated by the page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Check if the message is intended for the page (e.g. an event from the agent)
    if (message.type && message.type.startsWith("VIBE_PAGE_EVENT")) {
        console.log("Content script received VIBE_PAGE_EVENT from background:", message);
        window.postMessage(message, "*");
        // sendResponse({}); // Acknowledge if needed, or handle synchronously
        return false; // No further async response from content script for this type
    }
    // If it's a response to a request initiated by the page, it's handled by the callback in the sendMessage above.
    // This listener is more for unsolicited messages from background to page.
    return false; // Indicate that sendResponse will not be called asynchronously here
});
