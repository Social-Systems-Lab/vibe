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
        // Potentially show a loading state or a prompt to create/select an identity
        return (
            <Card className="w-full">
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">No identity selected.</p>
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
        <Card className="w-full shadow-lg">
            <CardHeader className="flex flex-row items-center gap-4 p-4">
                <Avatar className="h-12 w-12">
                    <AvatarImage src={identity.avatarUrl} alt={identity.displayName || "User Avatar"} />
                    <AvatarFallback>{getInitials(identity.displayName)}</AvatarFallback>
                </Avatar>
                <div className="grid gap-1">
                    <CardTitle className="text-lg font-semibold">{identity.displayName || "Unnamed Identity"}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate" title={identity.did}>
                        {identity.did}
                    </p>
                </div>
            </CardHeader>
        </Card>
    );
};
