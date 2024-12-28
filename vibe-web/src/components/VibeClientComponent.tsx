"use client";

import { useEffect, useState } from "react";
import { vibe, VibeState, AppManifest } from "vibe-sdk";

const VibeClientComponent = () => {
    const [vibeState, setVibeState] = useState<VibeState | null>(null);

    useEffect(() => {
        const manifest: AppManifest = {
            id: "com.example.vibe-web",
            name: "Vibe Web App",
            description: "A demo web app using the Vibe SDK",
            permissions: ["Read Name", "Read Ratings"],
        };

        // Initialize vibe SDK when the component mounts
        const unsubscribe = vibe.init(manifest, (state) => {
            console.log("Vibe state updated:", state);
            setVibeState(state); // Update state on changes
        });

        return () => {
            // Cleanup when the component unmounts
            unsubscribe();
        };
    }, []);

    const handleWriteData = async () => {
        try {
            const result = await vibe.writeData({ key: "exampleKey", value: "exampleValue" });
            console.log("Data written successfully:", result);
        } catch (error) {
            console.error("Error writing data:", error);
        }
    };

    if (!vibe.enabled()) {
        return <div>Vibe is not enabled in this environment.</div>;
    }

    return (
        <div>
            <h1>Vibe Client Component</h1>
            <p>Account: {vibeState?.account?.name || "Not logged in"}</p>
            <p>Permissions: {JSON.stringify(vibeState?.permissions, null, 2)}</p>
            <button onClick={handleWriteData}>Write Data</button>
        </div>
    );
};

export default VibeClientComponent;
