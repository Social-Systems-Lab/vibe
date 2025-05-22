import React, { useCallback } from "react";
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Squircle } from "@/components/ui/Squircle"; // Changed Avatar to Squircle
import { DidDisplay } from "@/components/ui/DidDisplay"; // Assuming this component exists and is styled
import { UserPlus, ArrowLeft, Loader2 } from "lucide-react";
import { allIdentitiesAtom, currentIdentityAtom, type Identity, newIdentityWizardPropsAtom } from "../store/identityAtoms";
import { isLoadingIdentityAtom } from "../store/appAtoms";

// Define ChromeMessage type, consider moving to a shared types file
interface ChromeMessage {
    type: string;
    payload?: any;
    error?: { message?: string; [key: string]: any };
    [key: string]: any;
}

export function SelectIdentityPage() {
    const [allIdentities] = useAtom(allIdentitiesAtom);
    const [, setCurrentIdentity] = useAtom(currentIdentityAtom); // To update active identity
    const [isLoading, setIsLoading] = useAtom(isLoadingIdentityAtom);
    const [, setLocation] = useLocation();
    const [, setNewIdentityProps] = useAtom(newIdentityWizardPropsAtom);

    const handleSelectIdentity = useCallback(
        async (identity: Identity) => {
            setIsLoading(true);
            try {
                const response = (await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "SWITCH_ACTIVE_IDENTITY",
                    payload: { did: identity.did },
                    requestId: crypto.randomUUID().toString(),
                })) as ChromeMessage;

                if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                    setCurrentIdentity(identity); // Optimistically update UI
                    setLocation("/"); // Navigate back to Dashboard
                } else {
                    console.error("Error switching identity:", response?.error);
                    alert(`Error switching identity: ${response?.error?.message || "Unknown error"}`);
                }
            } catch (error: any) {
                console.error("Failed to send SWITCH_ACTIVE_IDENTITY message:", error);
                alert(`Failed to switch identity: ${error.message}`);
            } finally {
                setIsLoading(false);
            }
        },
        [setCurrentIdentity, setLocation, setIsLoading]
    );

    const handleAddIdentity = useCallback(async () => {
        setIsLoading(true);
        try {
            const nextIndexResponse = (await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_NEXT_IDENTITY_INDEX",
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage;

            if (nextIndexResponse?.type !== "VIBE_AGENT_RESPONSE" || typeof nextIndexResponse.payload?.identityIndex !== "number") {
                console.error("Failed to get next account index:", nextIndexResponse?.error);
                alert(`Error preparing for new identity: ${nextIndexResponse?.error?.message || "Could not get account index."}`);
                setIsLoading(false);
                return;
            }
            const identityIndex = nextIndexResponse.payload.identityIndex;

            const lockStateResponse = (await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_LOCK_STATE",
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage;

            if (lockStateResponse?.type !== "VIBE_AGENT_RESPONSE" || typeof lockStateResponse.payload?.isUnlocked !== "boolean") {
                console.error("Failed to get lock state:", lockStateResponse?.error);
                alert(`Error preparing for new identity: ${lockStateResponse?.error?.message || "Could not get lock state."}`);
                setIsLoading(false);
                return;
            }
            const isVaultInitiallyUnlocked = lockStateResponse.payload.isUnlocked;

            setNewIdentityProps({
                identityIndex,
                isVaultInitiallyUnlocked,
            });
            setLocation("/setup/new-identity"); // Navigate to new identity creation flow
        } catch (error: any) {
            console.error("Error in handleAddIdentity:", error);
            alert(`An unexpected error occurred: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [setLocation, setNewIdentityProps, setIsLoading]);

    const getInitials = (name?: string | null) => {
        if (!name) return "ID";
        const names = name.split(" ");
        return names.length > 1 ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase() : name.substring(0, 2).toUpperCase();
    };

    return (
        <div className="bg-background text-foreground flex flex-col h-full p-4">
            <div className="flex items-center mb-6">
                <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-xl font-semibold">Switch Identity</h1>
            </div>

            {isLoading && (
                <div className="flex-grow flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}

            {!isLoading && (
                <div className="flex-grow overflow-y-auto">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {allIdentities.map((identity) => (
                            <button
                                key={identity.did}
                                onClick={() => handleSelectIdentity(identity)}
                                className="flex flex-col items-center p-3 rounded-lg hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                            >
                                <Squircle
                                    imageUrl={identity.avatarUrl}
                                    size={window.innerWidth > 640 ? 80 : 64} // sm:w-20 (80px), w-16 (64px)
                                    className="mb-2"
                                >
                                    <span className="text-lg font-semibold">{getInitials(identity.displayName)}</span>
                                </Squircle>
                                <span className="text-sm font-medium text-center truncate w-full">{identity.displayName || "Unnamed"}</span>
                                <DidDisplay did={identity.did} className="text-xs text-muted-foreground text-center truncate w-full justify-center" />
                            </button>
                        ))}
                        <button
                            onClick={handleAddIdentity}
                            className="flex h-[132px] flex-col items-center justify-center p-3 rounded-lg border-2 border-dashed border-muted-foreground/50 hover:border-primary hover:text-primary text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                        >
                            <UserPlus className="h-8 w-8 sm:h-10 sm:w-10 mb-2" /> {/* Corrected sm:h-10 */}
                            <span className="text-sm font-medium text-center">Add Identity</span>
                        </button>
                    </div>
                    {allIdentities.length === 0 && (
                        <div className="text-center text-muted-foreground mt-8">No other identities found. Click "Add Identity" to create a new one.</div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SelectIdentityPage;
