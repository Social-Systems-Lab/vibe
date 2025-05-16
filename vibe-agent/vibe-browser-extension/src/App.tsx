import React, { useState, useEffect, useCallback } from "react"; // Added useCallback
import "./index.css";
import { IdentityCard } from "./components/identity/IdentityCard";
import { IdentitySwitcher } from "./components/identity/IdentitySwitcher";
import IdentitySettings from "./components/identity/IdentitySettings"; // Import IdentitySettings as default
import { CloudStatus } from "./components/cloud/CloudStatus";
import { ImportIdentityWizard } from "./components/identity/ImportIdentityWizard"; // Import the new wizard
import { Button } from "@/components/ui/button"; // For a potential settings button
import { Settings, RotateCcw } from "lucide-react"; // Added RotateCcw for reset icon

// Prop types for App component
interface AppProps {
    onResetDev: () => Promise<void>; // Or () => void if preferred
}

// Matches the structure in background.ts (profile_name, profile_picture)
interface StoredIdentity {
    did: string;
    profile_name: string | null;
    profile_picture?: string | null;
    derivationPath?: string; // Optional, from vault
}

// UI-facing Identity type
interface Identity {
    did: string;
    displayName: string | null;
    avatarUrl?: string | null;
}

type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

interface CloudResources {
    storageUsed?: string;
    storageTotal?: string;
}

