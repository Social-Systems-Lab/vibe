// App.tsx - Sets up routing for the Vibe integration test
import { Routes, Route, Outlet } from "react-router-dom";
import "./index.css";
import { useVibe } from "./vibe/react.tsx"; // Import useVibe hook

// Import Page Components
import PreAppPage from "./pages/PreAppPage.tsx";
import AppPage from "./pages/AppPage.tsx";

// --- Root Layout Component ---
// This component renders persistent UI elements and provides a placeholder (<Outlet>)
// for routed page components. It now uses useVibe to access VibeState.
function RootLayout() {
    const { activeIdentity, identities, account, permissions } = useVibe();

    // Log current Vibe state for debugging
    console.log("[RootLayout] Vibe State:", { activeIdentity, identities, account, permissions });

    return (
        <div className="container mx-auto p-8 text-left relative z-10 min-h-screen flex flex-col">
            {/* Header - Always Visible */}
            <header className="flex justify-between items-center mb-6 flex-shrink-0">
                <h1 className="text-2xl font-bold">Vibe Test App (Real SDK)</h1>
                <div>{activeIdentity ? <p>Active DID: {activeIdentity.did.substring(0, 12)}...</p> : <p>No active identity. Waiting for Vibe Agent...</p>}</div>
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
            </Route>
        </Routes>
    );
}
