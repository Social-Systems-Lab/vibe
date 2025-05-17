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

export function App({ onResetDev }: AppProps) {
    const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(null); // Initialize with null
    const [allIdentities, setAllIdentities] = useState<Identity[]>([]); // Renamed from 'identities'
    const [isLoadingIdentity, setIsLoadingIdentity] = useState(true); // Loading state for identity
    const [showImportWizard, setShowImportWizard] = useState(false); // State for wizard visibility
    const [showIdentitySettings, setShowIdentitySettings] = useState(false); // State for settings visibility

    const loadIdentityData = useCallback(async () => {
        console.log("App.tsx: loadIdentityData triggered");
        setIsLoadingIdentity(true);
        try {
            // Get all identities from background script
            const getAllIdentitiesResponse = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_ALL_IDENTITIES",
                requestId: crypto.randomUUID().toString(),
            });

            let uiIdentities: Identity[] = [];
            if (getAllIdentitiesResponse && getAllIdentitiesResponse.type === "VIBE_AGENT_RESPONSE" && getAllIdentitiesResponse.payload?.identities) {
                uiIdentities = getAllIdentitiesResponse.payload.identities.map((id: StoredIdentity) => ({
                    did: id.did,
                    displayName: id.profile_name, // This is profile_name from vault
                    avatarUrl: id.profile_picture,
                }));
            } else if (getAllIdentitiesResponse && getAllIdentitiesResponse.type === "VIBE_AGENT_RESPONSE_ERROR") {
                console.error("Error fetching all identities:", getAllIdentitiesResponse.error);
            }
            setAllIdentities(uiIdentities);

            // Get active identity details from background script
            const activeIdentityDetailsResponse = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_ACTIVE_IDENTITY_DETAILS",
                requestId: crypto.randomUUID().toString(),
            });

            if (activeIdentityDetailsResponse && activeIdentityDetailsResponse.type === "VIBE_AGENT_RESPONSE" && activeIdentityDetailsResponse.payload?.did) {
                const activeStoredIdentity = activeIdentityDetailsResponse.payload;
                setCurrentIdentity({
                    did: activeStoredIdentity.did,
                    displayName: activeStoredIdentity.profileName, // Background returns profileName
                    avatarUrl: activeStoredIdentity.profilePictureUrl,
                });
            } else if (uiIdentities.length > 0) {
                console.warn("GET_ACTIVE_IDENTITY_DETAILS failed or returned no DID. Attempting to set first available identity as active.");
                const firstIdentity = uiIdentities[0];
                // setCurrentIdentity(firstIdentity); // Set UI immediately
                // Try to switch in background, loadIdentityData will be called again by storage listener if successful
                await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "SWITCH_ACTIVE_IDENTITY",
                    payload: { did: firstIdentity.did },
                    requestId: crypto.randomUUID().toString(),
                });
                // No need to call loadIdentityData here, storage listener will handle it.
            } else {
                setCurrentIdentity(null);
            }
            console.log("Loaded UI identities:", uiIdentities);
        } catch (error) {
            console.error("Error in loadIdentityData:", error);
            setCurrentIdentity(null); // Ensure currentIdentity is null on error
            setAllIdentities([]); // Ensure allIdentities is empty on error
        } finally {
            setIsLoadingIdentity(false);
        }
    }, []); // No dependencies, relies on manual calls or storage listener

    useEffect(() => {
        loadIdentityData();
    }, [loadIdentityData]); // loadIdentityData is stable due to useCallback([])

    // Listen for storage changes to auto-refresh identity data
    useEffect(() => {
        const storageChangedListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            // Check for changes in local storage (vibeVault) or session storage (activeIdentityIndex)
            if (
                (areaName === "local" && changes.vibeVault) ||
                (areaName === "session" && changes.activeIdentityIndex) // Key used in background.ts for session
            ) {
                console.log("App.tsx: Detected vault or activeIdentityIndex change, reloading identity data.");
                loadIdentityData();
            }
        };
        chrome.storage.onChanged.addListener(storageChangedListener);
        return () => {
            chrome.storage.onChanged.removeListener(storageChangedListener);
        };
    }, [loadIdentityData]);

    const handleSwitchIdentity = async (did: string) => {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SWITCH_ACTIVE_IDENTITY",
                payload: { did },
                requestId: crypto.randomUUID().toString(),
            });
            if (response && response.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                console.log("Successfully switched active identity in background to:", response.payload.newActiveDid);
                // loadIdentityData will be triggered by the storage listener.
            } else if (response && response.type === "VIBE_AGENT_RESPONSE_ERROR") {
                console.error("Error switching identity:", response.error);
                alert(`Error switching identity: ${response.error.message}`);
            }
        } catch (error: any) {
            console.error("Failed to send SWITCH_ACTIVE_IDENTITY message:", error);
            alert(`Failed to switch identity: ${error.message}`);
        }
    };

    const handleAddIdentity = async () => {
        console.log("Attempting to create new identity via background script.");
        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "CREATE_NEW_IDENTITY_FROM_SEED",
                requestId: crypto.randomUUID().toString(),
            });

            if (response && response.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                alert(`New identity created: ${response.payload.newIdentity.did}. You may need to switch to it and finalize setup (e.g., name it).`);
                // loadIdentityData will be triggered by the storage listener due to vault change.
                // Optionally, could switch to the new identity:
                // handleSwitchIdentity(response.payload.newIdentity.did);
            } else if (response && response.type === "VIBE_AGENT_RESPONSE_ERROR") {
                console.error("Error creating new identity:", response.error);
                alert(`Error creating new identity: ${response.error.message}`);
            } else {
                alert("Received an unexpected response from the background script during identity creation.");
            }
        } catch (error: any) {
            console.error("Error sending CREATE_NEW_IDENTITY_FROM_SEED message to background:", error);
            alert(`Failed to communicate with the background script for identity creation: ${error.message}`);
        }
    };

    const handleImportIdentity = async () => {
        setShowImportWizard(true); // Show the wizard
    };

    const handleImportComplete = async (mnemonic: string, password?: string) => {
        console.log("Attempting to import identity via background script:", { mnemonic, password });
        try {
            // NOTE: The action "IMPORT_IDENTITY_FROM_SEED" was mentioned in the original App.tsx
            // but "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES" is what's in background.ts for this.
            // Assuming "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES" is the correct one.
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES", // Corrected action name
                payload: { importedMnemonic: mnemonic, password }, // Payload matches background
                requestId: crypto.randomUUID().toString(),
            });

            console.log("Response from SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES:", response);

            if (response && response.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                alert(`Identity import process completed: ${response.payload.message}`);
                setShowImportWizard(false);
                loadIdentityData(); // Re-load identities as vault has changed
            } else if (response && response.type === "VIBE_AGENT_RESPONSE_ERROR") {
                alert(`Error importing identity: ${response.error?.message || "Unknown error"}`);
            } else {
                alert("Received an unexpected response from the background script during import.");
            }
        } catch (error: any) {
            console.error("Error sending SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES message to background:", error);
            alert(`Failed to communicate with the background script for import: ${error.message}`);
        }
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
                    identities={allIdentities} // Use renamed state
                    currentIdentityDid={currentIdentity?.did || null} // Updated prop
                    onSwitchIdentity={handleSwitchIdentity}
                    onAddIdentity={handleAddIdentity}
                    onImportIdentity={handleImportIdentity} // Pass the new handler
                />
                <CloudStatus activeDid={currentIdentity?.did || null} />
            </div>
            <div className="mt-auto flex flex-col gap-2 p-4 border-t border-border bg-muted/30">
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
