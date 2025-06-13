/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { VibeProvider } from "vibe-react";
import type { AppManifest } from "vibe-sdk";
import logoSvg from "./logo.svg"; // Import logo for the app

// Define the manifest for the test application
const testAppManifest: AppManifest = {
    appId: "vibe-test-app", // Unique ID for this application
    name: "Vibe Test App",
    description: "An application for testing Vibe Protocol integration.",
    permissions: [
        "read:notes", // Request permission to read notes
        "write:notes", // Request permission to write notes
        // Add other permissions as needed, e.g., "read:profile"
    ],
    iconUrl: `${window.location.origin}${logoSvg}`, // Optional: URL to an icon for the app
    // TODO: Add other manifest fields if necessary (e.g., website, privacyPolicyUrl)
};

// --- App Entry Point Component ---
// Renders the main application wrapped with VibeProvider
function AppEntry() {
    return (
        <BrowserRouter>
            <App />
        </BrowserRouter>
    );
}

const elem = document.getElementById("root")!;
const appEntryElement = <AppEntry />;

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
