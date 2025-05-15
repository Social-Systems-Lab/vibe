import React from "react";
import { Wifi, WifiOff, HardDrive, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

interface CloudResources {
    storageUsed?: string; // e.g., "5.2 GB"
    storageTotal?: string; // e.g., "15 GB"
    // Add other resources as needed
}

interface CloudStatusProps {
    status: ConnectionStatus;
    resources?: CloudResources;
    errorMessage?: string;
}

const statusIcons: Record<ConnectionStatus, React.ElementType> = {
    connected: Wifi,
    disconnected: WifiOff,
    connecting: Wifi, // Could use a spinner icon here later
    error: AlertTriangle,
};

const statusColors: Record<ConnectionStatus, string> = {
    connected: "text-green-500",
    disconnected: "text-slate-500",
    connecting: "text-blue-500",
    error: "text-red-500",
};

const statusText: Record<ConnectionStatus, string> = {
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Connecting...",
    error: "Connection Error",
};

export const CloudStatus: React.FC<CloudStatusProps> = ({ status, resources, errorMessage }) => {
    const IconComponent = statusIcons[status];

    return (
        <Card className="mt-4 w-full">
            <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium">Vibe Cloud Status</CardTitle>
                    <IconComponent className={cn("h-5 w-5", statusColors[status])} />
                </div>
                <CardDescription className={cn("text-xs", statusColors[status])}>{statusText[status]}</CardDescription>
            </CardHeader>
            <CardContent className="pt-2 pb-4 text-sm">
                {status === "error" && errorMessage && <p className="text-red-600 text-xs mt-1">{errorMessage}</p>}
                {status === "connected" && resources && (
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                        <HardDrive className="h-4 w-4" />
                        <span>
                            Storage: {resources.storageUsed || "N/A"} / {resources.storageTotal || "N/A"}
                        </span>
                    </div>
                )}
                {(status === "disconnected" || status === "connecting") && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {status === "disconnected" ? "Not connected to Vibe Cloud." : "Attempting to connect..."}
                    </p>
                )}
            </CardContent>
        </Card>
    );
};
