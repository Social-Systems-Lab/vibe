export function registerEventListeners() {
    chrome.runtime.onInstalled.addListener(async (details) => {
        if (details.reason === "install") {
            console.log("Vibe extension installed.");
            // Set initial side panel state for existing tabs
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.id) {
                    try {
                        await chrome.sidePanel.setOptions({
                            tabId: tab.id,
                            path: "sidepanel.html",
                            enabled: true,
                        });
                    } catch (error) {
                        console.warn(`Could not set side panel options for tab ${tab.id}:`, error);
                    }
                }
            }
        } else if (details.reason === "update") {
            console.log("Vibe extension updated to version:", chrome.runtime.getManifest().version);
            // Also ensure side panel is available on update
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.id) {
                    try {
                        await chrome.sidePanel.setOptions({
                            tabId: tab.id,
                            path: "sidepanel.html",
                            enabled: true,
                        });
                    } catch (error) {
                        console.warn(`Could not set side panel options for tab ${tab.id} on update:`, error);
                    }
                }
            }
        }
    });

    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error("Failed to set panel behavior:", error));

    chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
        if (info.status === "complete") {
            try {
                await chrome.sidePanel.setOptions({
                    tabId,
                    path: "sidepanel.html",
                    enabled: true,
                });
            } catch (error) {
                console.warn(`Could not set side panel options for tab ${tabId} on update:`, error);
            }
        }
    });

    console.log("Vibe Background Service Worker event listeners registered by module.");
}
