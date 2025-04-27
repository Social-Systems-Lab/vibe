import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlusCircle, Settings, LogOut, UserCircle } from "lucide-react"; // Added UserCircle
import { VibeLogo } from "../ui/VibeLogo"; // Import the logo

// TODO: Import useVibeAgent hook (to be created) or pass agent methods as props
// import { useVibeAgent } from "@/hooks/useVibeAgent"; // Example hook name
import type { Identity } from "@/vibe/types"; // Adjust path as needed

interface IdentityPanelProps {
    // Props to receive identities, active identity, and agent interaction methods
    identities: Identity[];
    activeIdentity: Identity | null;
    onCreateIdentity: () => void; // Function to trigger identity creation UI
    onSwitchIdentity: (did: string) => void; // Function to switch identity
    onManagePermissions: () => void; // Function to navigate to permission manager
}

export function IdentityPanel({
    identities = [], // Default to empty array
    activeIdentity = null,
    onCreateIdentity,
    onSwitchIdentity,
    onManagePermissions,
}: IdentityPanelProps) {
    const getInitials = (label: string) => {
        return label
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase();
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                        {activeIdentity?.pictureUrl ? <AvatarImage src={activeIdentity.pictureUrl} alt={activeIdentity.label} /> : null}
                        <AvatarFallback>
                            {activeIdentity ? (
                                getInitials(activeIdentity.label)
                            ) : (
                                // Show a generic icon when no identity is active/exists
                                <UserCircle className="h-5 w-5 text-muted-foreground" />
                            )}
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                {identities.length === 0 ? (
                    <>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">Vibe Setup</p>
                                <p className="text-xs leading-none text-muted-foreground">No identity found</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onCreateIdentity}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            <span>Setup Vibe</span>
                        </DropdownMenuItem>
                        {/* Optionally disable/hide permissions when no identity */}
                        <DropdownMenuItem onClick={onManagePermissions} disabled>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Manage Permissions</span>
                        </DropdownMenuItem>
                    </>
                ) : (
                    <>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{activeIdentity?.label ?? "No Identity"}</p>
                                <p className="text-xs leading-none text-muted-foreground truncate">{activeIdentity?.did ?? "Select or create an identity"}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {identities.map((identity) => (
                            <DropdownMenuItem key={identity.did} onClick={() => onSwitchIdentity(identity.did)} disabled={identity.did === activeIdentity?.did}>
                                <Avatar className="mr-2 h-5 w-5">
                                    <AvatarImage src={identity.pictureUrl} alt={identity.label} />
                                    <AvatarFallback>{getInitials(identity.label)}</AvatarFallback>
                                </Avatar>
                                <span>{identity.label}</span>
                                {/* Add checkmark or indicator for active identity? */}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onCreateIdentity}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            <span>Create New Identity</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onManagePermissions}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Manage Permissions</span>
                        </DropdownMenuItem>
                    </>
                )}
                {/* Optional: Logout/Lock functionality */}
                {/* <DropdownMenuItem>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
                {/* Optional: Logout/Lock functionality */}
                {/* <DropdownMenuItem>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem> */}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
