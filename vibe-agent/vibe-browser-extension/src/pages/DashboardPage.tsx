import React, { useState, useCallback, useEffect } from "react";
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { CloudStatus } from "@/components/cloud/CloudStatus"; // Adjusted path
import { Button } from "@/components/ui/button";
import { Settings, UserPlus, User, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DidDisplay } from "@/components/ui/DidDisplay";
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
            // For UNLOCK_REQUIRED_FOR_LAST_ACTIVE, useAppInitializer provides lastActiveDidHintAtom
            // We might want to pass that hint here if needed.
            // const lastActiveHint = lastActiveDidHintAtom.init; // Read initial value if needed
            loadIdentityData();
        }
    }, [appStatus, loadIdentityData]);

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
                action: "GET_NEXT_ACCOUNT_INDEX",
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage;

            if (nextIndexResponse?.type !== "VIBE_AGENT_RESPONSE" || typeof nextIndexResponse.payload?.accountIndex !== "number") {
                console.error("Failed to get next account index:", nextIndexResponse?.error);
                alert(`Error preparing for new identity: ${nextIndexResponse?.error?.message || "Could not get account index."}`);
                setIsLoading(false);
                return;
            }
            const accountIndex = nextIndexResponse.payload.accountIndex;

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
                accountIndex,
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
        <div className="bg-white text-foreground flex flex-col overflow-hidden h-full">
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

            {currentIdentity && <hr className="mx-4 border-gray-200" />}

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
