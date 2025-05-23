import React, { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, HardDrive, AlertTriangle, Loader2, ExternalLink, ChevronRight, ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Simplified Identity type, align with background.ts and server response
interface Identity {
    identityDid: string;
    isAdmin: boolean;
    profileName?: string;
    profilePictureUrl?: string;
    instanceId?: string;
    instanceStatus?: string;
    instanceUrl?: string;
    instanceCreatedAt?: string;
    instanceUpdatedAt?: string;
    instanceErrorDetails?: string;
}

// Define terminal states for instance provisioning/status
const TERMINAL_INSTANCE_STATUSES = ["completed", "failed", "deprovisioned", "error"]; // "error" can be from API or instance
const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds

interface StatusInfo {
    Icon: React.ElementType;
    color: string;
    rawStatus: string; // e.g., "Connected", "Loading...", "Error"
    isLoading: boolean; // To potentially disable the toggle button during initial load
}

interface CloudStatusProps {
    activeDid: string | null; // The DID of the currently active identity
    onStatusUpdate?: (statusInfo: StatusInfo) => void;
}

// Helper to send messages to background script
const sendMessageToBackground = (action: string, payload?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "VIBE_AGENT_REQUEST", action, payload, requestId: crypto.randomUUID() }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (response && response.type === "VIBE_AGENT_RESPONSE_ERROR") {
                reject(response.error || { message: "Unknown background error" });
            } else if (response && response.payload) {
                resolve(response.payload);
            } else {
                // Handle cases where response might be undefined or not have payload (e.g. simple ack)
                resolve(response);
            }
        });
    });
};

