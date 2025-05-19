import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import RoutedApp from "./App"; // Import the new main app component
import { VaultUnlockProvider } from "./contexts/VaultUnlockContext"; // Import the provider

const container = document.getElementById("root");
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <VaultUnlockProvider>
                <RoutedApp />
            </VaultUnlockProvider>
        </React.StrictMode>
    );
} else {
    console.error("Root container not found");
}
