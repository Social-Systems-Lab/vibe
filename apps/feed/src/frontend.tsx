/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { VibeProvider } from "vibe-react";
import type { AppManifest } from "vibe-react";
import logoSvg from "./logo.svg";

const feedsAppManifest: AppManifest = {
    appId: "feeds-app",
    name: "Feeds App",
    description: "A decentralized feed of posts.",
    permissions: ["read:posts", "write:posts"],
    iconUrl: `${window.location.origin}${logoSvg}`,
};

const elem = document.getElementById("root")!;
const app = (
    <StrictMode>
        <VibeProvider manifest={feedsAppManifest}>
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
