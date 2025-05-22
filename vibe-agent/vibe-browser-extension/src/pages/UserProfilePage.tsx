import React, { useEffect } from "react";
import { useAtom } from "jotai";
import { useLocation, useParams } from "wouter"; // Added useParams
import { Button } from "@/components/ui/button";
import {
    currentVibeProfileDataAtom,
    showVibeUserProfileAtom,
    type VibeUserProfileData, // Re-using the interface from identityAtoms
} from "../store/identityAtoms";
import { ArrowLeft } from "lucide-react";

// Note: The VibeUserProfileData interface is already in identityAtoms.ts
// If it needs to be different for this page, define it here.
// For now, assuming it's the same.

export const UserProfilePage: React.FC = () => {
    const [profileData, setCurrentVibeProfileData] = useAtom(currentVibeProfileDataAtom);
    const [, setShowVibeUserProfile] = useAtom(showVibeUserProfileAtom);
    const [, setLocation] = useLocation();
    const params = useParams(); // To potentially use params.did in the future

    // This page might be navigated to directly via /profile/:did
    // or by the background script setting currentVibeProfileDataAtom and showVibeUserProfileAtom.
    // If navigated directly, profileData might be null initially.
    // We might need a mechanism to fetch profile data based on params.did if profileData is null.
    // For now, it relies on the atom being set externally.

    useEffect(() => {
        // If this page is active, ensure the atom controlling its general visibility is true
        // This is more for if it were a modal controlled by a separate atom.
        // For a routed page, this might not be strictly necessary unless other parts of the UI
        // also key off `showVibeUserProfileAtom`.
        setShowVibeUserProfile(true);
        return () => {
            // Optionally, set showVibeUserProfileAtom to false when unmounting,
            // if this page should only be visible when explicitly navigated to
            // and its state cleared on leaving.
            // setShowVibeUserProfile(false); // This might be too aggressive if user navigates away and back
        };
    }, [setShowVibeUserProfile]);

    const handleClose = () => {
        setShowVibeUserProfile(false); // Hide the profile if this atom controls overlay visibility
        setCurrentVibeProfileData(null); // Clear the data
        setLocation("/"); // Navigate back to dashboard or previous page
    };

    if (!profileData) {
        return (
            <div className="p-6 text-center h-full flex flex-col justify-center items-center bg-background text-foreground">
                <p className="text-muted-foreground">No profile data to display or profile not found.</p>
                <p className="text-xs text-muted-foreground mt-1">DID from route: {params.did || "N/A"}</p>
                <Button onClick={handleClose} variant="outline" className="mt-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </div>
        );
    }

    // Assuming VibeUserProfileData now includes did, username, site, mockBio, mockAvatar
    // Adjusting to match the fields from the original sidepanel.tsx's VibeUserProfileData
    // The interface in identityAtoms.ts might need to be updated if it doesn't match.
    // For now, let's assume profileData has: did, displayName, avatarUrl, and potentially site, mockBio.
    // The original VibeUserProfileView used: username, site, mockBio, mockAvatar.
    // Let's adapt to use displayName as username, and avatarUrl as mockAvatar. Site/mockBio are new.

    const displayUsername = profileData.displayName || "Unknown User";
    const displayAvatar = profileData.avatarUrl || "/placeholder-avatar.png"; // Fallback avatar
    const displaySite = (profileData as any).site || "Unknown Site"; // Cast if site is not in VibeUserProfileData
    const displayBio = (profileData as any).mockBio || "No bio available."; // Cast if mockBio is not in VibeUserProfileData

    return (
        <div className="w-full h-full flex flex-col p-4 bg-background text-foreground">
            <div className="flex items-center mb-4">
                <Button onClick={handleClose} variant="ghost" size="icon" className="mr-2">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h2 className="text-xl font-semibold">Vibe User Profile</h2>
            </div>
            <div className="flex-grow overflow-auto">
                <div className="flex flex-col items-center">
                    <img src={displayAvatar} alt={`${displayUsername}'s avatar`} className="w-24 h-24 rounded-full mb-4 border border-border" />
                    <h3 className="text-lg font-medium">{displayUsername}</h3>
                    <p className="text-sm text-muted-foreground">on {displaySite}</p>
                    <p className="mt-3 text-center text-sm">{displayBio}</p>
                    <p className="text-xs text-muted-foreground mt-1">DID: {profileData.did}</p>
                </div>
                <div className="mt-6 p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground text-center">
                        This is a profile view.
                        <br />
                        Future interactions (messaging, donations, etc.) will appear here.
                    </p>
                </div>
            </div>
            {/* Footer close button might be redundant if there's one in the header */}
            {/* <div className="mt-4 pt-4 border-t border-border">
                <Button onClick={handleClose} variant="outline" className="w-full">
                    Back to Main View
                </Button>
            </div> */}
        </div>
    );
};

export default UserProfilePage;
