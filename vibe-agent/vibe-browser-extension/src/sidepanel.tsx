import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { VaultUnlockProvider } from "./contexts/VaultUnlockContext"; // Added
import { ExtensionWindowView } from "./components/ExtensionWindowView";
import type { Identity } from "./components/ExtensionWindowView";
import { UnlockScreen } from "./components/identity/UnlockScreen";
import { ImportIdentityWizard } from "./components/identity/ImportIdentityWizard";
import IdentitySettings from "./components/identity/IdentitySettings";
import { Button } from "@/components/ui/button";
import { Settings, RotateCcw } from "lucide-react";
import { SetupWizard } from "./components/setup/SetupWizard"; // Added
import { NewIdentitySetupWizard } from "./components/identity/NewIdentitySetupWizard"; // Added
import { VibeUserProfileView, type VibeUserProfileData } from "./components/VibeUserProfileView"; // Added for mocked profile

// Matches the structure in background.ts (profile_name, profile_picture)
interface StoredIdentity {
    did: string;
    profile_name: string | null;
    profile_picture?: string | null;
    derivationPath?: string; // Optional, from vault
}

function SidePanelApp() {
    const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(null);
    const [allIdentities, setAllIdentities] = useState<Identity[]>([]);
    const [isLoadingIdentity, setIsLoadingIdentity] = useState(true);
    const [showImportWizard, setShowImportWizard] = useState(false);
    const [showIdentitySettings, setShowIdentitySettings] = useState(false);
    const [showUnlockScreen, setShowUnlockScreen] = useState(false);
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [lastActiveDidHint, setLastActiveDidHint] = useState<string | undefined>(undefined);
    const [showCreateFirstIdentityPrompt, setShowCreateFirstIdentityPrompt] = useState(false); // This might be replaced by showNewIdentityWizard
    const [showSetupWizard, setShowSetupWizard] = useState(false); // Added
    const [showNewIdentityWizard, setShowNewIdentityWizard] = useState(false); // Added
    const [newIdentityWizardProps, setNewIdentityWizardProps] = useState<{
        accountIndex: number;
        isVaultInitiallyUnlocked: boolean;
    } | null>(null); // Added
    const [initializeAppState, setInitializeAppState] = useState<string | null>(null); // Moved and initialized
    const [showVibeUserProfile, setShowVibeUserProfile] = useState(false); // Added for mocked profile
    const [currentVibeProfileData, setCurrentVibeProfileData] = useState<VibeUserProfileData | null>(null); // Added for mocked profile

    const initializeApp = useCallback(async () => {
        console.log("SidePanelApp: initializeApp triggered");
        setIsLoadingIdentity(true);
        setShowUnlockScreen(false);
        setUnlockError(null);
        // Reset wizard states
        setShowSetupWizard(false);
        setShowNewIdentityWizard(false);
        setNewIdentityWizardProps(null);
        setShowCreateFirstIdentityPrompt(false); // Keep for now, might remove if NewIdentitySetupWizard covers it
        setInitializeAppState(null); // Reset initializeAppState

        try {
            const initResponse = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "init",
                requestId: crypto.randomUUID().toString(),
            });

            if (initResponse.type === "VIBE_AGENT_RESPONSE" && initResponse.payload?.code) {
                setInitializeAppState(initResponse.payload.code); // Set state
                if (initResponse.payload.code === "INITIALIZED_UNLOCKED") {
                    console.log("SidePanelApp initialized successfully, vault unlocked.");
                    await loadIdentityData();
                }
            } else if (initResponse.type === "VIBE_AGENT_RESPONSE_ERROR" && initResponse.error?.code) {
                const errorCode = initResponse.error.code;
                setInitializeAppState(errorCode); // Set state
                console.log("SidePanelApp init error code:", errorCode);
                if (errorCode === "UNLOCK_REQUIRED_FOR_LAST_ACTIVE") {
                    // Vault is locked, but we know the last active DID.
                    // Attempt to load basic data for this DID and show ExtensionWindowView.
                    // Unlock will be prompted only if an operation requires it.
                    console.log("Vault locked, last active DID known:", initResponse.error.lastActiveDid);
                    setLastActiveDidHint(initResponse.error.lastActiveDid);
                    // We don't set currentIdentity here directly from lastActiveDidHint yet,
                    // loadIdentityData will fetch all and try to set active.
                    // The key is to NOT showUnlockScreen immediately.
                    // We proceed to loadIdentityData which should fetch all identities.
                    // ExtensionWindowView will then be rendered. If an operation needs unlock, that flow will trigger.
                    await loadIdentityData(initResponse.error.lastActiveDid); // Pass hint to loadIdentityData
                } else if (errorCode === "VAULT_LOCKED_NO_LAST_ACTIVE") {
                    // Vault is locked, and no hint of last active DID. Must unlock.
                    setLastActiveDidHint(undefined);
                    setShowUnlockScreen(true);
                } else if (errorCode === "SETUP_NOT_COMPLETE") {
                    console.log("Setup not complete. Showing SetupWizard.");
                    setShowSetupWizard(true);
                } else if (errorCode === "FIRST_IDENTITY_CREATION_REQUIRED") {
                    console.log("First identity creation required. Showing NewIdentitySetupWizard.");
                    const nextAccountIndex = initResponse.error?.nextAccountIndex ?? 0;
                    setNewIdentityWizardProps({
                        accountIndex: nextAccountIndex,
                        isVaultInitiallyUnlocked: true,
                    });
                    setShowNewIdentityWizard(true);
                } else {
                    setUnlockError(initResponse.error?.message || "Failed to initialize.");
                    setShowUnlockScreen(true);
                }
            }
        } catch (error: any) {
            console.error("Critical error during side panel app initialization:", error);
            setUnlockError("A critical error occurred. Please try again or reset the extension.");
            setShowUnlockScreen(true);
        } finally {
            setIsLoadingIdentity(false);
        }
    }, []); // Removed loadIdentityData from dependencies, it's stable

    const loadIdentityData = useCallback(async (didHint?: string) => {
        console.log("SidePanelApp: loadIdentityData triggered, hint:", didHint);
        setIsLoadingIdentity(true);
        try {
            const getAllIdentitiesResponse = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_ALL_IDENTITIES",
                requestId: crypto.randomUUID().toString(),
            });

            let uiIdentities: Identity[] = [];
            if (getAllIdentitiesResponse?.type === "VIBE_AGENT_RESPONSE" && getAllIdentitiesResponse.payload?.identities) {
                uiIdentities = getAllIdentitiesResponse.payload.identities.map((id: StoredIdentity) => ({
                    did: id.did,
                    displayName: id.profile_name,
                    avatarUrl: id.profile_picture,
                }));
            } else if (getAllIdentitiesResponse?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                console.error("Error fetching all identities:", getAllIdentitiesResponse.error);
            }
            setAllIdentities(uiIdentities);

            const activeIdentityDetailsResponse = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_ACTIVE_IDENTITY_DETAILS",
                requestId: crypto.randomUUID().toString(),
            });

            if (activeIdentityDetailsResponse?.type === "VIBE_AGENT_RESPONSE" && activeIdentityDetailsResponse.payload?.did) {
                const activeStoredIdentity = activeIdentityDetailsResponse.payload;
                setCurrentIdentity({
                    did: activeStoredIdentity.did,
                    displayName: activeStoredIdentity.profileName,
                    avatarUrl: activeStoredIdentity.profilePictureUrl,
                });
            } else if (didHint && uiIdentities.length > 0) {
                // If we have a hint, try to find and set that identity from the fetched list
                const hintedIdentity = uiIdentities.find((id) => id.did === didHint);
                if (hintedIdentity) {
                    setCurrentIdentity(hintedIdentity);
                    // Optionally, ensure this is marked as active in the backend if it's not already.
                    // For now, just setting it in the UI. The background's lastActiveDid is the source of truth for next full unlock.
                } else if (uiIdentities.length > 0) {
                    // Fallback to first if hint not found (shouldn't happen if data is consistent)
                    setCurrentIdentity(uiIdentities[0]);
                }
            } else if (uiIdentities.length > 0 && !currentIdentity) {
                // If no hint and no current identity, set to first (e.g., after initial unlock)
                setCurrentIdentity(uiIdentities[0]);
                // Ensure background knows about this if it was a fresh load after unlock
                // This might be redundant if UNLOCK_VAULT already sets lastActiveDid
                // await chrome.runtime.sendMessage({
                //    type: "VIBE_AGENT_REQUEST",
                //    action: "SWITCH_ACTIVE_IDENTITY", // This might be too strong, maybe just update lastActiveDid
                //    payload: { did: uiIdentities[0].did },
                //    requestId: crypto.randomUUID().toString(),
                // });
            } else if (uiIdentities.length === 0) {
                setCurrentIdentity(null);
            }
            // If currentIdentity is already set and valid, loadIdentityData might just refresh `allIdentities`
            // and confirm `currentIdentity` is still in the list.
        } catch (error) {
            console.error("Error in loadIdentityData:", error);
            setCurrentIdentity(null);
            setAllIdentities([]);
        } finally {
            setIsLoadingIdentity(false);
        }
    }, []);

    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    // Listener for storage changes to re-init app
    useEffect(() => {
        const storageChangedListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if ((areaName === "local" && (changes.vibeVault || changes.lastActiveDid)) || (areaName === "session" && changes.activeIdentityIndex)) {
                console.log("SidePanelApp: Detected storage change, re-initializing app state.");
                initializeApp(); // This might hide the profile view if it was open, which is acceptable for now.
                setShowVibeUserProfile(false); // Explicitly hide profile view on major state changes
                setCurrentVibeProfileData(null);
            }
        };
        chrome.storage.onChanged.addListener(storageChangedListener);
        return () => {
            chrome.storage.onChanged.removeListener(storageChangedListener);
        };
    }, [initializeApp]);

    // Listener for messages from background script (e.g., to show mocked profile)
    useEffect(() => {
        const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
            if (message.type === "DISPLAY_MOCKED_PROFILE" && message.payload) {
                console.log("SidePanelApp: Received DISPLAY_MOCKED_PROFILE", message.payload);
                setCurrentVibeProfileData(message.payload as VibeUserProfileData);
                setShowVibeUserProfile(true);
                // Potentially hide other modals/wizards if they are open
                setShowSetupWizard(false);
                setShowNewIdentityWizard(false);
                setShowUnlockScreen(false);
                setShowImportWizard(false);
                setShowIdentitySettings(false);
                sendResponse({ success: true });
                return true;
            }
            return false; // Indicate that sendResponse will not be called asynchronously here for other messages
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => {
            chrome.runtime.onMessage.removeListener(messageListener);
        };
    }, []); // Empty dependency array means this runs once on mount and cleans up on unmount

    const handleCloseVibeUserProfile = () => {
        setShowVibeUserProfile(false);
        setCurrentVibeProfileData(null);
    };

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

            if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                setShowUnlockScreen(false);
                await loadIdentityData();
            } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
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
            if (!(response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success)) {
                console.error("Error switching identity:", response?.error);
                alert(`Error switching identity: ${response?.error?.message}`);
            }
            // loadIdentityData will be triggered by storage listener
        } catch (error: any) {
            console.error("Failed to send SWITCH_ACTIVE_IDENTITY message:", error);
            alert(`Failed to switch identity: ${error.message}`);
        }
    };

    const handleAddIdentity = async () => {
        // This will now open the NewIdentitySetupWizard in the side panel
        console.log("SidePanelApp: handleAddIdentity triggered");
        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_NEXT_ACCOUNT_INDEX",
                requestId: crypto.randomUUID().toString(),
            });
            if (response?.type === "VIBE_AGENT_RESPONSE" && typeof response.payload?.accountIndex === "number") {
                setNewIdentityWizardProps({
                    accountIndex: response.payload.accountIndex,
                    isVaultInitiallyUnlocked: !showUnlockScreen, // Vault is unlocked if unlock screen isn't shown
                });
                setShowNewIdentityWizard(true); // This will render NewIdentitySetupWizard with isFirstIdentitySetup = false
            } else {
                const errMsg = response?.error?.message || "Unknown error fetching account index.";
                console.error("Failed to get next account index:", errMsg, response?.error);
                alert(`Error preparing to add new identity: ${errMsg}. Please try again.`);
            }
        } catch (error: any) {
            console.error("Error in handleAddIdentity:", error.message || error);
            alert(`An error occurred while trying to add a new identity: ${error.message || "Please try again."}`);
        }
    };

    const handleImportIdentity = async () => {
        setShowImportWizard(true);
    };

    const handleImportComplete = async (mnemonic: string, password?: string) => {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES",
                payload: { importedMnemonic: mnemonic, password },
                requestId: crypto.randomUUID().toString(),
            });

            if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                alert(`Identity import process completed: ${response.payload.message}`);
                setShowImportWizard(false);
                loadIdentityData();
            } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                alert(`Error importing identity: ${response.error?.message || "Unknown error"}`);
            } else {
                alert("Received an unexpected response during import.");
            }
        } catch (error: any) {
            alert(`Failed to communicate for import: ${error.message}`);
        }
    };

    const handleCancelImport = () => {
        setShowImportWizard(false);
    };

    // Handler for SetupWizard completion
    const handleFullSetupComplete = () => {
        console.log("SidePanelApp: Full setup wizard completed.");
        setShowSetupWizard(false);
        initializeApp(); // Re-initialize to check if first identity setup is now needed
    };

    // Handler for NewIdentitySetupWizard completion (this is the function that does the work)
    const handleNewIdentityFinalized = async (details: {
        accountIndex: number;
        identityName: string | null;
        identityPicture?: string | null;
        cloudUrl: string;
        claimCode?: string | null;
        password?: string;
    }) => {
        console.log("SidePanelApp: handleNewIdentityFinalized called with:", details);
        // This function is passed as `onSetupComplete` to NewIdentitySetupWizard
        // It needs to send the message to the background script to finalize.
        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SETUP_NEW_IDENTITY_AND_FINALIZE",
                payload: {
                    accountIndexToUse: details.accountIndex,
                    identityName: details.identityName,
                    identityPicture: details.identityPicture,
                    cloudUrl: details.cloudUrl,
                    claimCode: details.claimCode,
                    password: details.password,
                },
                requestId: crypto.randomUUID().toString(),
            });

            if (response && response.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                console.log(`New identity "${details.identityName || "Unnamed"}" finalized!`);
                setShowNewIdentityWizard(false);
                setNewIdentityWizardProps(null);
                await loadIdentityData(); // Refresh identities
            } else {
                console.error("Error finalizing new identity setup:", response?.error);
                throw new Error(response?.error?.message || "Failed to finalize new identity.");
            }
        } catch (error: any) {
            console.error("Failed to send FINALIZE_NEW_IDENTITY_SETUP message:", error);
            // The wizard itself will handle displaying this error to the user if we throw it.
            throw error;
        }
    };

    const handleNewIdentityCancel = () => {
        console.log("SidePanelApp: New identity setup cancelled.");
        setShowNewIdentityWizard(false);
        setNewIdentityWizardProps(null);
    };

    const handleOpenSettings = () => {
        setShowIdentitySettings(true);
    };

    const handleCloseSettings = () => {
        setShowIdentitySettings(false);
        loadIdentityData();
    };

    const handleResetSetup = async () => {
        if (confirm("Are you sure you want to reset Vibe? This will clear your stored data.")) {
            try {
                await chrome.storage.local.clear();
                alert("Vibe has been reset. Reload the extension or click the icon again.");
                // Consider re-initializing or closing the side panel
                initializeApp();
            } catch (err) {
                console.error("Error resetting storage:", err);
                alert("Failed to reset Vibe.");
            }
        }
    };

    if (isLoadingIdentity) {
        return (
            <div className="w-full p-4 bg-background text-foreground flex flex-col items-center justify-center h-full">
                <p>Loading Vibe...</p>
            </div>
        );
    }

    if (showSetupWizard) {
        return (
            <div className="w-full h-full bg-background text-foreground">
                <SetupWizard onSetupComplete={handleFullSetupComplete} />
            </div>
        );
    }

    if (showNewIdentityWizard && newIdentityWizardProps) {
        return (
            <div className="w-full h-full bg-background text-foreground">
                <NewIdentitySetupWizard
                    accountIndex={newIdentityWizardProps.accountIndex}
                    isVaultInitiallyUnlocked={newIdentityWizardProps.isVaultInitiallyUnlocked}
                    isFirstIdentitySetup={
                        (newIdentityWizardProps.accountIndex === 0 && initializeAppState === "FIRST_IDENTITY_CREATION_REQUIRED") ||
                        showCreateFirstIdentityPrompt // If this prompt specifically triggered it
                    }
                    onSetupComplete={handleNewIdentityFinalized}
                    onCancel={handleNewIdentityCancel}
                    onResetVibe={handleResetSetup}
                />
            </div>
        );
    }

    if (showUnlockScreen) {
        return <UnlockScreen onUnlock={handleUnlock} isUnlocking={isUnlocking} unlockError={unlockError} lastActiveDidHint={lastActiveDidHint} />;
    }

    // If Vibe User Profile needs to be shown, render it above other views.
    if (showVibeUserProfile && currentVibeProfileData) {
        return <VibeUserProfileView profileData={currentVibeProfileData} onClose={handleCloseVibeUserProfile} />;
    }

    // showCreateFirstIdentityPrompt might be redundant if showNewIdentityWizard covers this.
    // For now, keeping it to see if init logic correctly prioritizes NewIdentitySetupWizard.
    if (showCreateFirstIdentityPrompt) {
        return (
            <div className="w-full p-6 text-center flex-grow flex flex-col justify-center items-center bg-background text-foreground">
                <h2 className="text-xl font-semibold mb-2">Welcome to Vibe!</h2>
                <p className="mb-4 text-sm">Create your first identity to get started.</p>
                <div className="gap-2 flex flex-col">
                    {/* This button should now trigger the NewIdentitySetupWizard */}
                    <Button
                        onClick={async () => {
                            // Logic similar to handleAddIdentity but specifically for first identity
                            console.log("Create First Identity button clicked");
                            const nextAccountIndex = 0; // First identity is always account 0
                            setNewIdentityWizardProps({
                                accountIndex: nextAccountIndex,
                                isVaultInitiallyUnlocked: true, // Vault is set up, just no identities
                            });
                            setShowCreateFirstIdentityPrompt(false); // Hide this prompt
                            setShowNewIdentityWizard(true); // This will render NewIdentitySetupWizard with isFirstIdentitySetup = true
                        }}
                    >
                        Create First Identity
                    </Button>
                    <Button onClick={handleResetSetup} variant="outline">
                        Reset Vibe
                    </Button>
                </div>
            </div>
        );
    }

    if (showImportWizard) {
        return (
            <div className="w-full bg-background text-foreground flex flex-col shadow-2xl rounded-lg overflow-hidden">
                <ImportIdentityWizard onImportComplete={handleImportComplete} onCancel={handleCancelImport} />
            </div>
        );
    }

    if (showIdentitySettings) {
        return (
            <div className="w-full bg-background text-foreground flex flex-col shadow-2xl rounded-lg overflow-hidden">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <Button onClick={handleCloseSettings} variant="outline" size="sm">
                        &larr; Back
                    </Button>
                </div>
                <div className="flex-grow overflow-auto">
                    <IdentitySettings />
                </div>
                <div className="p-4 border-t border-border bg-muted/30">
                    <Button onClick={handleResetSetup} variant="destructive" size="sm" className="w-full">
                        <RotateCcw className="mr-2 h-4 w-4" /> Reset Vibe
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <ExtensionWindowView
            currentIdentity={currentIdentity}
            allIdentities={allIdentities}
            onSwitchIdentity={handleSwitchIdentity}
            onAddIdentity={handleAddIdentity}
            onImportIdentity={handleImportIdentity}
            onOpenSettings={handleOpenSettings}
        />
    );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <VaultUnlockProvider>
            <SidePanelApp />
        </VaultUnlockProvider>
    </React.StrictMode>
);