export const CloudStatus: React.FC<CloudStatusProps> = ({ activeDid, onStatusUpdate }) => {
    const [identityDetails, setIdentityDetails] = useState<Identity | null>(null);
    const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true); // For initial load state
    const [currentStatusIcon, setCurrentStatusIcon] = useState<React.ElementType>(Loader2);
    const [currentIconColor, setCurrentIconColor] = useState<string>("text-slate-500");
    const [currentRawStatus, setCurrentRawStatus] = useState<string>("Fetching status...");
    const [isLoading, setIsLoading] = useState<boolean>(false); // For ongoing polling, distinct from initial load
    const [error, setError] = useState<string | null>(null);
    const [isLoginRequired, setIsLoginRequired] = useState<boolean>(false); // New state for login
    const [pollingIntervalId, setPollingIntervalId] = useState<NodeJS.Timeout | null>(null);
    // isExpanded and toggleExpansion are removed

    const fetchIdentityDetails = useCallback(async (did: string, isInitialLoad: boolean) => {
        if (!did) {
            if (isInitialLoad) setIsLoadingInitial(false);
            return;
        }
        setIsLoading(true); // For polling indicator, not necessarily initial load
        if (isInitialLoad) setIsLoadingInitial(true);
        setError(null);
        setIsLoginRequired(false);
        try {
            const data = await sendMessageToBackground("FETCH_FULL_IDENTITY_DETAILS", { did });
            if (data && data.identity) {
                // Only update if the core details have changed to prevent unnecessary re-renders
                setIdentityDetails((prevDetails) => {
                    // Basic shallow comparison for key fields. For deep objects, a deep comparison library might be needed.
                    if (
                        prevDetails?.instanceStatus !== data.identity.instanceStatus ||
                        prevDetails?.instanceUrl !== data.identity.instanceUrl ||
                        prevDetails?.profileName !== data.identity.profileName
                    ) {
                        return data.identity;
                    }
                    return prevDetails; // No change
                });
                setIsLoginRequired(false);
                setError(null);
            } else {
                console.warn("FETCH_FULL_IDENTITY_DETAILS response did not contain identity object:", data);
                setError("Received incomplete identity data.");
                setIdentityDetails(null);
            }
        } catch (err: any) {
            console.error("Error fetching identity details in CloudStatus:", err);
            const errorMessage = err.message || "Failed to fetch status.";
            // Check for the specific error code or message from background.ts
            if (err.code === "LOGIN_REQUIRED" || errorMessage.startsWith("FULL_LOGIN_REQUIRED")) {
                setError(errorMessage); // Use the specific message from background
                setIsLoginRequired(true);
            } else {
                setError(errorMessage);
                setIsLoginRequired(false); // Ensure this is reset if it's a different error
            }
            setIdentityDetails(null);
        } finally {
            setIsLoading(false);
            if (isInitialLoad) setIsLoadingInitial(false);
        }
    }, []);

    useEffect(() => {
        if (activeDid) {
            fetchIdentityDetails(activeDid, true); // Initial fetch

            const intervalId = setInterval(() => {
                fetchIdentityDetails(activeDid, false); // Subsequent fetches are not initial load
            }, POLLING_INTERVAL_MS);
            setPollingIntervalId(intervalId);

            return () => {
                if (intervalId) clearInterval(intervalId);
                setPollingIntervalId(null);
            };
        } else {
            // No active DID, clear interval and reset state
            if (pollingIntervalId) clearInterval(pollingIntervalId);
            setIdentityDetails(null);
            setError(null);
            setIsLoading(false);
        }
    }, [activeDid, fetchIdentityDetails]); // fetchIdentityDetails is memoized

    useEffect(() => {
        // Stop polling if instance status is terminal
        console.log("[CloudStatus] Polling stop check. Current status:", identityDetails?.instanceStatus);
        const currentStatus = identityDetails?.instanceStatus?.toLowerCase();
        if (currentStatus && TERMINAL_INSTANCE_STATUSES.includes(currentStatus)) {
            if (pollingIntervalId) {
                clearInterval(pollingIntervalId);
                setPollingIntervalId(null);
                console.log(`[CloudStatus] Polling stopped for DID ${activeDid} due to terminal status: ${identityDetails?.instanceStatus}`);
            }
            // If status is 'completed' or 'running', notify background to attempt sync if needed
            if ((currentStatus === "completed" || currentStatus === "running") && activeDid) {
                console.log(`[CloudStatus] Instance for DID ${activeDid} is ready. Notifying background for sync check.`);
                chrome.runtime
                    .sendMessage({
                        type: "VIBE_INTERNAL_NOTIFICATION",
                        action: "INSTANCE_READY_FOR_SYNC",
                        payload: { did: activeDid },
                    })
                    .catch((err) => console.error("[CloudStatus] Error sending INSTANCE_READY_FOR_SYNC message:", err));
            }
        }
    }, [identityDetails, pollingIntervalId, activeDid]);

    // Log current identityDetails for render
    console.log("[CloudStatus] Rendering with identityDetails:", identityDetails);

    // Determine status, icon, and color based on state
    // This logic is now centralized and also used for the callback
    let determinedDisplayStatus: string = "Fetching status...";
    let DeterminedStatusIcon: React.ElementType = Loader2;
    let determinedIconColor: string = "text-slate-500";
    let determinedStatusDescription: string = "Attempting to retrieve Vibe Cloud instance status...";
    let determinedCompactStatusMessage: string = "Vibe Cloud: Fetching...";
    let determinedIsLoading = isLoadingInitial; // Use isLoadingInitial for the button's loading state

    const handleLoginClick = async () => {
        if (activeDid) {
            console.log(`Login button clicked for DID: ${activeDid}. Requesting login flow.`);
            setIsLoading(true); // Show loading indicator during login attempt
            setError(null);
            try {
                await sendMessageToBackground("REQUEST_LOGIN_FLOW", { did: activeDid });
                console.log("REQUEST_LOGIN_FLOW message sent, attempting to re-fetch details.");
                fetchIdentityDetails(activeDid, false); // This will reset isLoading and handle outcomes. Not an initial load.
            } catch (loginErr: any) {
                console.error("Error during REQUEST_LOGIN_FLOW in CloudStatus:", loginErr);
                if (loginErr.code === "VAULT_LOCKED_FOR_LOGIN") {
                    setError(loginErr.message || "Vault is locked. Please unlock the extension to log in.");
                    // UI should ideally show a full-screen unlock prompt here via a global state/context.
                    // For now, CloudStatus will just show this error.
                } else {
                    setError(loginErr.message || "Login failed. Please try again.");
                }
                setIsLoginRequired(true); // Remain in login required state if login itself fails
                setIsLoading(false);
            }
        }
    };

    if (!activeDid) {
        determinedDisplayStatus = "No Active Identity";
        DeterminedStatusIcon = AlertTriangle;
        determinedIconColor = "text-amber-500";
        determinedStatusDescription = "Please select or create an identity.";
        determinedCompactStatusMessage = "Vibe Cloud: No Identity";
        determinedIsLoading = false; // Not loading if no DID
    } else if (isLoadingInitial && !identityDetails && !isLoginRequired) {
        // Prioritize initial load for button state
        determinedDisplayStatus = "Loading Status...";
        DeterminedStatusIcon = Loader2;
        determinedIconColor = "text-blue-500";
        determinedCompactStatusMessage = "Vibe Cloud: Loading...";
        determinedIsLoading = true;
    } else if (isLoginRequired) {
        determinedDisplayStatus = "Login Required";
        DeterminedStatusIcon = AlertTriangle;
        determinedIconColor = "text-amber-500";
        determinedStatusDescription = error || "Your session may have expired. Please log in.";
        determinedCompactStatusMessage = "Vibe Cloud: Login Required";
        determinedIsLoading = false;
    } else if (error) {
        determinedDisplayStatus = "Error";
        DeterminedStatusIcon = AlertTriangle;
        determinedIconColor = "text-red-500";
        determinedStatusDescription = error;
        determinedCompactStatusMessage = "Vibe Cloud: Error";
        determinedIsLoading = false;
    } else if (identityDetails) {
        const status = identityDetails.instanceStatus?.toLowerCase() || "unknown";
        determinedDisplayStatus = identityDetails.instanceStatus || "Unknown Status";
        determinedIsLoading = false; // If we have details, initial load is done

        switch (status) {
            case "pending":
            case "provisioning":
            case "starting":
                DeterminedStatusIcon = Loader2; // Animated
                determinedIconColor = "text-blue-500";
                determinedStatusDescription = `Instance is ${identityDetails.instanceStatus}. Polling for updates...`;
                determinedCompactStatusMessage = `Vibe Cloud: ${identityDetails.instanceStatus}`;
                determinedIsLoading = true; // Still loading if in these states
                break;
            case "completed":
            case "running":
                DeterminedStatusIcon = Wifi;
                determinedIconColor = "text-green-500";
                determinedStatusDescription = `Instance is active and running.`;
                determinedCompactStatusMessage = "Vibe Cloud: Connected";
                break;
            case "failed":
            case "error":
                DeterminedStatusIcon = AlertTriangle;
                determinedIconColor = "text-red-500";
                determinedStatusDescription = `Instance status: ${identityDetails.instanceStatus}. ${
                    identityDetails.instanceErrorDetails || "Check logs for more info."
                }`;
                determinedCompactStatusMessage = `Vibe Cloud: ${identityDetails.instanceStatus}`;
                break;
            case "deprovisioned":
            case "stopped":
                DeterminedStatusIcon = WifiOff;
                determinedIconColor = "text-slate-500";
                determinedStatusDescription = `Instance is ${identityDetails.instanceStatus}.`;
                determinedCompactStatusMessage = `Vibe Cloud: ${identityDetails.instanceStatus}`;
                break;
            default:
                DeterminedStatusIcon = AlertTriangle;
                determinedIconColor = "text-amber-500";
                determinedStatusDescription = `Instance status is '${identityDetails.instanceStatus}'.`;
                determinedCompactStatusMessage = `Vibe Cloud: ${identityDetails.instanceStatus}`;
        }
    }

    useEffect(() => {
        if (onStatusUpdate) {
            onStatusUpdate({
                Icon: DeterminedStatusIcon,
                color: determinedIconColor,
                rawStatus: determinedCompactStatusMessage, // Using compact message as a summary
                isLoading: determinedIsLoading,
            });
        }
    }, [DeterminedStatusIcon, determinedIconColor, determinedCompactStatusMessage, determinedIsLoading, onStatusUpdate]);

    const truncateUrl = (url: string, maxLength = 30) => {
        if (url.length <= maxLength) return url;
        const startLength = Math.floor((maxLength - 3) / 2);
        const endLength = Math.ceil((maxLength - 3) / 2);
        return `${url.substring(0, startLength)}...${url.substring(url.length - endLength)}`;
    };

    // Component now always renders its "expanded" content, without the toggleable Card wrapper.
    // The header part is simplified to just show status and icon, not for interaction.
    return (
        <div className="mt-1 w-full border rounded-lg p-3">
            {" "}
            {/* Simplified container */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <DeterminedStatusIcon className={cn("h-5 w-5", determinedIconColor, DeterminedStatusIcon === Loader2 && "animate-spin")} />
                    <span className="text-sm font-semibold">{determinedCompactStatusMessage.replace("Vibe Cloud: ", "")}</span>
                </div>
                {/* ChevronDown removed as it's not for toggling here anymore */}
            </div>
            <p className={cn("text-xs text-muted-foreground mb-2 pl-7", determinedIconColor)}>{determinedDisplayStatus}</p> {/* Indent description slightly */}
            <div className="text-sm space-y-2">
                <p className="text-xs text-muted-foreground">{determinedStatusDescription}</p>

                {isLoginRequired && (
                    <Button onClick={handleLoginClick} size="sm" className="mt-2 w-full">
                        Login
                    </Button>
                )}

                {!isLoginRequired && identityDetails && (
                    <>
                        {/* Identity line removed as it's redundant with IdentityCard above CloudStatus */}
                        {identityDetails.instanceUrl &&
                            (identityDetails.instanceStatus?.toLowerCase() === "completed" || identityDetails.instanceStatus?.toLowerCase() === "running") && (
                                <div className="flex items-center gap-2">
                                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground text-xs">Instance URL:</span>
                                    <Button
                                        variant="link"
                                        className="p-0 h-auto text-xs"
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent card click when clicking link
                                            chrome.tabs.create({ url: identityDetails.instanceUrl });
                                        }}
                                        title={identityDetails.instanceUrl} // Show full URL on hover
                                    >
                                        {truncateUrl(identityDetails.instanceUrl)}
                                        <ExternalLink className="ml-1 h-3 w-3" />
                                    </Button>
                                </div>
                            )}
                        {/* Placeholder for storage or other resources */}
                    </>
                )}
                {isLoading && pollingIntervalId && !isLoginRequired && (
                    <p className="text-xs text-blue-500 flex items-center">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Checking for updates...
                    </p>
                )}
            </div>
        </div>
    );
};
