import React, { useState, useCallback, useEffect } from "react";
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { CloudStatus } from "@/components/cloud/CloudStatus"; // Adjusted path
import { Button } from "@/components/ui/button";
import { Settings, UserPlus, User, Loader2, Settings2 } from "lucide-react"; // Added Settings2
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DidDisplay } from "@/components/ui/DidDisplay";
import { PENDING_CONSENT_REQUEST_KEY } from "../background-modules/action-handlers/app-session.handler"; // Import the key
import { CONSENT_OUTCOME_TOAST_KEY } from "./ConsentRequestPage"; // Import toast key
import {
    currentIdentityAtom,
    allIdentitiesAtom,
    type Identity, // Use Identity type from identityAtoms
    newIdentityWizardPropsAtom,
} from "../store/identityAtoms";
import { isLoadingIdentityAtom, appStatusAtom } from "../store/appAtoms"; // For loading state and app status

// Define ChromeMessage type, consider moving to a shared types file
interface ChromeMessage {
    type: string;
    payload?: any;
    error?: { message?: string; [key: string]: any };
    [key: string]: any;
}

// Matches the structure in background.ts (profile_name, profile_picture)
// This might be redundant if Identity from identityAtoms.ts covers it
interface StoredIdentity {
    did: string;
    profile_name: string | null;
    profile_picture?: string | null;
    derivationPath?: string; // Optional, from vault
}

