import React from "react";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu"; // Keep for visual separation
import { Button } from "@/components/ui/button";
import { UserPlus, Users, Settings as SettingsIcon } from "lucide-react"; // ChevronDown removed, LogIn removed, SettingsIcon added

// Interface for identities as expected by this UI component
interface DisplayIdentity {
    did: string;
    displayName?: string; // Mapped from profile_name by the parent
    profilePictureUrl?: string; // Optional: for future avatar display
}

interface IdentitySwitcherProps {
    identities: DisplayIdentity[];
    currentIdentityDid: string | null; // Use DID string for current identity
    onSwitchIdentity: (did: string) => void;
    onAddIdentity: () => void;
    onImportIdentity: () => void;
    onOpenSettings: () => void; // Added prop for opening settings
}

export const IdentitySwitcher: React.FC<IdentitySwitcherProps> = ({
    identities,
    currentIdentityDid,
    onSwitchIdentity,
    onAddIdentity,
    onImportIdentity,
    onOpenSettings,
}) => {
    const hasMultipleIdentities = identities.length > 1;

    // Scenario: No identities exist at all (e.g., fresh setup before creating/importing first one)
    // The "Add" and "Import" buttons below will cover this.
    // If currentIdentityDid is null AND identities array is empty, it implies a state
    // where the user needs to create or import their very first identity.

    return (
        <div className="p-2 flex flex-col gap-3">
            {" "}
            {/* Adjusted padding and gap */}
            {hasMultipleIdentities && (
                <div className="flex flex-col gap-1">
                    <h3 className="text-xs font-medium text-muted-foreground px-2 py-1.5">Identities</h3>
                    <div className="flex flex-col gap-1">
                        {identities.map((identity) => (
                            <Button
                                key={identity.did}
                                variant={currentIdentityDid === identity.did ? "secondary" : "ghost"}
                                className="w-full justify-start h-9 text-sm px-2" // Adjusted height and padding
                                onClick={() => onSwitchIdentity(identity.did)}
                                disabled={currentIdentityDid === identity.did}
                            >
                                <Users className="mr-2 h-4 w-4 flex-shrink-0" />
                                <span className="truncate">{identity.displayName || identity.did.substring(0, 20) + "..."}</span>
                            </Button>
                        ))}
                    </div>
                </div>
            )}
            {/* Separator if multiple identities were shown and there are action buttons below */}
            {hasMultipleIdentities && <DropdownMenuSeparator className="my-1" />}
            <div className="flex flex-col gap-2">
                {/* "Add Identity" section - styled to match Chrome's "Add" button */}
                <Button
                    onClick={onAddIdentity}
                    variant="ghost" // Typically "Add" buttons in such UIs are less prominent until hovered/focused
                    className="w-full justify-start h-9 text-sm px-2"
                >
                    <UserPlus className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>Add identity</span>
                </Button>

                {/* Import Identity button is commented out, keeping it as is based on current file content */}
                {/* <Button onClick={onImportIdentity} variant="ghost" className="w-full justify-start h-9 text-sm px-2">
                    <LogIn className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>Import existing seed</span>
                </Button> */}

                <Button onClick={onOpenSettings} variant="ghost" className="w-full justify-start h-9 text-sm px-2">
                    <SettingsIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>Settings</span>
                </Button>
            </div>
        </div>
    );
};
