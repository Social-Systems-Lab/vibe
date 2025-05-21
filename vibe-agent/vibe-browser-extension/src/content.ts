// Vibe Browser Extension - Content Script
import { BlueSkyProcessor } from "./site-processors/BlueSkyProcessor";
import { GenericProcessor } from "./site-processors/GenericProcessor";
import type { SiteProcessor } from "./site-processors/SiteProcessor";

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
    // Handle SHOW_CONSENT_PROMPT
    if (message.type === "SHOW_CONSENT_PROMPT" && message.payload) {
        console.log("Content script received SHOW_CONSENT_PROMPT:", message.payload);
        showConsentPopover(
            message.payload.appName,
            message.payload.appIconUrl,
            message.payload.origin,
            message.payload.appId,
            message.payload.requestedPermissions // Pass requestedPermissions
        );
        return false; // No async response needed
    }
    return false; // Indicate that sendResponse will not be called asynchronously here for other messages
});

const POPOVER_ID = "vibe-consent-popover";

function removeExistingPopover() {
    const existingPopover = document.getElementById(POPOVER_ID);
    if (existingPopover) {
        existingPopover.remove();
    }
}

function showConsentPopover(appName?: string, appIconUrl?: string, origin?: string, appId?: string, requestedPermissions?: string[]) {
    removeExistingPopover(); // Remove any existing popover first

    if (!appName || !origin || !appId || !requestedPermissions) {
        // Added check for requestedPermissions
        console.warn("Vibe: Insufficient data to show consent popover.", { appName, origin, appId, requestedPermissions });
        return;
    }

    const popover = document.createElement("div");
    popover.id = POPOVER_ID;
    popover.style.position = "fixed";
    popover.style.top = "20px";
    popover.style.right = "20px";
    popover.style.padding = "15px";
    popover.style.backgroundColor = "white";
    popover.style.border = "1px solid #ccc";
    popover.style.borderRadius = "8px";
    popover.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    popover.style.zIndex = "2147483647"; // Max z-index
    popover.style.fontFamily = "Arial, sans-serif";
    popover.style.fontSize = "14px";
    popover.style.color = "#333";
    popover.style.display = "flex";
    popover.style.alignItems = "center";
    popover.style.gap = "10px";

    let contentHTML = "";
    if (appIconUrl) {
        contentHTML += `<img src="${appIconUrl}" alt="${appName} icon" style="width: 32px; height: 32px; border-radius: 4px;" />`;
    }
    contentHTML += `
        <div style="display: flex; flex-direction: column;">
            <strong style="font-size: 15px;">${appName}</strong>
            <span style="font-size: 12px; color: #555;">wants to connect with your Vibe</span>
        </div>
    `;

    const textContainer = document.createElement("div");
    textContainer.innerHTML = contentHTML;
    textContainer.style.flexGrow = "1";

    const button = document.createElement("button");
    button.textContent = "Review";
    button.style.padding = "8px 12px";
    button.style.border = "none";
    button.style.backgroundColor = "#007bff";
    button.style.color = "white";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.fontSize = "14px";

    button.onclick = () => {
        console.log("Vibe: Consent popover 'Review' button clicked.");
        chrome.runtime.sendMessage({
            type: "USER_CLICKED_CONSENT_POPOVER",
            payload: { appName, origin, appId, appIconUrl, requestedPermissions }, // Pass necessary info, including requestedPermissions
        });
        removeExistingPopover(); // Remove popover after click
    };

    const closeButton = document.createElement("button");
    closeButton.textContent = "✕";
    closeButton.style.background = "none";
    closeButton.style.border = "none";
    closeButton.style.color = "#aaa";
    closeButton.style.fontSize = "16px";
    closeButton.style.cursor = "pointer";
    closeButton.style.marginLeft = "10px";
    closeButton.style.padding = "0 5px";

    closeButton.onclick = () => {
        console.log("Vibe: Consent popover 'Close' button clicked.");
        // Optionally, send a message to background if needed, e.g., user dismissed
        // chrome.runtime.sendMessage({ type: "USER_DISMISSED_CONSENT_POPOVER", payload: { appId, origin } });
        removeExistingPopover();
    };

    popover.appendChild(textContainer);
    popover.appendChild(button);
    popover.appendChild(closeButton);

    document.body.appendChild(popover);
    console.log(`Vibe: Displayed consent popover for ${appName}.`);
}

// --- Vibe Icon Injection Logic ---

function initializeVibeFeatures() {
    console.log("Vibe: Initializing Vibe features on page.");
    let processor: SiteProcessor | null = null;

    const blueSkyProcessor = new BlueSkyProcessor();
    if (blueSkyProcessor.isCurrentSite()) {
        processor = blueSkyProcessor;
        console.log("Vibe: BlueSky site detected. Using BlueSkyProcessor.");
    } else {
        // Fallback to generic processor if no specific site is matched.
        // For now, GenericProcessor is a no-op, but it could have default behaviors.
        processor = new GenericProcessor();
        // console.log("Vibe: No specific site detected. Using GenericProcessor.");
    }

    if (processor) {
        try {
            processor.scanForHandles();
        } catch (error) {
            console.error("Vibe: Error during handle scanning:", error);
        }
    }

    // TODO: Implement MutationObserver to re-scan for handles when the DOM changes.
    // This is crucial for single-page applications (SPAs) and dynamic content.
    // const observer = new MutationObserver((mutationsList, observer) => {
    //     if (processor) {
    //         console.log("Vibe: DOM changed, re-scanning for handles.");
    //         processor.scanForHandles();
    //     }
    // });
    // observer.observe(document.body, { childList: true, subtree: true });
}

// Run the Vibe feature initialization logic
// We can run it once the document is idle, or with a small delay
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeVibeFeatures);
} else {
    // DOMContentLoaded has already fired
    initializeVibeFeatures();
}

// Alternative: Run after a short delay to give the page more time to load dynamic content initially
setTimeout(() => {
    console.log("Vibe: Running initializeVibeFeatures after delay.");
    initializeVibeFeatures();
}, 2000); // Adjust delay as needed. This is a temporary measure for dynamic content.

console.log("Vibe: Content script Vibe feature initialization queued/run.");
