// App.tsx - Sets up routing for the Vibe mock integration test
import { useCallback } from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import "./index.css";
import { IdentityPanel } from "@/components/agent/IdentityPanel"; // Use alias
import { useAgent } from "./vibe/agent.tsx"; // Import the new Agent hook

// Import Page Components
import PreAppPage from "./pages/PreAppPage.tsx"; // Added .tsx
import AppPage from "./pages/AppPage.tsx"; // Added .tsx

// --- Root Layout Component ---
// This component renders the persistent UI elements like the header/IdentityPanel
// and provides a placeholder (<Outlet>) for the routed page components.
// It now uses the useAgent hook for identity management.
function RootLayout() {
    // Get agent state and methods from useAgent
    const { identities, activeIdentity, createIdentity, setActiveIdentity } = useAgent();

    // --- Identity Panel Handlers (using useAgent methods) ---
    const handleCreateIdentity = useCallback(async () => {
        console.log("[RootLayout] handleCreateIdentity called!");
        // Auto-create with default label for testing
        const defaultLabel = `Identity ${identities ? identities.length + 1 : 1}`;
        console.log(`[RootLayout] Auto-creating identity with label: ${defaultLabel}`);
        // setStatus("Creating new identity..."); // Status is now managed within AppPage
        try {
            await createIdentity(defaultLabel);
            // setStatus("New identity created.");
        } catch (error) {
            console.error("Error creating identity:", error);
            // setStatus(`Error creating identity: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [createIdentity, identities]);

    const handleSwitchIdentity = useCallback(
        async (did: string) => {
            // setStatus(`Switching identity to ${did}...`);
            console.log(`[RootLayout] Switching identity to ${did}...`);
            try {
                await setActiveIdentity(did);
                // setStatus("Identity switched.");
                // Clearing app-specific data (notes/tasks) should happen within AppPage
                // when the activeIdentity changes there (via useVibe).
            } catch (error) {
                console.error("Error switching identity:", error);
                // setStatus(`Error switching identity: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        [setActiveIdentity]
    );

    const handleManagePermissions = useCallback(() => {
        // TODO: Implement navigation or modal opening for permission manager
        alert("Permission Management UI not implemented yet.");
        console.log("Navigate to Permission Management UI");
    }, []);

    return (
        <div className="container mx-auto p-8 text-left relative z-10 min-h-screen flex flex-col">
            {/* Header with Identity Panel - Always Visible */}
            <header className="flex justify-between items-center mb-6 flex-shrink-0">
                <h1 className="text-2xl font-bold">Vibe Test App</h1>
                <IdentityPanel
                    // State (identities, activeIdentity) is now fetched via useAgent within IdentityPanel
                    // Only pass down the action handlers defined in RootLayout
                    onCreateIdentity={handleCreateIdentity}
                    onSwitchIdentity={handleSwitchIdentity}
                    onManagePermissions={handleManagePermissions}
                />
            </header>

            {/* Main Content Area - Renders the matched route's component */}
            <main className="flex-grow">
                <Outlet /> {/* Page components will be rendered here */}
            </main>
        </div>
    );
}

// --- Main App Component (Router Setup) ---
export function App() {
    return (
        <Routes>
            <Route path="/" element={<RootLayout />}>
                {/* Index route for the "pre-app" state */}
                <Route index element={<PreAppPage />} />
                {/* Route for the main "in-app" state */}
                <Route path="app" element={<AppPage />} />
                {/* TODO: Add other routes as needed */}
            </Route>
        </Routes>
    );
}

// Default export might not be needed if App is the main export used in frontend.tsx
// export default App;
