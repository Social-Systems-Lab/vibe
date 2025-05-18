import React, { useState, useEffect, type ChangeEvent } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Added
import { Button } from "@/components/ui/button"; // Added
import { Input } from "@/components/ui/input"; // Added
import { Label } from "@/components/ui/label"; // Added
import { User } from "lucide-react"; // Added

interface IdentityDetails {
    did: string;
    profileName: string | null;
    profilePictureUrl?: string | null;
    isVaultLocked?: boolean; // Added to reflect vault state
}

const IdentitySettings: React.FC = () => {
    const [identityDetails, setIdentityDetails] = useState<IdentityDetails | null>(null);
    const [isVaultLockedForEdit, setIsVaultLockedForEdit] = useState<boolean>(true); // Added
    const [editableProfileName, setEditableProfileName] = useState<string>("");
    const [picturePreview, setPicturePreview] = useState<string | null>(null); // Added for new picture
    const [originalPictureUrl, setOriginalPictureUrl] = useState<string | null>(null); // Added to track initial picture
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        setIsLoading(true);
        chrome.runtime.sendMessage({ type: "VIBE_AGENT_REQUEST", action: "GET_ACTIVE_IDENTITY_DETAILS", payload: {} }, (response) => {
            setIsLoading(false);
            if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload) {
                setIdentityDetails(response.payload);
                setEditableProfileName(response.payload.profileName || "");
                setPicturePreview(response.payload.profilePictureUrl || null); // Initialize preview with current picture
                setOriginalPictureUrl(response.payload.profilePictureUrl || null); // Store original picture
                setIsVaultLockedForEdit(response.payload.isVaultLocked === true); // Set vault lock state for UI
            } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                setError(response.error?.message || "Failed to load identity details.");
                console.error("Error getting identity details:", response.error);
            } else {
                setError("Invalid response when getting identity details.");
                console.error("Invalid response getting identity details:", response);
            }
        });
    }, []);

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
        if (!identityDetails?.did) {
            setError("No active DID found to update.");
            return;
        }

        const nameChanged = editableProfileName !== (identityDetails.profileName || "");
        const pictureChanged = picturePreview !== originalPictureUrl;

        if (!nameChanged && !pictureChanged) {
            setSuccessMessage("No changes to save.");
            setTimeout(() => setSuccessMessage(null), 3000);
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        chrome.runtime.sendMessage(
            {
                type: "VIBE_AGENT_REQUEST",
                action: "UPDATE_IDENTITY_PROFILE",
                payload: {
                    did: identityDetails.did,
                    profileName: nameChanged ? editableProfileName : undefined, // Send only if changed
                    profilePictureUrl: pictureChanged ? picturePreview : undefined, // Send only if changed
                },
            },
            (response) => {
                setIsLoading(false);
                if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                    setSuccessMessage(response.payload.message || "Profile updated successfully!");
                    // Update local state to reflect the change immediately
                    setIdentityDetails((prev) => {
                        if (!prev) return null;
                        const newDetails = { ...prev };
                        if (nameChanged) newDetails.profileName = editableProfileName;
                        if (pictureChanged) newDetails.profilePictureUrl = picturePreview;
                        return newDetails;
                    });
                    if (pictureChanged) setOriginalPictureUrl(picturePreview); // Update original picture if it changed
                    setTimeout(() => setSuccessMessage(null), 3000);
                } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                    setError(response.error?.message || "Failed to update profile.");
                    console.error("Error updating profile:", response.error);
                } else {
                    setError("Invalid response when updating profile.");
                    console.error("Invalid response updating profile:", response);
                }
            }
        );
    };

    if (isLoading && !identityDetails) {
        return <div>Loading identity settings...</div>;
    }

    if (error && !identityDetails) {
        return <div style={{ color: "red" }}>Error: {error}</div>;
    }

    if (!identityDetails) {
        return <div>No identity loaded or vault is locked.</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <h2 className="text-xl font-semibold">Identity Settings</h2>
            <div className="space-y-2">
                <Label>DID:</Label>
                <p className="text-sm text-muted-foreground break-all">{identityDetails.did}</p>
            </div>

            {/* Profile Picture Section */}
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
                        disabled={isVaultLockedForEdit || isLoading}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("picture-upload-settings")?.click()}
                        disabled={isVaultLockedForEdit || isLoading}
                    >
                        {picturePreview ? "Change Picture" : "Upload Picture"}
                    </Button>
                    {picturePreview && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPicturePreview(null)} disabled={isVaultLockedForEdit || isLoading}>
                            Remove Picture
                        </Button>
                    )}
                </div>
            </div>

            {/* Profile Name Section */}
            <div className="space-y-2">
                <Label htmlFor="profileName">Profile Name:</Label>
                <Input
                    type="text"
                    id="profileName"
                    value={editableProfileName}
                    onChange={(e) => setEditableProfileName(e.target.value)}
                    placeholder="Enter your profile name"
                    className="w-full"
                    disabled={isVaultLockedForEdit || isLoading}
                />
            </div>

            {isVaultLockedForEdit && <p className="text-orange-500 text-sm text-center mt-2">Vault is locked. Unlock to make changes.</p>}

            <Button onClick={handleSaveProfile} disabled={isLoading || isVaultLockedForEdit} className="w-full">
                {isLoading ? "Saving..." : "Save Changes"}
            </Button>

            {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
            {successMessage && <p className="text-green-500 text-sm text-center mt-2">{successMessage}</p>}
        </div>
    );
};

export default IdentitySettings;
