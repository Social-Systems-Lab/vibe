import React from "react";
// IdentityCard is no longer directly used.
import { CloudStatus } from "./cloud/CloudStatus";
import { Button } from "@/components/ui/button";
import { Settings, UserPlus, User } from "lucide-react"; // Wifi and Heart removed
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
            <div
                style={{ background: "linear-gradient(to bottom right, #a18ce8, #ae8deb)" }}
                className="h-16 flex items-center px-4 relative" // Reduced height slightly for better avatar overlap
            ></div>

            {/* Profile and Connection Status Section */}
            {/* -mt-8 for h-16 header and h-20 avatar (20 * 0.75 = 15, so 16 - 15 = 1, effectively -mt- (avatar_height - overlap)) */}
            {/* Avatar h-20 (80px), overlap 25% means 5px of avatar above header bottom line. Header h-16 (64px). Avatar top: 64 - 5 = 59px. Margin-top needed: 59 - 64 = -5px. Let's use -mt-5 (Tailwind) or specific pixel value.
                Avatar h-20 (80px). Header h-16 (64px). Avatar should overlap by 25% of its height (20px). So avatar starts 20px above header bottom.
                Effective top margin for avatar container: - (AvatarHeight * 0.25)
            */}
            <div className="px-4 pb-4">
                {currentIdentity ? (
                    // Added relative positioning to the container of Avatar and Text Info for z-indexing if needed.
                    <div className="flex items-start -mt-5 ml-2 relative">
                        {" "}
                        {/* -mt-6 to pull avatar up by 24px (25% of 96px avatar) */}
                        <Avatar className="h-20 w-20 border-4 border-white rounded-full shadow-md mr-4">
                            {" "}
                            {/* Reduced avatar size slightly */}
                            <AvatarImage src={currentIdentity.avatarUrl || undefined} alt={currentIdentity.displayName || "User Avatar"} />
                            <AvatarFallback className="text-xl">{getInitials(currentIdentity.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-grow pt-6 relative">
                            {" "}
                            {/* pt-5 to align text below the header line */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-800">{currentIdentity.displayName || "Unnamed Identity"}</h2>
                                    <DidDisplay did={currentIdentity.did} className="text-xs text-gray-500" />
                                </div>
                                <div>
                                    <CloudStatus activeDid={currentIdentity.did} displayMode="iconOnly" />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="w-full p-4 rounded-lg border-2 border-dashed border-muted-foreground/50 flex flex-col items-center justify-center h-32 text-center mt-4">
                        {" "}
                        {/* Reduced height and margin for no identity state */}
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
