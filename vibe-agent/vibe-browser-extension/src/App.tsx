import React from "react"; // Removed useEffect, Link, useLocation as they are not directly used here anymore
import { Router, Route, Switch } from "wouter"; // Removed Link, useLocation
import { useAtom } from "jotai";
import { appStatusAtom, type AppStatus, unlockErrorAtom } from "./store/appAtoms"; // Removed unused atoms
// import { currentIdentityAtom, allIdentitiesAtom } from "./store/identityAtoms"; // Not used directly in App.tsx
import { useAppInitializer } from "./hooks/useAppInitializer"; // Import the hook

import UnlockPage from "./pages/UnlockPage"; // Import the actual UnlockPage
import DashboardPage from "./pages/DashboardPage"; // Import the actual DashboardPage
import SetupWizardPage from "./pages/SetupWizardPage"; // Import the actual SetupWizardPage
import NewIdentityPage from "./pages/NewIdentityPage"; // Import the actual NewIdentityPage
import SettingsPage from "./pages/SettingsPage"; // Import the actual SettingsPage
import ImportIdentityPage from "./pages/ImportIdentityPage"; // Import the actual ImportIdentityPage
import UserProfilePage from "./pages/UserProfilePage"; // Import the actual UserProfilePage

// Placeholder for Pages (to be created)
const LoadingComponent = () => <div className="w-full p-4 bg-background text-foreground flex flex-col items-center justify-center h-full">Loading Vibe...</div>;
// const SetupWizardPage = () => <div>Setup Wizard Page</div>; // Placeholder - REMOVED
// const NewIdentityPage = () => <div>New Identity Page</div>; // Placeholder - REMOVED
// const UnlockPage = () => <div>Unlock Page</div>; // Placeholder - REMOVED
// const DashboardPage = () => <div>Dashboard Page</div>; // Placeholder - REMOVED
// const SettingsPage = () => <div>Settings Page</div>; // Placeholder - REMOVED
// const ImportIdentityPage = () => <div>Import Identity Page</div>; // Placeholder - REMOVED
// const UserProfilePage = () => <div>User Profile Page</div>; // Placeholder - REMOVED
const ErrorFallbackComponent = ({ error }: { error: string | null }) => (
    <div className="w-full p-4 bg-background text-foreground flex flex-col items-center justify-center h-full">
        <p className="text-red-500">An error occurred: {error || "Unknown error"}</p>
        <p>Please try reloading the extension.</p>
    </div>
);

// No longer need the inline useAppInitializer hook here

function App() {
    useAppInitializer(); // Initialize the application state and routing via the imported hook
    const [status] = useAtom(appStatusAtom);
    const [unlockErr] = useAtom(unlockErrorAtom);

    if (status === "LOADING") {
        return <LoadingComponent />;
    }

    // This is a simplified router. A more robust solution might involve
    // a central routing component that reacts to `appStatusAtom`.
    return (
        <Switch>
            <Route path="/setup/new-identity" component={NewIdentityPage} />
            <Route path="/setup" component={SetupWizardPage} />
            <Route path="/unlock" component={UnlockPage} />
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/import-identity" component={ImportIdentityPage} />
            <Route path="/profile/:did" component={UserProfilePage} />
            <Route path="/error">
                <ErrorFallbackComponent error={unlockErr} />
            </Route>
            {/* Fallback route - could redirect to /dashboard or /unlock based on status */}
            <Route>
                {() => {
                    // This logic will be refined. For now, a simple redirect or default view.
                    // const [currentStatus] = useAtom(appStatusAtom); // Re-read for dynamic fallback
                    // if (currentStatus === 'INITIALIZED_UNLOCKED') return <Redirect to="/dashboard" />;
                    // if (currentStatus === 'VAULT_LOCKED_NO_LAST_ACTIVE' || currentStatus === 'UNLOCK_REQUIRED_FOR_LAST_ACTIVE') return <Redirect to="/unlock" />;
                    // return <LoadingComponent />; // Default fallback
                    return <div>Fallback Page - Check Routes</div>;
                }}
            </Route>
        </Switch>
    );
}

// This will be the new root component rendered in index.tsx or sidepanel.html's script
export default function RoutedApp() {
    return (
        <Router>
            <App />
        </Router>
    );
}
