import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css"; // Assuming Tailwind/CSS setup is handled by the build
import { SetupWizard } from "./components/setup/SetupWizard";
import type { MockVibeAgent } from "./vibe/agent"; // Import the type

// Mock agent implementation for UI development
const mockAgent: MockVibeAgent = {
    createNewVault: async (password: string) => {
        console.log("MockAgent: createNewVault called with password:", password);
        // Simulate mnemonic generation
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate async delay
        return "test test test test test test test test test test test junk"; // 12 words
    },
    importVaultFromMnemonic: async (mnemonic: string, password: string) => {
        console.log("MockAgent: importVaultFromMnemonic called with", { mnemonic, password });
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate async delay
        // Simulate success
    },
    // Add other methods if SetupWizard starts using them
};

const handleSetupComplete = () => {
    console.log("Setup complete! Redirecting or closing tab...");
    // In a real extension, you might store a flag and then close the setup tab
    // or redirect to a "setup complete" page or the main extension UI.
    // For now, just log and maybe alert.
    alert("Vibe Setup Complete!");
    // Attempt to close the current tab (might not work in all contexts without specific permissions/focus)
    try {
        window.close();
    } catch (e) {
        console.warn("Could not close setup tab automatically:", e);
    }
};

const container = document.getElementById("root");
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <SetupWizard agent={mockAgent} onSetupComplete={handleSetupComplete} />
        </React.StrictMode>
    );
} else {
    console.error("Root container not found for setup wizard");
}
