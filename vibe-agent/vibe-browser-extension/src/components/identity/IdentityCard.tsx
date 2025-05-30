import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DidDisplay } from "@/components/ui/DidDisplay"; // Import the new DidDisplay component

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
    // Styling adjusted to match the second screenshot: Avatar left, text right, bottom border
    return (
        <div className="w-full flex items-center p-3">
            <Avatar className="h-16 w-16 mr-3">
                {" "}
                {/* Slightly smaller avatar */}
                <AvatarImage src={identity.avatarUrl} alt={identity.displayName || "User Avatar"} />
                <AvatarFallback>{getInitials(identity.displayName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
                <h2 className="text-base font-medium text-foreground leading-tight">{identity.displayName || "Unnamed Identity"}</h2>
                <DidDisplay did={identity.did} className="text-muted-foreground" />
            </div>
        </div>
    );
};
