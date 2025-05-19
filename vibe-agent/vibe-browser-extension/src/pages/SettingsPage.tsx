import React, { useState, useEffect, type ChangeEvent } from "react";
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { useVaultUnlock } from "@/contexts/VaultUnlockContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, ArrowLeft } from "lucide-react"; // Added ArrowLeft
import { currentIdentityAtom, type Identity } from "../store/identityAtoms";
import { isLoadingIdentityAtom } from "../store/appAtoms";

// Define ChromeMessage type, consider moving to a shared types file
interface ChromeMessage {
    type: string;
    payload?: any;
    error?: { message?: string; [key: string]: any };
    [key: string]: any;
}

export const SettingsPage: React.FC = () => {
    const [currentIdentity, setCurrentIdentity] = useAtom(currentIdentityAtom);
    // isLoadingIdentityAtom can be used to disable form while identity is initially loading elsewhere
    const [isLoadingGlobal, setIsLoadingGlobal] = useAtom(isLoadingIdentityAtom);

    const [editableProfileName, setEditableProfileName] = useState<string>("");
    const [picturePreview, setPicturePreview] = useState<string | null>(null);
    const [originalPictureUrl, setOriginalPictureUrl] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false); // Local saving state
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
        } else {
            // If no current identity, redirect or show an appropriate message.
            // This might happen if user navigates here directly when not logged in.
            // For now, fields will be empty/disabled by checks below.
            // Consider redirecting:
            // setLocation("/dashboard");
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
                        // Update Jotai atom to reflect the change immediately
                        const updatedIdentity: Partial<Identity> = {};
                        if (nameChanged) updatedIdentity.displayName = editableProfileName;
                        if (pictureChanged) updatedIdentity.avatarUrl = picturePreview;

                        setCurrentIdentity((prev) => (prev ? { ...prev, ...updatedIdentity } : null));
                        if (pictureChanged) setOriginalPictureUrl(picturePreview); // Update original for next comparison
                        setTimeout(() => setSuccessMessage(null), 3000);
                    } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                        throw new Error(response.error?.message || "Failed to update profile.");
                    } else {
                        throw new Error("Invalid response when updating profile.");
                    }
                } catch (e: any) {
                    setError(e.message || "An unexpected error occurred.");
                    setTimeout(() => setError(null), 5000);
                    throw e; // Re-throw for requestUnlockAndPerformAction to handle
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
            setIsSaving(false); // Ensure saving state is reset
        });
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
        </div>
    );
};

export default SettingsPage;