export function DashboardPage() {
    const [currentIdentity, setCurrentIdentity] = useAtom(currentIdentityAtom);
    const [allIdentities, setAllIdentities] = useAtom(allIdentitiesAtom);
    const [isLoading, setIsLoading] = useAtom(isLoadingIdentityAtom);
    const [appStatus] = useAtom(appStatusAtom);
    const [, setLocation] = useLocation();
    const [, setNewIdentityProps] = useAtom(newIdentityWizardPropsAtom);

    const [isCloudStatusExpanded, setIsCloudStatusExpanded] = useState(false);
    const [statusToggleInfo, setStatusToggleInfo] = useState<{
        Icon: React.ElementType;
        color: string;
        isLoading: boolean;
    }>({ Icon: Loader2, color: "text-slate-500", isLoading: true });

    // State for active tab's app context
    // TODO: Define a proper interface for ActiveAppContext
    // interface ActiveAppContextType {
    //     appName: string;
    //     appIconUrl?: string;
    //     origin: string;
    //     appId: string;
    //     tabId: number;
    //     grantedPermissions: Record<string, string>; // Assuming PermissionSetting is string for now
    //     manifestRequestedPermissions?: string[]; // Optional: full list from manifest
    // }
    const [activeAppContext, setActiveAppContext] = useState<any | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showToast, setShowToast] = useState(false);

    const loadIdentityData = useCallback(
        async (didHint?: string) => {
            console.log("DashboardPage: loadIdentityData triggered, hint:", didHint);
            setIsLoading(true);
            try {
                const getAllIdentitiesResponse = (await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "GET_ALL_IDENTITIES",
                    requestId: crypto.randomUUID().toString(),
                })) as ChromeMessage;

                let uiIdentities: Identity[] = [];
                if (getAllIdentitiesResponse?.type === "VIBE_AGENT_RESPONSE" && getAllIdentitiesResponse.payload?.identities) {
                    uiIdentities = getAllIdentitiesResponse.payload.identities.map((id: StoredIdentity) => ({
                        did: id.did,
                        displayName: id.profile_name,
                        avatarUrl: id.profile_picture,
                        // Ensure all fields from the Identity interface in identityAtoms.ts are mapped
                        profile_name: id.profile_name,
                        profile_picture: id.profile_picture,
                        derivationPath: id.derivationPath,
                    }));
                } else if (getAllIdentitiesResponse?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                    console.error("Error fetching all identities:", getAllIdentitiesResponse.error);
                    // Potentially set an error state for the UI
                }
                setAllIdentities(uiIdentities);

                const activeIdentityDetailsResponse = (await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "GET_ACTIVE_IDENTITY_DETAILS",
                    requestId: crypto.randomUUID().toString(),
                })) as ChromeMessage;

                if (activeIdentityDetailsResponse?.type === "VIBE_AGENT_RESPONSE" && activeIdentityDetailsResponse.payload?.did) {
                    const activeStoredIdentity = activeIdentityDetailsResponse.payload;
                    setCurrentIdentity({
                        did: activeStoredIdentity.did,
                        displayName: activeStoredIdentity.profileName,
                        avatarUrl: activeStoredIdentity.profilePictureUrl,
                        profile_name: activeStoredIdentity.profileName, // ensure mapping
                        profile_picture: activeStoredIdentity.profilePictureUrl, // ensure mapping
                        // derivationPath might not be part of activeIdentityDetails, check background script
                    });
                } else if (didHint && uiIdentities.length > 0) {
                    const hintedIdentity = uiIdentities.find((id) => id.did === didHint);
                    if (hintedIdentity) {
                        setCurrentIdentity(hintedIdentity);
                    } else if (uiIdentities.length > 0) {
                        setCurrentIdentity(uiIdentities[0]); // Fallback to first
                    }
                } else if (uiIdentities.length > 0 && !currentIdentity) {
                    setCurrentIdentity(uiIdentities[0]); // Default to first if no active one set
                } else if (uiIdentities.length === 0) {
                    setCurrentIdentity(null); // No identities found
                }
            } catch (error) {
                console.error("Error in loadIdentityData (DashboardPage):", error);
                setCurrentIdentity(null);
                setAllIdentities([]);
                // Potentially set an error state for the UI
            } finally {
                setIsLoading(false);
            }
        },
        [setIsLoading, setAllIdentities, setCurrentIdentity]
    ); // Removed currentIdentity from deps

    useEffect(() => {
        // Load data when the component mounts and app status is appropriate
        // (e.g., INITIALIZED_UNLOCKED or UNLOCK_REQUIRED_FOR_LAST_ACTIVE if we want to show data behind an unlock overlay)
        if (appStatus === "INITIALIZED_UNLOCKED" || appStatus === "UNLOCK_REQUIRED_FOR_LAST_ACTIVE") {
            loadIdentityData();
        }
    }, [appStatus, loadIdentityData]);

    // Effect to fetch active tab app context and listen for updates
    useEffect(() => {
        const fetchContext = async () => {
            try {
                const response = await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "GET_ACTIVE_TAB_APP_CONTEXT",
                    requestId: crypto.randomUUID().toString(),
                });
                if (response?.payload?.success && response.payload.appContext) {
                    setActiveAppContext(response.payload.appContext);
                    console.log("DashboardPage: Active app context loaded", response.payload.appContext);
                } else {
                    setActiveAppContext(null);
                    console.log("DashboardPage: No active app context found or error", response?.payload?.error);
                }
            } catch (error) {
                console.error("DashboardPage: Error fetching active app context:", error);
                setActiveAppContext(null);
            }
        };

        fetchContext();

        const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
            if (message.type === "UPDATE_SIDE_PANEL_APP_CONTEXT") {
                console.log("DashboardPage: Received UPDATE_SIDE_PANEL_APP_CONTEXT", message.payload);
                setActiveAppContext(message.payload.appContext); // Directly use the context from the message
                // No need to call fetchContext again if the background sends the full context.
                return true; // Indicate async response if we were to send one
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);

        return () => {
            chrome.runtime.onMessage.removeListener(messageListener);
        };
    }, []); // Runs on mount and cleans up

    // Effect to check for and display toast messages from session storage
    useEffect(() => {
        const checkAndShowToast = async () => {
            try {
                const result = await chrome.storage.session.get(CONSENT_OUTCOME_TOAST_KEY);
                const message = result[CONSENT_OUTCOME_TOAST_KEY];
                if (message) {
                    setToastMessage(message);
                    setShowToast(true);
                    await chrome.storage.session.remove(CONSENT_OUTCOME_TOAST_KEY);
                    setTimeout(() => {
                        setShowToast(false);
                        setToastMessage(null);
                    }, 3000); // Show toast for 3 seconds
                }
            } catch (error) {
                console.error("DashboardPage: Error checking for toast message:", error);
            }
        };
        checkAndShowToast();
        // This effect should ideally run when the page becomes visible or after navigation.
        // For wouter, if this page re-mounts on navigation to "/", this is fine.
        // If not, a more sophisticated trigger might be needed (e.g. listening to location changes).
    }, [setLocation]); // Re-run if setLocation changes, though it's stable. Primarily for mount.

    const handleManageAppContextPermissions = async () => {
        if (!activeAppContext || !currentIdentity?.did) {
            console.error("DashboardPage: Cannot manage permissions, activeAppContext or currentIdentity.did is missing.");
            return;
        }

        const consentRequestDataForPage = {
            appName: activeAppContext.appName,
            appIconUrl: activeAppContext.appIconUrl,
            origin: activeAppContext.origin,
            appId: activeAppContext.appId,
            // Use manifestRequestedPermissions if available, otherwise fallback to keys of grantedPermissions
            requestedPermissions: activeAppContext.manifestRequestedPermissions || Object.keys(activeAppContext.grantedPermissions || {}),
            activeDid: currentIdentity.did,
            // Create a unique ID for this re-consent flow.
            // The original consentRequestId from init might not be relevant or available here.
            consentRequestId: `reconsent_${activeAppContext.tabId || "unknown"}_${activeAppContext.appId}_${Date.now()}`,
            currentPermissions: activeAppContext.grantedPermissions, // Pass current permissions
        };

        try {
            await chrome.storage.session.set({ [PENDING_CONSENT_REQUEST_KEY]: consentRequestDataForPage });
            console.log("DashboardPage: Stored data for re-consent:", consentRequestDataForPage);
            setLocation("/consent-request");
        } catch (error) {
            console.error("DashboardPage: Error setting up for re-consent:", error);
            // Optionally, show an error to the user
        }
    };

    const handleSwitchIdentity = useCallback(async (did: string) => {
        try {
            const response = (await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SWITCH_ACTIVE_IDENTITY",
                payload: { did },
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage;
            if (!(response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success)) {
                console.error("Error switching identity:", response?.error);
                alert(`Error switching identity: ${response?.error?.message}`);
            }
            // Data will be reloaded by storage listener in useAppInitializer or by this component's useEffect if appStatus changes.
            // Or, explicitly call loadIdentityData() if immediate refresh is desired without relying on storage events.
            // await loadIdentityData(); // Uncomment if direct refresh is needed
        } catch (error: any) {
            console.error("Failed to send SWITCH_ACTIVE_IDENTITY message:", error);
            alert(`Failed to switch identity: ${error.message}`);
        }
    }, []); // loadIdentityData removed from deps, switch should trigger storage change

    const handleAddIdentity = useCallback(async () => {
        setIsLoading(true);
        try {
            const nextIndexResponse = (await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_NEXT_IDENTITY_INDEX",
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage;

            if (nextIndexResponse?.type !== "VIBE_AGENT_RESPONSE" || typeof nextIndexResponse.payload?.identityIndex !== "number") {
                console.error("Failed to get next account index:", nextIndexResponse?.error);
                alert(`Error preparing for new identity: ${nextIndexResponse?.error?.message || "Could not get account index."}`);
                setIsLoading(false);
                return;
            }
            const identityIndex = nextIndexResponse.payload.identityIndex;

            const lockStateResponse = (await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_LOCK_STATE",
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage;

            if (lockStateResponse?.type !== "VIBE_AGENT_RESPONSE" || typeof lockStateResponse.payload?.isUnlocked !== "boolean") {
                console.error("Failed to get lock state:", lockStateResponse?.error);
                alert(`Error preparing for new identity: ${lockStateResponse?.error?.message || "Could not get lock state."}`);
                setIsLoading(false);
                return;
            }
            const isVaultInitiallyUnlocked = lockStateResponse.payload.isUnlocked;

            setNewIdentityProps({
                identityIndex,
                isVaultInitiallyUnlocked,
            });
            setLocation("/setup/new-identity");
        } catch (error: any) {
            console.error("Error in handleAddIdentity:", error);
            alert(`An unexpected error occurred: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [setLocation, setNewIdentityProps, setIsLoading]);
    const handleOpenSettings = () => setLocation("/settings");
    // const handleImportIdentity = () => setLocation("/import-identity"); // If this action is still needed

    const handleCloudStatusUpdate = useCallback((newStatusInfo: { Icon: React.ElementType; color: string; rawStatus: string; isLoading: boolean }) => {
        setStatusToggleInfo((currentStatusInfo) => {
            if (
                currentStatusInfo.Icon !== newStatusInfo.Icon ||
                currentStatusInfo.color !== newStatusInfo.color ||
                currentStatusInfo.isLoading !== newStatusInfo.isLoading
            ) {
                // Return an object matching the state's type (without rawStatus)
                return { Icon: newStatusInfo.Icon, color: newStatusInfo.color, isLoading: newStatusInfo.isLoading };
            }
            return currentStatusInfo; // No change
        });
    }, []); // Empty dependency array is correct as setStatusToggleInfo is stable

    const toggleCloudStatusExpansion = () => setIsCloudStatusExpanded(!isCloudStatusExpanded);

    const getInitials = (name?: string | null) => {
        if (!name) return "ID";
        const names = name.split(" ");
        return names.length > 1 ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase() : name.substring(0, 2).toUpperCase();
    };

    if (isLoading && !currentIdentity) {
        // Show full page loader only if no identity is yet visible
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-background text-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p>Loading your Vibe...</p>
            </div>
        );
    }

    const otherDisplayIdentities = allIdentities.filter((id) => id.did !== currentIdentity?.did);

    return (
        <div className="bg-white text-foreground flex flex-col overflow-hidden h-full relative">
            {/* Toast Notification */}
            {showToast && toastMessage && (
                <div
                    style={{
                        position: "fixed",
                        bottom: "20px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        backgroundColor: toastMessage.includes("denied") ? "#f8d7da" : "#d4edda", // Red for denied, Green for granted
                        color: toastMessage.includes("denied") ? "#721c24" : "#155724",
                        padding: "10px 20px",
                        borderRadius: "5px",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                        zIndex: 1000, // Ensure it's on top
                        fontSize: "14px",
                    }}
                >
                    {toastMessage}
                </div>
            )}

            <div style={{ background: "linear-gradient(to bottom right, #a18ce8, #ae8deb)" }} className="h-16 flex items-center px-4 relative"></div>
            <div className="px-4 pb-4">
                {currentIdentity ? (
                    <>
                        <div className="flex items-start -mt-5 ml-2 relative">
                            <Avatar className="h-20 w-20 border-4 border-white rounded-full shadow-md mr-4">
                                <AvatarImage src={currentIdentity.avatarUrl || undefined} alt={currentIdentity.displayName || "User Avatar"} />
                                <AvatarFallback className="text-xl">{getInitials(currentIdentity.displayName)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-grow pt-6 relative">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-800">{currentIdentity.displayName || "Unnamed Identity"}</h2>
                                        <DidDisplay did={currentIdentity.did} className="text-xs text-gray-500" />
                                    </div>
                                    <button
                                        onClick={toggleCloudStatusExpansion}
                                        className="p-1.5 rounded-full hover:bg-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-label="Toggle Cloud Status"
                                        disabled={statusToggleInfo.isLoading && !isCloudStatusExpanded}
                                    >
                                        <statusToggleInfo.Icon
                                            className={`h-5 w-5 ${statusToggleInfo.color} ${
                                                statusToggleInfo.Icon === Loader2 && statusToggleInfo.isLoading ? "animate-spin" : ""
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                        {isCloudStatusExpanded && (
                            <div className="mt-2">
                                <CloudStatus activeDid={currentIdentity.did} onStatusUpdate={handleCloudStatusUpdate} />
                            </div>
                        )}
                        {/* Render CloudStatus non-visibly if not expanded to keep statusToggleInfo updated.
                            This ensures the icon reflects the current status even before first expansion. */}
                        {!isCloudStatusExpanded && currentIdentity.did && (
                            <div style={{ display: "none" }}>
                                <CloudStatus activeDid={currentIdentity.did} onStatusUpdate={handleCloudStatusUpdate} />
                            </div>
                        )}
                    </>
                ) : (
                    <div className="w-full p-4 rounded-lg border-2 border-dashed border-muted-foreground/50 flex flex-col items-center justify-center h-32 text-center mt-4">
                        {isLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
                        ) : (
                            <User className="h-8 w-8 text-muted-foreground mb-2" />
                        )}
                        <p className="text-muted-foreground text-sm font-medium">{isLoading ? "Loading identities..." : "No active identity."}</p>
                        {!isLoading && <p className="text-muted-foreground text-xs">Create or select one using the options below.</p>}
                    </div>
                )}
            </div>
            {/* Section for Active App Context - Condensed */}
            {activeAppContext && currentIdentity && (
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center space-x-2 overflow-hidden">
                        {activeAppContext.appIconUrl && (
                            <img
                                src={activeAppContext.appIconUrl}
                                alt="App Icon"
                                className="h-6 w-6 rounded flex-shrink-0" // Smaller icon
                            />
                        )}
                        <span className="text-sm font-medium text-gray-800 truncate">{activeAppContext.appName || "Current Application"}</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-500 hover:text-gray-700" // Smaller button
                        onClick={handleManageAppContextPermissions}
                        aria-label="Manage App Permissions"
                    >
                        <Settings2 className="h-4 w-4" />
                    </Button>
                </div>
            )}
            {!activeAppContext && currentIdentity && (
                <div className="px-4 py-3 text-xs text-gray-500 border-b border-gray-200">No specific application context active in the current tab.</div>
            )}
            {/* No extra hr needed if the above sections handle borders */}
            <div className="flex flex-col gap-1 p-4">
                <h3 className="text-xs font-medium text-gray-500 mb-2">Other Identities</h3>
                {otherDisplayIdentities.map((identity) => (
                    <Button
                        key={identity.did}
                        variant="ghost"
                        className="w-full justify-start h-10 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => handleSwitchIdentity(identity.did)}
                    >
                        <User className="mr-3 h-5 w-5 text-gray-500" />
                        <span className="truncate">{identity.displayName || identity.did.substring(0, 20) + "..."}</span>
                    </Button>
                ))}
                <Button onClick={handleAddIdentity} variant="ghost" className="w-full justify-start h-10 text-sm text-gray-700 hover:bg-gray-100 mt-1">
                    <UserPlus className="mr-3 h-5 w-5 text-gray-500" />
                    <span>Add identity</span>
                </Button>
                <Button onClick={handleOpenSettings} variant="ghost" className="w-full justify-start h-10 text-sm text-gray-700 hover:bg-gray-100">
                    <Settings className="mr-3 h-5 w-5 text-gray-500" />
                    <span>Settings</span>
                </Button>
                {/* <Button onClick={handleImportIdentity} variant="ghost" className="w-full justify-start h-10 text-sm text-gray-700 hover:bg-gray-100">
                    <Download className="mr-3 h-5 w-5 text-gray-500" /> Import Identity
                </Button> */}
            </div>
        </div>
    );
}

export default DashboardPage;
