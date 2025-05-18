import React from "react";
import { IdentityCard } from "./identity/IdentityCard";
import { IdentitySwitcher } from "./identity/IdentitySwitcher";
import { CloudStatus } from "./cloud/CloudStatus";
import { Button } from "@/components/ui/button";
import { Settings, RotateCcw } from "lucide-react";

// UI-facing Identity type (mirrored from App.tsx)
// Consider moving to a shared types file if used more broadly
interface Identity {
    did: string;
    displayName: string | null;
    avatarUrl?: string | null;
}

interface ExtensionWindowViewProps {
    currentIdentity: Identity | null;
    allIdentities: Identity[];
    onSwitchIdentity: (did: string) => Promise<void>;
    onAddIdentity: () => void;
    onImportIdentity: () => Promise<void>;
    onOpenSettings: () => void;
    // onResetDev is removed as it's handled in App.tsx now
}

export function ExtensionWindowView({
    currentIdentity,
    allIdentities,
    onSwitchIdentity,
    onAddIdentity,
    onImportIdentity,
    onOpenSettings,
}: ExtensionWindowViewProps) {
    return (
        <div className="w-[380px] bg-background text-foreground flex flex-col overflow-hidden">
            <div className="flex flex-col">
                <IdentityCard identity={currentIdentity} />
                <div className="pr-3 pl-3 pb-3">
                    <CloudStatus activeDid={currentIdentity?.did || null} />
                </div>
                <IdentitySwitcher
                    identities={allIdentities}
                    currentIdentityDid={currentIdentity?.did || null}
                    onSwitchIdentity={onSwitchIdentity}
                    onAddIdentity={onAddIdentity}
                    onImportIdentity={onImportIdentity}
                    onOpenSettings={onOpenSettings} // Pass onOpenSettings to IdentitySwitcher
                />
            </div>
            {/* The bottom div with buttons is removed as "Identity Settings" is moved to IdentitySwitcher
                and "Reset Vibe" is moved to App.tsx's settings view */}
        </div>
    );
}
