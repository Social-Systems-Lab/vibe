import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        return (
            <Card className="w-full border-dashed">
                <CardContent className="pt-6 flex flex-col items-center justify-center h-24">
                    <p className="text-center text-muted-foreground text-sm">No active identity.</p>
                    <p className="text-center text-muted-foreground text-xs">Create or select one.</p>
                </CardContent>
            </Card>
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

    return (
        <Card className="w-full shadow-md bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="pt-6 flex flex-col items-center text-center">
                <Avatar className="h-16 w-16 mb-3">
                    <AvatarImage src={identity.avatarUrl} alt={identity.displayName || "User Avatar"} />
                    <AvatarFallback className="text-xl">{getInitials(identity.displayName)}</AvatarFallback>
                </Avatar>
                <h2 className="text-lg font-semibold text-card-foreground">{identity.displayName || "Unnamed Identity"}</h2>
                <p className="text-xs text-muted-foreground break-all" title={identity.did}>
                    {identity.did}
                </p>
            </CardContent>
        </Card>
    );
};
