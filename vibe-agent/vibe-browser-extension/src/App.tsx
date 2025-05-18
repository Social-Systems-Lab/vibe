import React, { useState, useEffect, useCallback } from "react"; // Added useCallback
import "./index.css";
import { IdentityCard } from "./components/identity/IdentityCard";
import { IdentitySwitcher } from "./components/identity/IdentitySwitcher";
import IdentitySettings from "./components/identity/IdentitySettings"; // Import IdentitySettings as default
import { NewIdentitySetupWizard } from "./components/identity/NewIdentitySetupWizard"; // Import the new wizard
import { UnlockScreen } from "./components/identity/UnlockScreen"; // Import UnlockScreen
import { CloudStatus } from "./components/cloud/CloudStatus";
import { ImportIdentityWizard } from "./components/identity/ImportIdentityWizard"; // Import the new wizard
import { Button } from "@/components/ui/button"; // For a potential settings button
import { Settings, RotateCcw } from "lucide-react"; // Added RotateCcw for reset icon
import { ExtensionWindowView } from "./components/ExtensionWindowView"; // Import the new view component

// Prop types for App component
interface AppProps {
    onResetDev?: () => Promise<void>; // Or () => void if preferred
}

// Matches the structure in background.ts (profile_name, profile_picture)
interface StoredIdentity {
    did: string;
    profile_name: string | null;
    profile_picture?: string | null;
    derivationPath?: string; // Optional, from vault
}