export function App({ onResetDev }: AppProps) {
    const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(null); // Initialize with null
    const [identities, setIdentities] = useState<Identity[]>([]); // Initialize with empty array
    const [isLoadingIdentity, setIsLoadingIdentity] = useState(true); // Loading state for identity
    const [cloudStatus, setCloudStatus] = useState<ConnectionStatus>("connected");
    const [cloudResources, setCloudResources] = useState<CloudResources>({ storageUsed: "2.3 GB", storageTotal: "10 GB" });
    const [cloudErrorMessage, setCloudErrorMessage] = useState<string | undefined>(undefined);
    const [showImportWizard, setShowImportWizard] = useState(false); // State for wizard visibility
    const [showIdentitySettings, setShowIdentitySettings] = useState(false); // State for settings visibility

    const loadIdentityData = useCallback(async () => {
        console.log("App.tsx: loadIdentityData triggered"); // Diagnostic log
        setIsLoadingIdentity(true);
        try {
            // Fetch from "vibeVault" and "currentIdentityDID"
            const result = await chrome.storage.local.get(["vibeVault", "currentIdentityDID"]);
            const vault = result.vibeVault;
            const storedCurrentDID: string | undefined = result.currentIdentityDID;

            let uiIdentities: Identity[] = [];
            if (vault && vault.identities && Array.isArray(vault.identities)) {
                uiIdentities = vault.identities.map((id: StoredIdentity) => ({
                    did: id.did,
                    displayName: id.profile_name,
                    avatarUrl: id.profile_picture,
                }));
            }
            setIdentities(uiIdentities);

            if (storedCurrentDID) {
                const foundCurrent = uiIdentities.find((id) => id.did === storedCurrentDID);
                setCurrentIdentity(foundCurrent || (uiIdentities.length > 0 ? uiIdentities[0] : null));
            } else if (uiIdentities.length > 0) {
                // If no current DID is set (e.g., first time after setup), default to the first one
                setCurrentIdentity(uiIdentities[0]);
                // Persist this choice
                await chrome.storage.local.set({ currentIdentityDID: uiIdentities[0].did });
            } else {
                setCurrentIdentity(null); // No identities found
            }
            console.log("Loaded vault identities, mapped to UI:", uiIdentities);
            console.log("Current DID from storage:", storedCurrentDID);
        } catch (error) {
            console.error("Error loading identity data from storage:", error);
            // Optionally set an error state to display to the user
        } finally {
            setIsLoadingIdentity(false);
        }
    }, []); // Removed dependencies as it's meant to run once or be manually called

    useEffect(() => {
        loadIdentityData();
    }, [loadIdentityData]);

    // Listen for storage changes to auto-refresh identity data
    useEffect(() => {
        const storageChangedListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === "local" && (changes.vibeVault || changes.currentIdentityDID)) {
                console.log("App.tsx: Detected vibeVault or currentIdentityDID change, reloading identity data.");
                loadIdentityData();
            }
        };
        chrome.storage.onChanged.addListener(storageChangedListener);
        return () => {
            chrome.storage.onChanged.removeListener(storageChangedListener);
        };
    }, [loadIdentityData]);

    const handleSwitchIdentity = (did: string) => {
        const newIdentity = identities.find((id) => id.did === did);
        if (newIdentity) {
            setCurrentIdentity(newIdentity);
            chrome.storage.local.set({ currentIdentityDID: newIdentity.did });
            console.log("Switched to identity:", newIdentity.did);
        }
    };

    const handleAddIdentity = async () => {
        // This placeholder needs to be updated to interact with background.ts
        // to properly create and store a new identity within the vault structure.
        console.log("Add new identity action triggered. Needs full implementation via background script.");
        alert("Add new identity functionality is not fully implemented yet. It requires interaction with the background script to update the vault.");

        // // --- TEMPORARY MOCK ADDITION (REMOVE/REPLACE WITH BACKGROUND SCRIPT INTERACTION) ---
        // const newId = `did:example:temp${Date.now().toString().slice(-6)}`;
        // const tempNewUiIdentity: Identity = { // UI type
        //     did: newId,
        //     displayName: `Temp User ${identities.length + 1}`,
        //     avatarUrl: undefined,
        // };
        // const tempNewStoredIdentity: StoredIdentity = { // Stored type
        //     did: newId,
        //     profile_name: tempNewUiIdentity.displayName,
        //     profile_picture: undefined,
        //     derivationPath: `m/0'/0'/${identities.length}'` // Example path
        // };

        // const updatedUiIdentities = [...identities, tempNewUiIdentity];
        // setIdentities(updatedUiIdentities);
        // setCurrentIdentity(tempNewUiIdentity);

        // try {
        //     const vaultResult = await chrome.storage.local.get("vibeVault");
        //     const vault = vaultResult.vibeVault || { identities: [], settings: {} };
        //     const updatedStoredIdentities = [...(vault.identities || []), tempNewStoredIdentity];

        //     await chrome.storage.local.set({
        //         vibeVault: { ...vault, identities: updatedStoredIdentities },
        //         currentIdentityDID: tempNewUiIdentity.did,
        //     });
        //     console.log("Temporarily added and saved new identity (MOCK):", tempNewUiIdentity);
        // } catch (error) {
        //     console.error("Error saving temporary new identity (MOCK):", error);
        // }
        // // --- END TEMPORARY MOCK ADDITION ---
    };

    const handleImportIdentity = async () => {
        setShowImportWizard(true); // Show the wizard
    };

    const handleImportComplete = async (mnemonic: string, password?: string) => {
        console.log("Attempting to import identity via background script:", { mnemonic, password });
        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "IMPORT_IDENTITY_FROM_SEED",
                payload: { mnemonic, password },
                // requestId: crypto.randomUUID() // Good practice to include a request ID
            });

            console.log("Response from IMPORT_IDENTITY_FROM_SEED:", response);

            if (response && response.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                alert(`Identity import process initiated: ${response.payload.message}\nPlease wait for the extension to reload or refresh data.`);
                // TODO: After successful import, the UI should ideally refresh to show new identities.
                // This might involve:
                // 1. Background script signaling a change.
                // 2. App reloading identity data (calling loadIdentityData()).
                // 3. Or, if the import replaces the vault, the extension might need to be "re-unlocked" or re-initialized.
                setShowImportWizard(false);
                loadIdentityData(); // Re-load identities
            } else if (response && response.type === "VIBE_AGENT_RESPONSE_ERROR") {
                alert(`Error importing identity: ${response.error?.message || "Unknown error"}`);
            } else {
                alert("Received an unexpected response from the background script during import.");
            }
        } catch (error: any) {
            console.error("Error sending IMPORT_IDENTITY_FROM_SEED message to background:", error);
            alert(`Failed to communicate with the background script for import: ${error.message}`);
        }
        // setShowImportWizard(false); // Moved inside success/error handling or keep here if always hiding
    };

    const handleCancelImport = () => {
        setShowImportWizard(false); // Hide the wizard
    };

    const handleOpenSettings = () => {
        setShowIdentitySettings(true);
    };

    const handleCloseSettings = () => {
        setShowIdentitySettings(false);
        loadIdentityData(); // Refresh data when closing settings
    };

    // Example functions to simulate cloud status changes (for testing)
    const cycleCloudStatus = () => {
        const statuses: ConnectionStatus[] = ["connected", "connecting", "disconnected", "error"];
        const currentIndex = statuses.indexOf(cloudStatus);
        const nextIndex = (currentIndex + 1) % statuses.length;
        setCloudStatus(statuses[nextIndex]);
        if (statuses[nextIndex] === "error") {
            setCloudErrorMessage("Failed to sync with the Vibe Cloud. Please check your connection.");
        } else {
            setCloudErrorMessage(undefined);
        }
        if (statuses[nextIndex] === "connected") {
            setCloudResources({ storageUsed: `${(Math.random() * 10).toFixed(1)} GB`, storageTotal: "10 GB" });
        }
    };

    if (isLoadingIdentity) {
        return (
            <div className="w-[380px] p-4 bg-background text-foreground flex flex-col items-center justify-center h-48 rounded-lg shadow-2xl">
                <p>Loading identity...</p> {/* Add a spinner later */}
            </div>
        );
    }

    if (showImportWizard) {
        return (
            <div className="w-[380px] bg-background text-foreground flex flex-col shadow-2xl rounded-lg overflow-hidden">
                <ImportIdentityWizard onImportComplete={handleImportComplete} onCancel={handleCancelImport} />
            </div>
        );
    }

    if (showIdentitySettings) {
        return (
            <div className="w-[380px] bg-background text-foreground flex flex-col shadow-2xl rounded-lg overflow-hidden">
                <div className="p-4 border-b border-border">
                    <Button onClick={handleCloseSettings} variant="outline" size="sm">
                        &larr; Back to Main
                    </Button>
                </div>
                <IdentitySettings />
            </div>
        );
    }

    // Main render logic
    return (
        <div className="w-[380px] bg-background text-foreground flex flex-col shadow-2xl rounded-lg overflow-hidden">
            {/* Solid background */}
            {/* Header removed */}
            <div className="p-4 flex flex-col gap-4">
                {/* Content area with padding and gap */}
                <IdentityCard identity={currentIdentity} />
                <IdentitySwitcher
                    identities={identities}
                    currentIdentity={currentIdentity}
                    onSwitchIdentity={handleSwitchIdentity}
                    onAddIdentity={handleAddIdentity}
                    onImportIdentity={handleImportIdentity} // Pass the new handler
                />
                <CloudStatus status={cloudStatus} resources={cloudResources} errorMessage={cloudErrorMessage} />
            </div>
            <div className="mt-auto flex flex-col gap-2 p-4 border-t border-border bg-muted/30">
                {/* Temporary button to test cloud status cycling */}
                <Button onClick={cycleCloudStatus} variant="outline" size="sm">
                    Cycle Cloud Status (Test)
                </Button>
                <Button onClick={handleOpenSettings} variant="secondary" size="sm">
                    <Settings className="mr-2 h-4 w-4" /> Identity Settings
                </Button>
                <Button onClick={onResetDev} variant="destructive" size="sm">
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset (Dev Only)
                </Button>
            </div>
        </div>
    );
}

export default App;
