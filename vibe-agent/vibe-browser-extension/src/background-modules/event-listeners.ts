import { ACTIVE_TAB_APP_CONTEXTS_KEY } from "./action-handlers/app-session.handler";

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

    // Listener for tab activation
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const { tabId } = activeInfo;
        console.log(`[BG] Tab activated: ${tabId}`);
        try {
            const allAppContexts = (await chrome.storage.session.get(ACTIVE_TAB_APP_CONTEXTS_KEY))[ACTIVE_TAB_APP_CONTEXTS_KEY] || {};
            const appContext = allAppContexts[tabId] || null;

            // Send message to side panel to update its context
            // This message is sent regardless of whether the side panel is open or not.
            // The side panel's useAppInitializer or DashboardPage should handle this.
            chrome.runtime
                .sendMessage({
                    type: "UPDATE_SIDE_PANEL_APP_CONTEXT",
                    payload: {
                        tabId: tabId,
                        appContext: appContext,
                    },
                })
                .catch((err) => {
                    if (err.message?.includes("Could not establish connection") || err.message?.includes("Receiving end does not exist")) {
                        // Expected if side panel is not open or not listening
                    } else {
                        console.error(`[BG] Error sending UPDATE_SIDE_PANEL_APP_CONTEXT for tab ${tabId}:`, err);
                    }
                });
        } catch (error) {
            console.error(`[BG] Error handling tab activation for tab ${tabId}:`, error);
        }
    });

    // Listener for tab removal
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
        console.log(`[BG] Tab removed: ${tabId}`);
        try {
            const allAppContextsResult = await chrome.storage.session.get(ACTIVE_TAB_APP_CONTEXTS_KEY);
            const allAppContexts = allAppContextsResult[ACTIVE_TAB_APP_CONTEXTS_KEY];

            if (allAppContexts && allAppContexts[tabId]) {
                delete allAppContexts[tabId];
                await chrome.storage.session.set({ [ACTIVE_TAB_APP_CONTEXTS_KEY]: allAppContexts });
                console.log(`[BG] Removed app context for tab ${tabId}.`);

                // Optionally, notify the side panel if the removed tab was its current context.
                // This might be complex if the side panel was focused on this tab.
                // For now, the onActivated listener for the *new* active tab should handle updating the side panel.
            }
        } catch (error) {
            console.error(`[BG] Error handling tab removal for tab ${tabId}:`, error);
        }
    });

    // Listener for changes in chrome.storage.session (specifically for app contexts)
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === "session" && changes[ACTIVE_TAB_APP_CONTEXTS_KEY]) {
            console.log(`[BG] Detected change in session storage for ${ACTIVE_TAB_APP_CONTEXTS_KEY}.`);
            try {
                // Get the currently active tab
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTab?.id) {
                    const newAppContexts = changes[ACTIVE_TAB_APP_CONTEXTS_KEY].newValue || {};
                    const appContextForActiveTab = newAppContexts[activeTab.id] || null;

                    console.log(`[BG] App context for active tab ${activeTab.id} after storage change:`, appContextForActiveTab);

                    // Send message to side panel to update its context
                    chrome.runtime
                        .sendMessage({
                            type: "UPDATE_SIDE_PANEL_APP_CONTEXT",
                            payload: {
                                tabId: activeTab.id,
                                appContext: appContextForActiveTab,
                            },
                        })
                        .catch((err) => {
                            if (err.message?.includes("Could not establish connection") || err.message?.includes("Receiving end does not exist")) {
                                // Expected if side panel is not open or not listening
                            } else {
                                console.error(`[BG] Error sending UPDATE_SIDE_PANEL_APP_CONTEXT from storage.onChanged for tab ${activeTab.id}:`, err);
                            }
                        });
                } else {
                    console.log("[BG] No active tab found to update context after storage change.");
                }
            } catch (error) {
                console.error("[BG] Error handling storage.onChanged for app contexts:", error);
            }
        }
    });

    console.log("Vibe Background Service Worker event listeners registered by module.");
}
