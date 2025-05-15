import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// Card components are no longer used directly here for the main identity display
// import { Card, CardContent } from "@/components/ui/card";

interface Identity {
    did: string;
    displayName?: string;
    avatarUrl?: string;
}

interface IdentityCardProps {
    identity: Identity | null;
}

export const IdentityCard: React.FC<IdentityCardProps> = ({ identity }) => {
    if (!identity) {
        // Styling for "No active identity" state
        return (
            <div className="w-full p-4 rounded-lg border-2 border-dashed border-muted-foreground/50 flex flex-col items-center justify-center h-32 text-center">
                <p className="text-muted-foreground text-sm font-medium">No active identity.</p>
                <p className="text-muted-foreground text-xs">Create or select one using the options below.</p>
            </div>
        );
    }

    const getInitials = (name?: string) => {
        if (!name) return "ID";
        const names = name.split(" ");
        if (names.length > 1) {
            return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    // Main display for an active identity
    return (
        <div className="w-full p-4 rounded-lg bg-muted/50 flex flex-col items-center text-center">
            <Avatar className="h-16 w-16 mb-3">
                <AvatarImage src={identity.avatarUrl} alt={identity.displayName || "User Avatar"} />
                <AvatarFallback className="text-xl">{getInitials(identity.displayName)}</AvatarFallback>
            </Avatar>
            <h2 className="text-lg font-semibold text-foreground">{identity.displayName || "Unnamed Identity"}</h2>
            <p className="text-xs text-muted-foreground break-all max-w-full px-2" title={identity.did}>
                {identity.did}
            </p>
        </div>
    );
};
