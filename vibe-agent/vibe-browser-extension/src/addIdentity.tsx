import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { NewIdentitySetupWizard } from "./components/identity/NewIdentitySetupWizard";
import "./index.css"; // Ensure styles are applied

const AddIdentityPage: React.FC = () => {
    const [accountIndex, setAccountIndex] = useState<number | null>(null);
    const [isVaultInitiallyUnlocked, setIsVaultInitiallyUnlocked] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                // Fetch account index
                const accountIndexResponse = await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "GET_NEXT_ACCOUNT_INDEX",
                    requestId: crypto.randomUUID().toString(),
                });

                if (accountIndexResponse?.type === "VIBE_AGENT_RESPONSE" && typeof accountIndexResponse.payload?.accountIndex === "number") {
                    setAccountIndex(accountIndexResponse.payload.accountIndex);
                } else {
                    throw new Error(accountIndexResponse?.error?.message || "Failed to fetch next account index.");
                }

                // Fetch lock state
                const lockStateResponse = await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "GET_LOCK_STATE",
                    requestId: crypto.randomUUID().toString(),
                });

                if (lockStateResponse?.type === "VIBE_AGENT_RESPONSE" && typeof lockStateResponse.payload?.isUnlocked === "boolean") {
                    setIsVaultInitiallyUnlocked(lockStateResponse.payload.isUnlocked);
                } else {
                    // Default to locked if fetching state fails, to be safe
                    setIsVaultInitiallyUnlocked(false);
                    console.warn("Failed to fetch lock state, assuming locked.");
                }
            } catch (e: any) {
                setError(e.message || "An error occurred while fetching initial data.");
                console.error("Error fetching initial data for AddIdentityPage:", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitialData();
    }, []);

    const handleSetupComplete = async (details: {
        accountIndex: number;
        identityName: string | null; // Updated to match wizard prop
        identityPicture?: string | null; // Updated to match wizard prop
        cloudUrl: string;
        claimCode?: string | null; // Updated to match wizard prop
        password?: string;
    }) => {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SETUP_NEW_IDENTITY_AND_FINALIZE", // New background action
                payload: {
                    accountIndexToUse: details.accountIndex, // Pass the fetched account index
                    identityName: details.identityName,
                    identityPicture: details.identityPicture,
                    cloudUrl: details.cloudUrl,
                    claimCode: details.claimCode,
                    password: details.password,
                },
                requestId: crypto.randomUUID().toString(),
            });

            if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                alert("New identity successfully created and configured!");
                window.close(); // Close the tab on success
            } else {
                throw new Error(response?.error?.message || "Failed to finalize new identity.");
            }
        } catch (e: any) {
            setError(e.message || "An error occurred during finalization.");
            console.error("Error finalizing new identity:", e);
            // Do not close window, allow user to see error and potentially retry if wizard supports it
        }
    };

    const handleCancel = () => {
        window.close(); // Close the tab on cancel
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <p>Loading...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-screen p-4">
                <p className="text-red-500 text-lg">Error:</p>
                <p className="text-red-500">{error}</p>
                <button onClick={() => window.close()} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                    Close
                </button>
            </div>
        );
    }

    if (accountIndex === null && !isLoading) {
        // Check isLoading to avoid flash of this message
        return (
            <div className="flex flex-col justify-center items-center h-screen p-4">
                <p className="text-red-500">Could not determine account index. Please try closing this page and opening it again.</p>
                <button onClick={() => window.close()} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                    Close
                </button>
            </div>
        );
    }

    // Render NewIdentitySetupWizard only when accountIndex is available
    return (
        <div className="container mx-auto p-4 flex justify-center items-center min-h-screen">
            <div className="w-full max-w-lg">
                {accountIndex !== null && (
                    <NewIdentitySetupWizard
                        accountIndex={accountIndex}
                        isVaultInitiallyUnlocked={isVaultInitiallyUnlocked} // Pass the lock state
                        isFirstIdentitySetup={false} // This page is for adding subsequent identities or first after basic setup
                        onSetupComplete={handleSetupComplete}
                        onCancel={handleCancel}
                        // onResetVibe is not passed, as it's not relevant for this flow
                    />
                )}
            </div>
        </div>
    );
};

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <AddIdentityPage />
        </React.StrictMode>
    );
} else {
    console.error("Failed to find the root element for React application.");
}
