/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { App } from "./App";
import { VibeProvider } from "./vibe/react"; // Import the provider
import type { AppManifest } from "./vibe/types"; // Import the type

// Define the manifest for this test application
const testAppManifest: AppManifest = {
    appId: "test-app-local", // Changed from id to appId
    name: "Vibe Test App (Local Mock)",
    description: "An application for testing the mock Vibe SDK integration.",
    // Request permissions based on mock agent data
    permissions: ["read:notes", "write:notes", "read:tasks", "write:tasks"],
};

const elem = document.getElementById("root")!;
const app = (
    <StrictMode>
        <VibeProvider manifest={testAppManifest}>
            {" "}
            {/* Wrap App with VibeProvider */}
            <App />
        </VibeProvider>
    </StrictMode>
);

if (import.meta.hot) {
    // With hot module reloading, `import.meta.hot.data` is persisted.
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
} else {
    // The hot module reloading API is not available in production.
    createRoot(elem).render(app);
}
