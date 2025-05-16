import React, { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, HardDrive, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
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

interface CloudStatusProps {
    activeDid: string | null; // The DID of the currently active identity
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

export const CloudStatus: React.FC<CloudStatusProps> = ({ activeDid }) => {
    const [identityDetails, setIdentityDetails] = useState<Identity | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [pollingIntervalId, setPollingIntervalId] = useState<NodeJS.Timeout | null>(null);

    const fetchIdentityDetails = useCallback(async (did: string) => {
        if (!did) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await sendMessageToBackground("FETCH_FULL_IDENTITY_DETAILS", { did });
            if (data && data.identity) {
                setIdentityDetails(data.identity);
            } else {
                // This case might occur if the background script resolves without 'identity' in payload
                // or if the response structure is unexpected.
                console.warn("FETCH_FULL_IDENTITY_DETAILS response did not contain identity object:", data);
                setError("Received incomplete identity data from background.");
                setIdentityDetails(null); // Clear previous details if any
            }
        } catch (err: any) {
            console.error("Error fetching identity details:", err);
            setError(err.message || "Failed to fetch status.");
            setIdentityDetails(null); // Clear previous details on error
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeDid) {
            fetchIdentityDetails(activeDid); // Initial fetch

            const intervalId = setInterval(() => {
                fetchIdentityDetails(activeDid);
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
        if (identityDetails?.instanceStatus && TERMINAL_INSTANCE_STATUSES.includes(identityDetails.instanceStatus.toLowerCase())) {
            if (pollingIntervalId) {
                clearInterval(pollingIntervalId);
                setPollingIntervalId(null);
                console.log(`Polling stopped for DID ${activeDid} due to terminal status: ${identityDetails.instanceStatus}`);
            }
        }
    }, [identityDetails, pollingIntervalId, activeDid]);

    let displayStatus: string = "Fetching status...";
    let StatusIcon = Loader2;
    let iconColor = "text-slate-500";
    let statusDescription = "Attempting to retrieve Vibe Cloud instance status...";

    if (!activeDid) {
        displayStatus = "No Active Identity";
        StatusIcon = AlertTriangle;
        iconColor = "text-amber-500";
        statusDescription = "Please select or create an identity.";
    } else if (isLoading && !identityDetails) {
        // Show loading only on initial load or if no details yet
        displayStatus = "Loading Status...";
        StatusIcon = Loader2; // Loader2 will be animated by className
        iconColor = "text-blue-500";
    } else if (error) {
        displayStatus = "Error";
        StatusIcon = AlertTriangle;
        iconColor = "text-red-500";
        statusDescription = error;
    } else if (identityDetails) {
        const status = identityDetails.instanceStatus?.toLowerCase() || "unknown";
        displayStatus = identityDetails.instanceStatus || "Unknown Status";

        switch (status) {
            case "pending":
            case "provisioning":
            case "starting":
                StatusIcon = Loader2; // Animated
                iconColor = "text-blue-500";
                statusDescription = `Instance is ${identityDetails.instanceStatus}. Polling for updates...`;
                break;
            case "completed":
            case "running": // Assuming 'running' is a possible completed state
                StatusIcon = Wifi;
                iconColor = "text-green-500";
                statusDescription = `Instance is active and running.`;
                break;
            case "failed":
            case "error": // Instance specific error
                StatusIcon = AlertTriangle;
                iconColor = "text-red-500";
                statusDescription = `Instance status: ${identityDetails.instanceStatus}. ${
                    identityDetails.instanceErrorDetails || "Check logs for more info."
                }`;
                break;
            case "deprovisioned":
            case "stopped":
                StatusIcon = WifiOff;
                iconColor = "text-slate-500";
                statusDescription = `Instance is ${identityDetails.instanceStatus}.`;
                break;
            default:
                StatusIcon = AlertTriangle; // For unknown or unexpected statuses
                iconColor = "text-amber-500";
                statusDescription = `Instance status is '${identityDetails.instanceStatus}'.`;
        }
    }

    return (
        <Card className="mt-4 w-full">
            <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium">Vibe Cloud Instance</CardTitle>
                    <StatusIcon className={cn("h-5 w-5", iconColor, StatusIcon === Loader2 && "animate-spin")} />
                </div>
                <CardDescription className={cn("text-xs", iconColor)}>{displayStatus}</CardDescription>
            </CardHeader>
            <CardContent className="pt-2 pb-4 text-sm space-y-2">
                <p className="text-xs text-muted-foreground">{statusDescription}</p>

                {identityDetails && (
                    <>
                        {identityDetails.profileName && (
                            <p className="text-xs">
                                <strong>Identity:</strong> {identityDetails.profileName} ({identityDetails.identityDid.substring(0, 12)}...)
                            </p>
                        )}
                        {identityDetails.instanceUrl &&
                            (identityDetails.instanceStatus?.toLowerCase() === "completed" || identityDetails.instanceStatus?.toLowerCase() === "running") && (
                                <div className="flex items-center gap-2">
                                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Instance URL:</span>
                                    <Button
                                        variant="link"
                                        className="p-0 h-auto text-xs"
                                        onClick={() => chrome.tabs.create({ url: identityDetails.instanceUrl })}
                                    >
                                        {identityDetails.instanceUrl}
                                        <ExternalLink className="ml-1 h-3 w-3" />
                                    </Button>
                                </div>
                            )}
                        {/* Placeholder for storage or other resources if they become available via this endpoint */}
                        {/* <div className="flex items-center gap-2 text-muted-foreground">
                            <Database className="h-4 w-4" />
                            <span>Storage: N/A</span>
                        </div> */}
                    </>
                )}
                {isLoading &&
                    pollingIntervalId && ( // Show subtle loading indicator during polling updates
                        <p className="text-xs text-blue-500 flex items-center">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Checking for updates...
                        </p>
                    )}
            </CardContent>
        </Card>
    );
};
