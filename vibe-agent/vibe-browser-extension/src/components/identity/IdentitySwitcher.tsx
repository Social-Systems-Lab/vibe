import React from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, UserPlus, Users, LogIn } from "lucide-react";

interface Identity {
    did: string;
    displayName?: string;
    // Add other relevant fields if needed for display in switcher
}

interface IdentitySwitcherProps {
    identities: Identity[];
    currentIdentity: Identity | null;
    onSwitchIdentity: (did: string) => void;
    onAddIdentity: () => void;
    onImportIdentity: () => void; // New prop for import
}

export const IdentitySwitcher: React.FC<IdentitySwitcherProps> = ({ identities, currentIdentity, onSwitchIdentity, onAddIdentity, onImportIdentity }) => {
    if (!currentIdentity && identities.length === 0) {
        return (
            <div className="mt-4 flex flex-col gap-2">
                <Button onClick={onAddIdentity} className="w-full">
                    <UserPlus className="mr-2 h-4 w-4" /> Add New Identity
                </Button>
                <Button onClick={onImportIdentity} variant="outline" className="w-full">
                    <LogIn className="mr-2 h-4 w-4" /> Import Identity
                </Button>
            </div>
        );
    }

    return (
        <div className="mt-4 flex flex-col gap-2">
            {identities.length > 1 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                            <span>Switch Identity</span>
                            <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                        <DropdownMenuLabel>Available Identities</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {identities.map((id) => (
                            <DropdownMenuItem key={id.did} onClick={() => onSwitchIdentity(id.did)} disabled={currentIdentity?.did === id.did}>
                                <Users className="mr-2 h-4 w-4" />
                                <span>{id.displayName || id.did.substring(0, 12) + "..."}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            <Button onClick={onAddIdentity} variant="secondary" className="w-full">
                <UserPlus className="mr-2 h-4 w-4" /> Add New Identity
            </Button>
            <Button onClick={onImportIdentity} variant="outline" className="w-full">
                <LogIn className="mr-2 h-4 w-4" /> Import Identity
            </Button>
        </div>
    );
};