// UI-facing Identity type is now in ExtensionWindowView.tsx,
// but App.tsx still needs it for state typing.
// For a cleaner approach, this should be in a shared types file.
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
    const [showUnlockScreen, setShowUnlockScreen] = useState(false);
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [lastActiveDidHint, setLastActiveDidHint] = useState<string | undefined>(undefined);
    const [showCreateFirstIdentityPrompt, setShowCreateFirstIdentityPrompt] = useState(false); // New state

    const initializeApp = useCallback(async () => {
        console.log("App.tsx: initializeApp triggered");
        setIsLoadingIdentity(true);
        setShowUnlockScreen(false); // Reset unlock screen visibility
        setUnlockError(null);
        setShowCreateFirstIdentityPrompt(false); // Reset prompt

        try {
            const initResponse = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "init",
                requestId: crypto.randomUUID().toString(),
            });

            if (initResponse.type === "VIBE_AGENT_RESPONSE" && initResponse.payload?.code === "INITIALIZED_UNLOCKED") {
                console.log("App initialized successfully, vault unlocked.");
                await loadIdentityData(); // Load full identity data
            } else if (initResponse.type === "VIBE_AGENT_RESPONSE_ERROR") {
                const errorCode = initResponse.error?.code;
                console.log("App init error code:", errorCode);
                if (errorCode === "UNLOCK_REQUIRED_FOR_LAST_ACTIVE" || errorCode === "VAULT_LOCKED_NO_LAST_ACTIVE") {
                    setLastActiveDidHint(initResponse.error?.lastActiveDid);
                    setShowUnlockScreen(true);
                } else if (errorCode === "SETUP_NOT_COMPLETE") {
                    // This case is handled by src/index.tsx which shows "Start Setup" button
                    console.error("Setup not complete. Popup should show 'Start Setup'.");
                    // App.tsx won't be rendered by Popup if setup is not complete.
                } else if (errorCode === "FIRST_IDENTITY_CREATION_REQUIRED") {
                    console.log("First identity creation required.");
                    setShowCreateFirstIdentityPrompt(true);
                } else {
                    // Generic vault locked or other error
                    setUnlockError(initResponse.error?.message || "Failed to initialize.");
                    setShowUnlockScreen(true); // Show unlock screen for generic lock state too
                }
            }
        } catch (error: any) {
            console.error("Critical error during app initialization:", error);
            setUnlockError("A critical error occurred. Please try again or reset the extension.");
            setShowUnlockScreen(true); // Show unlock screen with critical error
        } finally {
            setIsLoadingIdentity(false);
        }
    }, []);

    const loadIdentityData = useCallback(async () => {
        console.log("App.tsx: loadIdentityData triggered after init/unlock");
        // This function now assumes the vault is (or has just been) unlocked if it's called.
        // It focuses on loading the actual identity details.
        setIsLoadingIdentity(true);
        try {
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
        initializeApp(); // Call initializeApp on mount
    }, [initializeApp]);

    // Listen for storage changes to auto-refresh identity data
    useEffect(() => {
        const storageChangedListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (
                (areaName === "local" && (changes.vibeVault || changes.lastActiveDid)) || // Listen for lastActiveDid change too
                (areaName === "session" && changes.activeIdentityIndex)
            ) {
                console.log("App.tsx: Detected storage change, re-initializing app state.");
                // Re-initialize, which will call loadIdentityData if unlock is successful or not needed
                initializeApp();
            }
        };
        chrome.storage.onChanged.addListener(storageChangedListener);
        return () => {
            chrome.storage.onChanged.removeListener(storageChangedListener);
        };
    }, [initializeApp]); // Depend on initializeApp

    const handleUnlock = async (password: string) => {
        setIsUnlocking(true);
        setUnlockError(null);
        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "UNLOCK_VAULT",
                payload: { password },
                requestId: crypto.randomUUID().toString(),
            });

            if (response && response.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                console.log("Vault unlocked successfully via UnlockScreen.");
                setShowUnlockScreen(false); // Hide unlock screen
                await loadIdentityData(); // Load identities now that vault is unlocked
            } else if (response && response.type === "VIBE_AGENT_RESPONSE_ERROR") {
                setUnlockError(response.error?.message || "Failed to unlock vault.");
            } else {
                setUnlockError("Unexpected response from unlock operation.");
            }
        } catch (error: any) {
            setUnlockError(error.message || "An error occurred during unlock.");
        } finally {
            setIsUnlocking(false);
        }
    };

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

    const handleAddIdentity = () => {
        console.log("Opening add identity page.");
        chrome.tabs.create({ url: chrome.runtime.getURL("addIdentity.html") });
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

    // const handleNewIdentitySetupComplete and related logic were removed as they are
    // now handled by addIdentity.html or the sidepanel.tsx internal wizard.

    const handleOpenSettings = () => {
        setShowIdentitySettings(true);
    };

    const handleCloseSettings = () => {
        setShowIdentitySettings(false);
        loadIdentityData(); // Refresh data when closing settings
    };

    const handleResetSetup = async () => {
        if (confirm("Are you sure you want to reset Vibe? This will clear your stored data.")) {
            try {
                await chrome.storage.local.clear(); // Clears everything for simplicity in dev
                console.log("Storage cleared for reset.");
                alert("Vibe has been reset. Reload the extension or click the icon again.");
            } catch (err) {
                console.error("Error resetting storage:", err);
                alert("Failed to reset Vibe.");
            }
        }
    };

    if (isLoadingIdentity) {
        return (
            <div className="p-4 bg-background text-foreground flex flex-col items-center justify-center h-48 rounded-lg shadow-2xl">
                <p>Loading...</p> {/* Simplified loading message */}
            </div>
        );
    }

    if (showUnlockScreen) {
        return <UnlockScreen onUnlock={handleUnlock} isUnlocking={isUnlocking} unlockError={unlockError} lastActiveDidHint={lastActiveDidHint} />;
    }

    if (showCreateFirstIdentityPrompt) {
        return (
            <div className="p-6 text-center flex-grow flex flex-col justify-center items-center bg-background text-foreground">
                <h2 className="text-xl font-semibold mb-2">Welcome to Vibe!</h2>
                <p className="mb-4 text-sm">Your vault is set up. Now, let's create your first identity to get started.</p>
                <div className="gap-2 flex flex-col">
                    <Button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("addIdentity.html") })}>Create First Identity</Button>
                    <Button onClick={handleResetSetup}>Reset Vibe</Button>
                </div>
            </div>
        );
    }

    if (showImportWizard) {
        return (
            <div className="bg-background text-foreground flex flex-col shadow-2xl rounded-lg overflow-hidden">
                <ImportIdentityWizard onImportComplete={handleImportComplete} onCancel={handleCancelImport} />
            </div>
        );
    }

    if (showIdentitySettings) {
        return (
            <div className="bg-background text-foreground flex flex-col shadow-2xl rounded-lg overflow-hidden">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <Button onClick={handleCloseSettings} variant="outline" size="sm">
                        &larr; Back to Main
                    </Button>
                </div>
                <div className="flex-grow overflow-auto">
                    {" "}
                    {/* Allow settings content to scroll if needed */}
                    <IdentitySettings />
                </div>
                {/* Reset Vibe button moved here, shown only in settings view */}
                {onResetDev && (
                    <div className="p-4 border-t border-border bg-muted/30">
                        <Button onClick={onResetDev} variant="destructive" size="sm" className="w-full">
                            <RotateCcw className="mr-2 h-4 w-4" /> Reset Vibe
                        </Button>
                    </div>
                )}
            </div>
        );
    }

    // The direct rendering of NewIdentitySetupWizard for adding identities is removed from App.tsx.
    // The side panel handles its own instance of NewIdentitySetupWizard.
    // The popup's "add identity" button opens addIdentity.html.

    // Main render logic
    return (
        <ExtensionWindowView
            currentIdentity={currentIdentity}
            allIdentities={allIdentities}
            onSwitchIdentity={handleSwitchIdentity}
            onAddIdentity={handleAddIdentity}
            onImportIdentity={handleImportIdentity}
            onOpenSettings={handleOpenSettings}
            // onResetDev prop removed from ExtensionWindowView invocation
        />
    );
}
