import React from "react";
import { Button } from "@/components/ui/button"; // Assuming this path is correct for your UI components

export interface VibeUserProfileData {
    username: string;
    site: string;
    mockBio: string;
    mockAvatar: string; // URL to an avatar image
}

interface VibeUserProfileViewProps {
    profileData: VibeUserProfileData | null;
    onClose: () => void;
}

export const VibeUserProfileView: React.FC<VibeUserProfileViewProps> = ({ profileData, onClose }) => {
    if (!profileData) {
        return (
            <div className="p-4 text-center">
                <p>No profile data to display.</p>
                <Button onClick={onClose} variant="outline" className="mt-4">
                    Close
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col p-4 bg-background text-foreground">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Vibe User Profile (Mock)</h2>
                <Button onClick={onClose} variant="ghost" size="sm">
                    &times; Close
                </Button>
            </div>
            <div className="flex-grow overflow-auto">
                <div className="flex flex-col items-center">
                    <img src={profileData.mockAvatar} alt={`${profileData.username}'s avatar`} className="w-24 h-24 rounded-full mb-4 border border-border" />
                    <h3 className="text-lg font-medium">{profileData.username}</h3>
                    <p className="text-sm text-muted-foreground">on {profileData.site}</p>
                    <p className="mt-3 text-center text-sm">{profileData.mockBio}</p>
                </div>
                <div className="mt-6 p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground text-center">
                        This is a mocked profile view.
                        <br />
                        Future interactions (messaging, donations, etc.) will appear here.
                    </p>
                </div>
            </div>
            <div className="mt-4">
                <Button onClick={onClose} variant="outline" className="w-full">
                    Back to Main View
                </Button>
            </div>
        </div>
    );
};
