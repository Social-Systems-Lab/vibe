/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AgentProvider } from "./vibe/agent.tsx";
import type { AppManifest } from "./vibe/types";

const elem = document.getElementById("root")!;
const app = (
    // <StrictMode>
    <BrowserRouter>
        <AgentProvider>
            {" "}
            {/* AgentProvider wraps the router */}
            <App /> {/* App now contains Routes */}
        </AgentProvider>
    </BrowserRouter>
    // </StrictMode>
);

if (import.meta.hot) {
    // With hot module reloading, `import.meta.hot.data` is persisted.
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
} else {
    // The hot module reloading API is not available in production.
    createRoot(elem).render(app);
}
