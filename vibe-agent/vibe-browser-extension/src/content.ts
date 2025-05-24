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

let sdkPort: chrome.runtime.Port | null = null;

function ensureSdkPortConnected() {
    if (!sdkPort) {
        console.log("Content script: Connecting to background script for Vibe SDK.");
        sdkPort = chrome.runtime.connect({ name: "vibe-sdk-port" }); // Use constant if available, or hardcode for now

        sdkPort.onMessage.addListener((message) => {
            // Messages from background (responses or subscription updates)
            console.log("Content script received message from background via port:", message);
            // Forward to the inpage script
            window.postMessage(message, "*");
        });

        sdkPort.onDisconnect.addListener(() => {
            console.error("Content script: Vibe SDK port disconnected from background.");
            sdkPort = null;
            // Optionally, notify the inpage script about the disconnection
            window.postMessage({ type: "VIBE_SDK_DISCONNECTED" }, "*");
        });
    }
}

// Ensure port is connected early, e.g., on script load or first message
ensureSdkPortConnected();

// Listen for messages from the injected script (window.vibe)
window.addEventListener(
    "message",
    (event) => {
        // We only accept messages from ourselves
        if (event.source !== window) {
            return;
        }

        if (event.data.type && event.data.type.startsWith("VIBE_AGENT_REQUEST")) {
            console.log("Content script received VIBE_AGENT_REQUEST from inpage:", event.data);
            ensureSdkPortConnected(); // Ensure port is active
            if (sdkPort) {
                try {
                    sdkPort.postMessage(event.data);
                } catch (e) {
                    console.error("Content script: Error posting message to background via port:", e);
                    // If postMessage fails, port might be disconnected. Try to reconnect.
                    sdkPort = null; // Mark as disconnected
                    ensureSdkPortConnected(); // Attempt to reconnect
                    if (sdkPort) {
                        // Re-check sdkPort after ensureSdkPortConnected
                        try {
                            // @ts-ignore TS an be overly cautious with type narrowing in catch blocks after re-assignment
                            sdkPort.postMessage(event.data);
                        } catch (e2) {
                            console.error("Content script: Error posting message to background via port (after reconnect attempt):", e2);
                            window.postMessage(
                                {
                                    type: "VIBE_AGENT_RESPONSE_ERROR",
                                    requestId: event.data.requestId,
                                    error: { message: "Failed to communicate with Vibe Agent background after reconnect." },
                                },
                                "*"
                            );
                        }
                    } else {
                        console.error("Content script: SDK port still not connected after reconnect attempt.");
                        window.postMessage(
                            {
                                type: "VIBE_AGENT_RESPONSE_ERROR",
                                requestId: event.data.requestId,
                                error: { message: "Vibe Agent background port disconnected, reconnect failed." },
                            },
                            "*"
                        );
                    }
                }
            } else {
                console.error("Content script: SDK port not connected. Cannot forward VIBE_AGENT_REQUEST.");
                // Send error back to inpage
                window.postMessage(
                    { type: "VIBE_AGENT_RESPONSE_ERROR", requestId: event.data.requestId, error: { message: "Vibe Agent not connected." } },
                    "*"
                );
            }
        }
    },
    false
);

console.log("Vibe Content Script loaded and listeners attached.");

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
            message.payload.requestedPermissions,
            message.payload.activeIdentityForPopover, // Pass the active identity details
            message.payload.consentRequestId // Pass the consentRequestId
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

