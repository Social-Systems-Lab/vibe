import React, { useState, useEffect, type ChangeEvent } from "react";
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { useVaultUnlock } from "@/contexts/VaultUnlockContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, ArrowLeft, Trash2 } from "lucide-react";
import { currentIdentityAtom, allIdentitiesAtom, type Identity } from "../store/identityAtoms";
import { isLoadingIdentityAtom, appStatusAtom } from "../store/appAtoms";

interface ChromeMessage {
    type: string;
    payload?: any;
    error?: { message?: string; [key: string]: any };
    [key: string]: any;
}

export const SettingsPage: React.FC = () => {
    const [currentIdentity, setCurrentIdentity] = useAtom(currentIdentityAtom);
    const [allIdentities, setAllIdentities] = useAtom(allIdentitiesAtom);
    const [, setAppStatus] = useAtom(appStatusAtom);
    const [isLoadingGlobal] = useAtom(isLoadingIdentityAtom); // Removed setIsLoadingGlobal setter as it's not used

    const [editableProfileName, setEditableProfileName] = useState<string>("");
    const [picturePreview, setPicturePreview] = useState<string | null>(null);
    const [originalPictureUrl, setOriginalPictureUrl] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const { requestUnlockAndPerformAction } = useVaultUnlock();
    const [, setLocation] = useLocation();

    useEffect(() => {
        if (currentIdentity) {
            setEditableProfileName(currentIdentity.displayName || "");
            const currentPic = currentIdentity.avatarUrl || null;
            setPicturePreview(currentPic);
            setOriginalPictureUrl(currentPic);
        }
    }, [currentIdentity]);

    const handlePictureChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPicturePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveProfile = async () => {
        if (!currentIdentity?.did) {
            setError("No active identity found to update.");
            return;
        }

        const nameChanged = editableProfileName !== (currentIdentity.displayName || "");
        const pictureChanged = picturePreview !== originalPictureUrl;

        if (!nameChanged && !pictureChanged) {
            setSuccessMessage("No changes to save.");
            setTimeout(() => setSuccessMessage(null), 3000);
            return;
        }

        setError(null);
        setSuccessMessage(null);

        requestUnlockAndPerformAction(
            async () => {
                setIsSaving(true);
                try {
                    const response = (await chrome.runtime.sendMessage({
                        type: "VIBE_AGENT_REQUEST",
                        action: "UPDATE_IDENTITY_PROFILE",
                        payload: {
                            did: currentIdentity.did,
                            profileName: nameChanged ? editableProfileName : undefined,
                            profilePictureUrl: pictureChanged ? picturePreview : undefined,
                        },
                    })) as ChromeMessage;

                    if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                        setSuccessMessage(response.payload.message || "Profile updated successfully!");
                        const updatedIdentity: Partial<Identity> = {};
                        if (nameChanged) updatedIdentity.displayName = editableProfileName;
                        if (pictureChanged) updatedIdentity.avatarUrl = picturePreview;

                        setCurrentIdentity((prev) => (prev ? { ...prev, ...updatedIdentity } : null));
                        if (pictureChanged) setOriginalPictureUrl(picturePreview);
                        setTimeout(() => setSuccessMessage(null), 3000);
                    } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                        throw new Error(response.error?.message || "Failed to update profile.");
                    } else {
                        throw new Error("Invalid response when updating profile.");
                    }
                } catch (e: any) {
                    setError(e.message || "An unexpected error occurred.");
                    setTimeout(() => setError(null), 5000);
                    throw e;
                } finally {
                    setIsSaving(false);
                }
            },
            {
                title: "Confirm Profile Changes",
                description: "Enter your vault password to save your profile changes.",
            }
        ).catch((unlockError) => {
            if (unlockError.message !== "Operation cancelled by user.") {
                setError("Failed to unlock vault: " + unlockError.message);
                setTimeout(() => setError(null), 5000);
            } else {
                setSuccessMessage("Profile update cancelled.");
                setTimeout(() => setSuccessMessage(null), 3000);
            }
            setIsSaving(false);
        });
    };

    const handleDeleteIdentityClicked = async () => {
        if (!currentIdentity?.did) {
            setError("No active identity to delete.");
            return;
        }

        if (
            !window.confirm(
                `Are you sure you want to permanently delete the identity "${
                    currentIdentity.displayName || currentIdentity.did
                }"? This action cannot be undone.`
            )
        ) {
            return;
        }

        setError(null);
        setSuccessMessage(null);

        try {
            await requestUnlockAndPerformAction(
                async () => {
                    setIsSaving(true);
                    try {
                        const response = (await chrome.runtime.sendMessage({
                            type: "VIBE_AGENT_REQUEST",
                            action: "DELETE_IDENTITY",
                            payload: { did: currentIdentity.did },
                        })) as ChromeMessage;

                        if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                            setSuccessMessage(response.payload.message || "Identity deletion process initiated.");
                            const remainingIdentities = allIdentities.filter((id) => id.did !== currentIdentity.did);
                            setAllIdentities(remainingIdentities);

                            if (remainingIdentities.length > 0) {
                                const switchToDid = remainingIdentities[0].did;
                                const switchResponse = (await chrome.runtime.sendMessage({
                                    type: "VIBE_AGENT_REQUEST",
                                    action: "SWITCH_ACTIVE_IDENTITY",
                                    payload: { did: switchToDid },
                                })) as ChromeMessage;
                                if (switchResponse?.type === "VIBE_AGENT_RESPONSE" && switchResponse.payload?.success) {
                                    setCurrentIdentity(remainingIdentities[0]);
                                } else {
                                    setCurrentIdentity(null);
                                    setAppStatus("VAULT_LOCKED_NO_LAST_ACTIVE");
                                }
                            } else {
                                setCurrentIdentity(null);
                                setAppStatus("SETUP_NOT_COMPLETE");
                            }
                            setTimeout(() => {
                                setLocation(remainingIdentities.length > 0 ? "/" : "/setup");
                            }, 2000);
                        } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                            throw new Error(response.error?.message || "Failed to delete identity.");
                        } else {
                            throw new Error("Invalid response when deleting identity.");
                        }
                    } catch (e: any) {
                        setError(e.message || "An unexpected error occurred during deletion.");
                        setTimeout(() => setError(null), 5000);
                        throw e;
                    } finally {
                        setIsSaving(false);
                    }
                },
                {
                    title: "Confirm Identity Deletion",
                    description: "Enter your vault password to confirm deletion of this identity. This is irreversible.",
                }
            );
        } catch (unlockError: any) {
            if (unlockError.message !== "Operation cancelled by user.") {
                setError("Failed to unlock vault for deletion: " + unlockError.message);
                setTimeout(() => setError(null), 5000);
            } else {
                setSuccessMessage("Identity deletion cancelled.");
                setTimeout(() => setSuccessMessage(null), 3000);
            }
            setIsSaving(false);
        }
    };

    if (isLoadingGlobal && !currentIdentity) {
        return <div className="p-6 text-center">Loading identity settings...</div>;
    }

    if (!currentIdentity) {
        return (
            <div className="p-6 text-center">
                <p>No active identity found. Please select or create an identity first.</p>
                <Button onClick={() => setLocation("/dashboard")} className="mt-4">
                    Go to Dashboard
                </Button>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 bg-background text-foreground h-full flex flex-col">
            <div className="flex items-center mb-4">
                <Button onClick={() => setLocation("/dashboard")} variant="ghost" size="icon" className="mr-2">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h2 className="text-xl font-semibold">Identity Settings</h2>
            </div>

            <div className="flex-grow overflow-y-auto space-y-6 pr-2">
                <div className="space-y-2">
                    <Label>DID:</Label>
                    <p className="text-sm text-muted-foreground break-all">{currentIdentity.did}</p>
                </div>

                <div className="space-y-2">
                    <Label>Profile Picture</Label>
                    <div className="flex flex-col items-center space-y-2">
                        <Avatar className="h-24 w-24 mb-2">
                            <AvatarImage src={picturePreview ?? undefined} alt={editableProfileName || "Identity Avatar"} />
                            <AvatarFallback>
                                <User className="h-12 w-12" />
                            </AvatarFallback>
                        </Avatar>
                        <Input
                            id="picture-upload-settings"
                            type="file"
                            accept="image/*"
                            onChange={handlePictureChange}
                            className="hidden"
                            disabled={isSaving}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById("picture-upload-settings")?.click()}
                            disabled={isSaving}
                        >
                            {picturePreview ? "Change Picture" : "Upload Picture"}
                        </Button>
                        {picturePreview && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setPicturePreview(null)} disabled={isSaving}>
                                Remove Picture
                            </Button>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="profileName">Profile Name:</Label>
                    <Input
                        type="text"
                        id="profileName"
                        value={editableProfileName}
                        onChange={(e) => setEditableProfileName(e.target.value)}
                        placeholder="Enter your profile name"
                        className="w-full bg-input border-border placeholder:text-muted-foreground/70"
                        disabled={isSaving}
                    />
                </div>
            </div>

            <div className="pt-4 border-t border-border">
                <Button
                    onClick={handleSaveProfile}
                    disabled={
                        isSaving || isLoadingGlobal || !(editableProfileName !== (currentIdentity.displayName || "") || picturePreview !== originalPictureUrl)
                    }
                    className="w-full"
                >
                    {isSaving ? "Saving..." : "Save Changes"}
                </Button>
                {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
                {successMessage && <p className="text-green-500 text-sm text-center mt-2">{successMessage}</p>}
            </div>

            {/* Delete Identity Section */}
            <div className="pt-6 mt-6 border-t border-destructive/50">
                <h3 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h3>
                <p className="text-sm text-muted-foreground mb-3">
                    Deleting your identity is a permanent action and cannot be undone. This will remove your local vault access to this identity and attempt to
                    deprovision any associated cloud services.
                </p>
                <Button
                    variant="destructive"
                    onClick={handleDeleteIdentityClicked}
                    disabled={isSaving || isLoadingGlobal || !currentIdentity}
                    className="w-full"
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete This Identity
                </Button>
            </div>
        </div>
    );
};

export default SettingsPage;
