import React from "react";
import { IdentityCard } from "./identity/IdentityCard";
import { CloudStatus } from "./cloud/CloudStatus";
import { Button } from "@/components/ui/button";
import { Settings, UserPlus, User, Wifi, Heart } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DidDisplay } from "@/components/ui/DidDisplay";

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
    // onImportIdentity is not in the new design's visible actions,
    // but keeping it in props if needed elsewhere or for future.
    onImportIdentity: () => Promise<void>;
    onOpenSettings: () => void;
}

export function ExtensionWindowView({
    currentIdentity,
    allIdentities,
    onSwitchIdentity,
    onAddIdentity,
    onImportIdentity, // Kept in props, though not directly used in this new UI
    onOpenSettings,
}: ExtensionWindowViewProps) {
    const getInitials = (name?: string | null) => {
        if (!name) return "ID";
        const names = name.split(" ");
        if (names.length > 1) {
            return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const otherDisplayIdentities = allIdentities.filter((id) => id.did !== currentIdentity?.did);

    return (
        <div className="w-[380px] bg-white text-foreground flex flex-col overflow-hidden">
            {/* Header Section */}
            <div className="bg-purple-400 h-20 flex items-center px-4 relative"></div>

            {/* Profile and Connection Status Section */}
            <div className="flex flex-col items-center px-4 pb-4 -mt-10">
                {currentIdentity ? (
                    <>
                        <Avatar className="h-24 w-24 border-4 border-white rounded-full shadow-md">
                            <AvatarImage src={currentIdentity.avatarUrl || undefined} alt={currentIdentity.displayName || "User Avatar"} />
                            <AvatarFallback className="text-2xl">{getInitials(currentIdentity.displayName)}</AvatarFallback>
                        </Avatar>
                        <h2 className="text-2xl font-bold mt-3 text-gray-800">{currentIdentity.displayName || "Unnamed Identity"}</h2>
                        <DidDisplay did={currentIdentity.did} className="text-sm text-gray-500 mt-1" />
                        <div className="mt-4 w-full">
                            <CloudStatus activeDid={currentIdentity?.did || null} />
                        </div>
                    </>
                ) : (
                    <div className="w-full p-4 rounded-lg border-2 border-dashed border-muted-foreground/50 flex flex-col items-center justify-center h-40 text-center mt-10">
                        <p className="text-muted-foreground text-sm font-medium">No active identity.</p>
                        <p className="text-muted-foreground text-xs">Create or select one using the options below.</p>
                    </div>
                )}
            </div>

            {/* Separator */}
            {currentIdentity && <hr className="mx-4 border-gray-200" />}

            {/* Other Identities & Actions Section */}
            <div className="flex flex-col gap-1 p-4">
                <h3 className="text-xs font-medium text-gray-500 mb-2">Other Identities</h3>
                {otherDisplayIdentities.map((identity) => (
                    <Button
                        key={identity.did}
                        variant="ghost"
                        className="w-full justify-start h-10 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => onSwitchIdentity(identity.did)}
                    >
                        <User className="mr-3 h-5 w-5 text-gray-500" />
                        <span className="truncate">{identity.displayName || identity.did.substring(0, 20) + "..."}</span>
                    </Button>
                ))}
                <Button onClick={onAddIdentity} variant="ghost" className="w-full justify-start h-10 text-sm text-gray-700 hover:bg-gray-100 mt-1">
                    <UserPlus className="mr-3 h-5 w-5 text-gray-500" />
                    <span>Add identity</span>
                </Button>
                <Button onClick={onOpenSettings} variant="ghost" className="w-full justify-start h-10 text-sm text-gray-700 hover:bg-gray-100">
                    <Settings className="mr-3 h-5 w-5 text-gray-500" />
                    <span>Settings</span>
                </Button>
            </div>
        </div>
    );
}
