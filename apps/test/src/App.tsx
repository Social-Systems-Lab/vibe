// App.tsx - Sets up routing for the Vibe integration test
import { Routes, Route, Outlet, Link } from "react-router-dom"; // Added Link
import "./index.css";
import { useVibe } from "./vibe/react.tsx"; // Import useVibe hook

// Import Page Components
import NotesPage from "./pages/NotesPage.tsx"; // Added NotesPage import

// --- Root Layout Component ---
// This component renders persistent UI elements and provides a placeholder (<Outlet>)
// for routed page components. It now uses useVibe to access VibeState.
function RootLayout() {
    return (
        <div className="container mx-auto p-8 text-left relative z-10 min-h-screen flex flex-col">
            {/* Header - Always Visible */}
            <header className="flex justify-between items-center mb-6 flex-col flex-shrink-0">
                <h1 className="text-2xl font-bold">Vibe Test App</h1>
                <nav className="space-x-4">
                    <Link to="/" className="text-blue-500 hover:underline">
                        Home
                    </Link>
                    <Link to="/notes" className="text-blue-500 hover:underline">
                        Notes
                    </Link>
                </nav>
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
                {/* Route for the main "in-app" state */}
                <Route path="app" element={<NotesPage />} />
                {/* Route for the Notes page */}
                <Route path="notes" element={<NotesPage />} />
            </Route>
        </Routes>
    );
}
