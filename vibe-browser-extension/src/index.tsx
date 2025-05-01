import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css"; // Assuming Tailwind/CSS setup is handled by the build

const STORAGE_KEY_SETUP_COMPLETE = "isSetupComplete";
const SETUP_URL = chrome.runtime.getURL("setup.html");

function Popup() {
    const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const checkSetupStatus = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const result = await chrome.storage.local.get(STORAGE_KEY_SETUP_COMPLETE);
                console.log("Setup status from storage:", result);
                setIsSetupComplete(!!result[STORAGE_KEY_SETUP_COMPLETE]);
            } catch (err) {
                console.error("Error checking setup status:", err);
                setError("Could not check setup status. Please try reloading the extension.");
                setIsSetupComplete(false); // Assume not setup if error occurs
            } finally {
                setIsLoading(false);
            }
        };

        checkSetupStatus();
    }, []);

    const handleStartSetup = () => {
        chrome.tabs.create({ url: SETUP_URL });
        window.close(); // Close the popup after opening the tab
    };

    const handleResetDev = async () => {
        if (confirm("Are you sure you want to reset Vibe setup? This is for development only and will clear stored data.")) {
            try {
                await chrome.storage.local.clear(); // Clears everything for simplicity in dev
                console.log("Storage cleared for reset.");
                setIsSetupComplete(false); // Update state to reflect reset
                alert("Vibe has been reset. Reload the extension or click the icon again.");
            } catch (err) {
                console.error("Error resetting storage:", err);
                alert("Failed to reset Vibe.");
            }
        }
    };

    if (isLoading) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-600">{error}</div>;
    }

    return (
        <div className="p-6 min-w-[300px] text-center">
            <h1 className="text-xl font-bold mb-4">Vibe</h1>
            {isSetupComplete ? (
                <div>
                    <p className="mb-4">Vibe has been set up.</p>
                    {/* Add main UI elements here later */}
                    <button onClick={handleResetDev} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-xs">
                        Reset (Dev Only)
                    </button>
                </div>
            ) : (
                <div>
                    <p className="mb-4">Welcome to Vibe! Setup is required.</p>
                    <button onClick={handleStartSetup} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Start Setup
                    </button>
                </div>
            )}
        </div>
    );
}

const container = document.getElementById("root");
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <Popup />
        </React.StrictMode>
    );
} else {
    console.error("Root container not found");
}
