import React, { useState, useEffect } from "react";

interface IdentityDetails {
    did: string;
    profileName: string | null;
    profilePictureUrl?: string | null;
}

const IdentitySettings: React.FC = () => {
    const [identityDetails, setIdentityDetails] = useState<IdentityDetails | null>(null);
    const [editableProfileName, setEditableProfileName] = useState<string>("");
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
            } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                setError(response.error?.message || "Failed to load identity details.");
                console.error("Error getting identity details:", response.error);
            } else {
                setError("Invalid response when getting identity details.");
                console.error("Invalid response getting identity details:", response);
            }
        });
    }, []);

    const handleSaveProfile = async () => {
        if (!identityDetails?.did) {
            setError("No active DID found to update.");
            return;
        }
        if (editableProfileName === (identityDetails.profileName || "")) {
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
                    profileName: editableProfileName,
                    // profilePictureUrl: null, // Not handling picture URL in this basic version
                },
            },
            (response) => {
                setIsLoading(false);
                if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                    setSuccessMessage(response.payload.message || "Profile updated successfully!");
                    // Update local state to reflect the change immediately
                    setIdentityDetails((prev) => (prev ? { ...prev, profileName: editableProfileName } : null));
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
        <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
            <h2>Identity Settings</h2>
            <p>
                <strong>DID:</strong> {identityDetails.did}
            </p>
            <div>
                <label htmlFor="profileName" style={{ display: "block", marginBottom: "5px" }}>
                    Profile Name:
                </label>
                <input
                    type="text"
                    id="profileName"
                    value={editableProfileName}
                    onChange={(e) => setEditableProfileName(e.target.value)}
                    placeholder="Enter your profile name"
                    style={{ width: "300px", padding: "8px", marginBottom: "10px", border: "1px solid #ccc", borderRadius: "4px" }}
                />
            </div>
            {/* Placeholder for profile picture if needed later */}
            {/* <div>
                <label htmlFor="profilePictureUrl">Profile Picture URL:</label>
                <input type="text" id="profilePictureUrl" value={identityDetails.profilePictureUrl || ''} readOnly />
            </div> */}
            <button
                onClick={handleSaveProfile}
                disabled={isLoading}
                style={{
                    padding: "10px 15px",
                    backgroundColor: isLoading ? "#ccc" : "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: isLoading ? "not-allowed" : "pointer",
                }}
            >
                {isLoading ? "Saving..." : "Save Profile Name"}
            </button>
            {error && <p style={{ color: "red", marginTop: "10px" }}>Error: {error}</p>}
            {successMessage && <p style={{ color: "green", marginTop: "10px" }}>{successMessage}</p>}
        </div>
    );
};

export default IdentitySettings;
