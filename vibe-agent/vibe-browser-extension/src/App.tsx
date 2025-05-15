import React, { useState } from "react";
import "./index.css";
import { IdentityCard } from "./components/identity/IdentityCard";
import { IdentitySwitcher } from "./components/identity/IdentitySwitcher";
import { CloudStatus } from "./components/cloud/CloudStatus";
import { Button } from "@/components/ui/button"; // For a potential settings button
import { Settings } from "lucide-react";

// Mock data types - ensure these match the component prop types
interface Identity {
    did: string;
    displayName?: string;
    avatarUrl?: string;
}

type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

interface CloudResources {
    storageUsed?: string;
    storageTotal?: string;
}

// Mock data
const mockIdentities: Identity[] = [
    { did: "did:example:123456789abcdefghi", displayName: "Alice Wonderland", avatarUrl: "https://i.pravatar.cc/150?u=alice" },
    { did: "did:example:abcdefghi123456789", displayName: "Bob The Builder" },
    { did: "did:example:qwertyuiopasdfghjkl", avatarUrl: "https://i.pravatar.cc/150?u=charlie" },
];

export function App() {
    const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(mockIdentities[0] || null);
    const [identities, setIdentities] = useState<Identity[]>(mockIdentities);
    const [cloudStatus, setCloudStatus] = useState<ConnectionStatus>("connected");
    const [cloudResources, setCloudResources] = useState<CloudResources>({ storageUsed: "2.3 GB", storageTotal: "10 GB" });
    const [cloudErrorMessage, setCloudErrorMessage] = useState<string | undefined>(undefined);

    const handleSwitchIdentity = (did: string) => {
        const newIdentity = identities.find((id) => id.did === did);
        setCurrentIdentity(newIdentity || null);
        // In a real app, you'd persist this change
        console.log("Switched to identity:", did);
    };

    const handleAddIdentity = () => {
        // Placeholder for add identity flow
        const newId = `did:example:new${Math.random().toString(36).substring(2, 15)}`;
        const newIdentity: Identity = {
            did: newId,
            displayName: `New User ${identities.length + 1}`,
        };
        setIdentities([...identities, newIdentity]);
        setCurrentIdentity(newIdentity);
        console.log("Add new identity clicked. New identity:", newIdentity);
        // This would typically trigger a setup flow
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

    return (
        <div className="w-[350px] p-4 bg-background text-foreground flex flex-col gap-3">
            <header className="flex justify-between items-center mb-1">
                <h1 className="text-lg font-semibold">Vibe Identity</h1>
                <Button variant="ghost" size="icon" onClick={() => console.log("Settings clicked")}>
                    <Settings className="h-5 w-5" />
                </Button>
            </header>

            <IdentityCard identity={currentIdentity} />

            <IdentitySwitcher
                identities={identities}
                currentIdentity={currentIdentity}
                onSwitchIdentity={handleSwitchIdentity}
                onAddIdentity={handleAddIdentity}
            />

            <CloudStatus status={cloudStatus} resources={cloudResources} errorMessage={cloudErrorMessage} />

            {/* Temporary button to test cloud status cycling */}
            <Button onClick={cycleCloudStatus} variant="outline" size="sm" className="mt-auto">
                Cycle Cloud Status (Test)
            </Button>
        </div>
    );
}

export default App;