function showConsentPopover(
    appName?: string,
    appIconUrl?: string,
    origin?: string,
    appId?: string,
    requestedPermissions?: string[],
    activeIdentity?: { label: string; did: string; pictureUrl?: string } | null,
    consentRequestId?: string
) {
    removeExistingPopover(); // Remove any existing popover first

    const identityName = activeIdentity?.label || "Current User"; // Default if no identity passed
    const identityDid = activeIdentity?.did || "";
    const identityPictureUrl = activeIdentity?.pictureUrl;

    if (!activeIdentity) {
        console.warn("Vibe: Active identity not provided for consent popover. Using defaults.");
    }
    if (!consentRequestId) {
        console.error("Vibe: consentRequestId is missing. Cannot proceed with consent popover.");
        // Optionally, show an error to the user or just don't render the popover.
        // For now, returning to prevent rendering a broken popover.
        return;
    }

    if (!appName || !origin || !appId || !requestedPermissions) {
        console.warn("Vibe: Insufficient app data to show consent popover.", { appName, origin, appId, requestedPermissions, consentRequestId });
        return;
    }

    const popover = document.createElement("div");
    popover.id = POPOVER_ID;
    // General popover styling
    popover.style.position = "fixed";
    popover.style.top = "20px";
    popover.style.right = "20px";
    popover.style.width = "360px"; // Fixed width for better layout control
    popover.style.padding = "16px";
    popover.style.backgroundColor = "white";
    popover.style.border = "1px solid #e0e0e0";
    popover.style.borderRadius = "12px";
    popover.style.boxShadow = "0 6px 16px rgba(0,0,0,0.12)";
    popover.style.zIndex = "2147483647";
    popover.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"; // Modern font
    popover.style.fontSize = "14px";
    popover.style.color = "#202124"; // Google's default text color
    popover.style.display = "flex";
    popover.style.flexDirection = "column"; // Changed to column for rows
    popover.style.gap = "0px"; // Will control gap with margins

    // --- Header Row ---
    const headerRow = document.createElement("div");
    headerRow.style.display = "flex";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.alignItems = "center";
    headerRow.style.width = "100%";
    headerRow.style.marginBottom = "16px";

    const appInfo = document.createElement("div");
    appInfo.style.display = "flex";
    appInfo.style.alignItems = "center";
    appInfo.style.gap = "10px";

    if (appIconUrl) {
        const appIconImg = document.createElement("img");
        appIconImg.src = appIconUrl;
        appIconImg.alt = `${appName} icon`;
        appIconImg.style.width = "24px"; // Slightly smaller icon for header
        appIconImg.style.height = "24px";
        appIconImg.style.borderRadius = "4px";
        appInfo.appendChild(appIconImg);
    }

    const appNameSpan = document.createElement("span");
    appNameSpan.style.fontWeight = "500"; // Medium weight
    appNameSpan.style.fontSize = "15px";
    appNameSpan.innerHTML = `<strong style="color: #1a73e8;">${appName}</strong> wants to connect with your Vibe`;
    appInfo.appendChild(appNameSpan);

    const closeButton = document.createElement("button");
    closeButton.textContent = "✕";
    closeButton.style.background = "none";
    closeButton.style.border = "none";
    closeButton.style.color = "#5f6368"; // Google's icon color
    closeButton.style.fontSize = "18px";
    closeButton.style.cursor = "pointer";
    closeButton.style.padding = "4px";
    closeButton.style.lineHeight = "1";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.onmouseover = () => (closeButton.style.color = "#202124");
    closeButton.onmouseout = () => (closeButton.style.color = "#5f6368");
    closeButton.onclick = () => {
        console.log("Vibe: Consent popover 'Close' button clicked.");
        removeExistingPopover();
    };

    headerRow.appendChild(appInfo);
    headerRow.appendChild(closeButton);
    popover.appendChild(headerRow);

    // --- Identity Row ---
    const identityRow = document.createElement("div");
    identityRow.style.display = "flex";
    identityRow.style.alignItems = "center";
    identityRow.style.gap = "12px";
    identityRow.style.width = "100%";
    identityRow.style.padding = "12px 0"; // Padding top and bottom
    identityRow.style.borderTop = "1px solid #e0e0e0";
    identityRow.style.borderBottom = "1px solid #e0e0e0";
    identityRow.style.marginBottom = "16px";

    const identityPictureImg = document.createElement("img");
    identityPictureImg.src =
        identityPictureUrl ||
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='%23ddd'/%3E%3C/svg%3E"; // Default placeholder
    identityPictureImg.alt = `${identityName} picture`;
    identityPictureImg.style.width = "40px";
    identityPictureImg.style.height = "40px";
    identityPictureImg.style.borderRadius = "50%";
    identityPictureImg.style.objectFit = "cover"; // Ensure image covers the circle
    identityRow.appendChild(identityPictureImg);

    const identityDetailsDiv = document.createElement("div");
    identityDetailsDiv.style.display = "flex";
    identityDetailsDiv.style.flexDirection = "column";
    identityDetailsDiv.style.justifyContent = "center";

    const identityNameSpan = document.createElement("span");
    identityNameSpan.textContent = identityName;
    identityNameSpan.style.fontWeight = "bold";
    identityNameSpan.style.fontSize = "16px";
    identityNameSpan.style.color = "#202124";
    identityDetailsDiv.appendChild(identityNameSpan);

    const shortDid = identityDid ? `did:..${identityDid.slice(-7)}` : "No DID available";
    const identityDidSpan = document.createElement("span");
    identityDidSpan.textContent = shortDid;
    identityDidSpan.style.fontSize = "12px";
    identityDidSpan.style.color = "#5f6368";
    identityDetailsDiv.appendChild(identityDidSpan);

    identityRow.appendChild(identityDetailsDiv);
    popover.appendChild(identityRow);

    // --- Continue Button Row ---
    const continueButton = document.createElement("button");
    // continueButton.textContent = `Continue as ${identityName.split(" ")[0]}`; // Use first name
    continueButton.textContent = `Review`;
    continueButton.style.width = "100%";
    continueButton.style.padding = "10px 0"; // Vertical padding
    continueButton.style.border = "none";
    continueButton.style.backgroundColor = "#1a73e8"; // Google blue
    continueButton.style.color = "white";
    continueButton.style.borderRadius = "8px";
    continueButton.style.cursor = "pointer";
    continueButton.style.fontSize = "15px";
    continueButton.style.fontWeight = "500";
    continueButton.style.textAlign = "center";
    continueButton.onmouseover = () => (continueButton.style.backgroundColor = "#185abc"); // Darker blue on hover
    continueButton.onmouseout = () => (continueButton.style.backgroundColor = "#1a73e8");

    continueButton.onclick = () => {
        console.log("Vibe: Consent popover 'Continue' button clicked.");
        const requestId = `vibe-req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        chrome.runtime.sendMessage(
            {
                type: "VIBE_AGENT_REQUEST", // Changed type
                action: "USER_CLICKED_CONSENT_POPOVER", // Added action
                requestId: requestId, // Added requestId
                payload: { appName, origin, appId, appIconUrl, requestedPermissions, consentRequestId },
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(`Vibe: Error sending USER_CLICKED_CONSENT_POPOVER (requestId: ${requestId}) message:`, chrome.runtime.lastError.message);
                } else {
                    console.log(`Vibe: USER_CLICKED_CONSENT_POPOVER (requestId: ${requestId}) message sent successfully, response:`, response);
                }
            }
        );
        removeExistingPopover();
    };
    popover.appendChild(continueButton);

    document.body.appendChild(popover);
    console.log(`Vibe: Displayed styled consent popover for ${appName}.`);
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
