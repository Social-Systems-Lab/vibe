import React, { useState, useEffect } from "react"; // Added useEffect
import "./index.css";
import { IdentityCard } from "./components/identity/IdentityCard";
import { IdentitySwitcher } from "./components/identity/IdentitySwitcher";
import { CloudStatus } from "./components/cloud/CloudStatus";
import { Button } from "@/components/ui/button"; // For a potential settings button
import { Settings, RotateCcw } from "lucide-react"; // Added RotateCcw for reset icon

// Prop types for App component
interface AppProps {
    onResetDev: () => Promise<void>; // Or () => void if preferred
}

// Matches the structure in background.ts (profile_name, profile_picture)
interface StoredIdentity {
    did: string;
    profile_name: string | null;
    profile_picture?: string | null;
    derivationPath?: string; // Optional, from vault
}

// UI-facing Identity type
interface Identity {
    did: string;
    displayName: string | null;
    avatarUrl?: string | null;
}

type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

interface CloudResources {
    storageUsed?: string;
    storageTotal?: string;
}

export function App({ onResetDev }: AppProps) {
    const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(null); // Initialize with null
    const [identities, setIdentities] = useState<Identity[]>([]); // Initialize with empty array
    const [isLoadingIdentity, setIsLoadingIdentity] = useState(true); // Loading state for identity
    const [cloudStatus, setCloudStatus] = useState<ConnectionStatus>("connected");
    const [cloudResources, setCloudResources] = useState<CloudResources>({ storageUsed: "2.3 GB", storageTotal: "10 GB" });
    const [cloudErrorMessage, setCloudErrorMessage] = useState<string | undefined>(undefined);

    useEffect(() => {
        const loadIdentityData = async () => {
            setIsLoadingIdentity(true);
            try {
                // Fetch from "vibeVault" and "currentIdentityDID"
                const result = await chrome.storage.local.get(["vibeVault", "currentIdentityDID"]);
                const vault = result.vibeVault;
                const storedCurrentDID: string | undefined = result.currentIdentityDID;

                let uiIdentities: Identity[] = [];
                if (vault && vault.identities && Array.isArray(vault.identities)) {
                    uiIdentities = vault.identities.map((id: StoredIdentity) => ({
                        did: id.did,
                        displayName: id.profile_name,
                        avatarUrl: id.profile_picture,
                    }));
                }
                setIdentities(uiIdentities);

                if (storedCurrentDID) {
                    const foundCurrent = uiIdentities.find((id) => id.did === storedCurrentDID);
                    setCurrentIdentity(foundCurrent || (uiIdentities.length > 0 ? uiIdentities[0] : null));
                } else if (uiIdentities.length > 0) {
                    // If no current DID is set (e.g., first time after setup), default to the first one
                    setCurrentIdentity(uiIdentities[0]);
                    // Persist this choice
                    await chrome.storage.local.set({ currentIdentityDID: uiIdentities[0].did });
                } else {
                    setCurrentIdentity(null); // No identities found
                }
                console.log("Loaded vault identities, mapped to UI:", uiIdentities);
                console.log("Current DID from storage:", storedCurrentDID);
            } catch (error) {
                console.error("Error loading identity data from storage:", error);
                // Optionally set an error state to display to the user
            } finally {
                setIsLoadingIdentity(false);
            }
        };

        loadIdentityData();
    }, []);

    const handleSwitchIdentity = (did: string) => {
        const newIdentity = identities.find((id) => id.did === did);
        if (newIdentity) {
            setCurrentIdentity(newIdentity);
            chrome.storage.local.set({ currentIdentityDID: newIdentity.did });
            console.log("Switched to identity:", newIdentity.did);
        }
    };

    const handleAddIdentity = async () => {
        // This placeholder needs to be updated to interact with background.ts
        // to properly create and store a new identity within the vault structure.
        console.log("Add new identity action triggered. Needs full implementation via background script.");
        alert("Add new identity functionality is not fully implemented yet. It requires interaction with the background script to update the vault.");

        // // --- TEMPORARY MOCK ADDITION (REMOVE/REPLACE WITH BACKGROUND SCRIPT INTERACTION) ---
        // const newId = `did:example:temp${Date.now().toString().slice(-6)}`;
        // const tempNewUiIdentity: Identity = { // UI type
        //     did: newId,
        //     displayName: `Temp User ${identities.length + 1}`,
        //     avatarUrl: undefined,
        // };
        // const tempNewStoredIdentity: StoredIdentity = { // Stored type
        //     did: newId,
        //     profile_name: tempNewUiIdentity.displayName,
        //     profile_picture: undefined,
        //     derivationPath: `m/0'/0'/${identities.length}'` // Example path
        // };

        // const updatedUiIdentities = [...identities, tempNewUiIdentity];
        // setIdentities(updatedUiIdentities);
        // setCurrentIdentity(tempNewUiIdentity);

        // try {
        //     const vaultResult = await chrome.storage.local.get("vibeVault");
        //     const vault = vaultResult.vibeVault || { identities: [], settings: {} };
        //     const updatedStoredIdentities = [...(vault.identities || []), tempNewStoredIdentity];

        //     await chrome.storage.local.set({
        //         vibeVault: { ...vault, identities: updatedStoredIdentities },
        //         currentIdentityDID: tempNewUiIdentity.did,
        //     });
        //     console.log("Temporarily added and saved new identity (MOCK):", tempNewUiIdentity);
        // } catch (error) {
        //     console.error("Error saving temporary new identity (MOCK):", error);
        // }
        // // --- END TEMPORARY MOCK ADDITION ---
    };

    // Example functions to simulate cloud status changes (for testing)
    const cycleCloudStatus = () => {
        const statuses: ConnectionStatus[] = ["connected", "connecting", "disconnected", "error"];
        const currentIndex = statuses.indexOf(cloudStatus);
        const nextIndex = (currentIndex + 1) % statuses.length;
        setCloudStatus(statuses[nextIndex]);
        if (statuses[nextIndex] === "error") {
            setCloudErrorMessage("Failed to sync with the Vibe Cloud. Please check your connection.");
        } else {
            setCloudErrorMessage(undefined);
        }
        if (statuses[nextIndex] === "connected") {
            setCloudResources({ storageUsed: `${(Math.random() * 10).toFixed(1)} GB`, storageTotal: "10 GB" });
        }
    };

    if (isLoadingIdentity) {
        return (
            <div className="w-[350px] p-4 bg-background text-foreground flex flex-col items-center justify-center h-48">
                <p>Loading identity...</p> {/* Add a spinner later */}
            </div>
        );
    }

    // Main render logic
    return (
        <div className="w-[380px] bg-background text-foreground flex flex-col shadow-2xl rounded-lg overflow-hidden">
            {" "}
            {/* Solid background */}
            {/* Header removed */}
            <div className="p-4 flex flex-col gap-4">
                {" "}
                {/* Content area with padding and gap */}
                <IdentityCard identity={currentIdentity} />
                <IdentitySwitcher
                    identities={identities}
                    currentIdentity={currentIdentity}
                    onSwitchIdentity={handleSwitchIdentity}
                    onAddIdentity={handleAddIdentity}
                />
                <CloudStatus status={cloudStatus} resources={cloudResources} errorMessage={cloudErrorMessage} />
            </div>
            <div className="mt-auto flex flex-col gap-2 p-4 border-t border-border bg-muted/30">
                {/* Temporary button to test cloud status cycling */}
                <Button onClick={cycleCloudStatus} variant="outline" size="sm">
                    Cycle Cloud Status (Test)
                </Button>
                <Button onClick={onResetDev} variant="destructive" size="sm">
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset (Dev Only)
                </Button>
            </div>
        </div>
    );
}

export default App;
