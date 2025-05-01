import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css"; // Assuming Tailwind/CSS setup is handled by the build

function SetupWizardPlaceholder() {
    // TODO: Replace this with the actual SetupWizard component
    // Need to copy/adapt components from apps/test/src/components/setup/
    // (WelcomeStep, CreatePasswordStep, ShowPhraseStep, SetupWizard)
    // and potentially UI components from apps/test/src/components/ui/

    return (
        <div className="p-8 max-w-md mx-auto mt-10 border rounded shadow-lg">
            <h1 className="text-2xl font-bold mb-6 text-center">Vibe Setup</h1>
            <p className="text-center text-gray-600">Setup wizard will be implemented here.</p>
            {/* Placeholder for wizard steps */}
        </div>
    );
}

const container = document.getElementById("root");
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <SetupWizardPlaceholder />
        </React.StrictMode>
    );
} else {
    console.error("Root container not found for setup wizard");
}
