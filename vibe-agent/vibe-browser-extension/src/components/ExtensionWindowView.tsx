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
    onResetDev?: () => Promise<void>; // Matches AppProps
}

export function ExtensionWindowView({
    currentIdentity,
    allIdentities,
    onSwitchIdentity,
    onAddIdentity,
    onImportIdentity,
    onOpenSettings,
    onResetDev,
}: ExtensionWindowViewProps) {
    return (
        <div className="w-[380px] bg-background text-foreground flex flex-col overflow-hidden">
            <div className="p-4 flex flex-col gap-4">
                <IdentityCard identity={currentIdentity} />
                <IdentitySwitcher
                    identities={allIdentities}
                    currentIdentityDid={currentIdentity?.did || null}
                    onSwitchIdentity={onSwitchIdentity}
                    onAddIdentity={onAddIdentity}
                    onImportIdentity={onImportIdentity}
                />
                <CloudStatus activeDid={currentIdentity?.did || null} />
            </div>
            <div className="mt-auto flex flex-col gap-2 p-4 border-t border-border bg-muted/30">
                <Button onClick={onOpenSettings} variant="secondary" size="sm">
                    <Settings className="mr-2 h-4 w-4" /> Identity Settings
                </Button>
                {onResetDev && ( // Conditionally render the reset button if the prop is provided
                    <Button onClick={onResetDev} variant="destructive" size="sm">
                        <RotateCcw className="mr-2 h-4 w-4" /> Reset Vibe
                    </Button>
                )}
            </div>
        </div>
    );
}
