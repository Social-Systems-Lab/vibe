/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { useState, useEffect, useCallback } from "react"; // Added useState, useEffect, useCallback
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AgentProvider, MockVibeAgent } from "./vibe/agent.tsx"; // Import MockVibeAgent class
// import type { AppManifest } from "./vibe/types"; // AppManifest not used here directly
import { SetupWizard } from "./components/setup/SetupWizard";

const SETUP_COMPLETE_KEY = "vibe_agent_setup_complete";

// Instantiate the agent globally for this mock app instance
// In a real extension, this would be managed differently (e.g., background script)
const agent = new MockVibeAgent();

// --- App Entry Point Component ---
// Checks if setup is complete and renders either the wizard or the main app
function AppEntry() {
    // Check localStorage synchronously on initial render
    const [isSetupComplete, setIsSetupComplete] = useState(() => {
        try {
            return localStorage.getItem(SETUP_COMPLETE_KEY) === "true";
        } catch (e) {
            console.error("Error reading setup status from localStorage:", e);
            return false; // Default to setup needed if localStorage fails
        }
    });

    const handleSetupComplete = useCallback(() => {
        try {
            localStorage.setItem(SETUP_COMPLETE_KEY, "true");
            setIsSetupComplete(true);
            // Optional: force reload to ensure clean state, or manage state transition more smoothly
            // window.location.reload();
            console.log("Setup complete, rendering main application.");
        } catch (e) {
            console.error("Error saving setup status to localStorage:", e);
            // Handle error appropriately, maybe show a message
        }
    }, []);

    if (!isSetupComplete) {
        // Render the setup wizard if setup is not complete
        // Pass the globally created agent instance
        return <SetupWizard agent={agent} onSetupComplete={handleSetupComplete} />;
    }

    // Render the main application if setup is complete
    // Pass the globally created agent instance to the provider
    return (
        <BrowserRouter>
            <AgentProvider agentInstance={agent}>
                {" "}
                {/* Pass agent instance */}
                <App />
            </AgentProvider>
        </BrowserRouter>
    );
}

const elem = document.getElementById("root")!;
const appEntryElement = <AppEntry />; // Use the new entry component

// StrictMode removed for brevity, can be re-added if needed
// const app = (
if (import.meta.hot) {
    // With hot module reloading, `import.meta.hot.data` is persisted.
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(appEntryElement); // Render AppEntry
} else {
    // The hot module reloading API is not available in production.
    createRoot(elem).render(appEntryElement); // Render AppEntry
}
