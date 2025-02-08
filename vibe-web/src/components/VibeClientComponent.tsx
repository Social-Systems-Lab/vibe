"use client";

import { useEffect, useState } from "react";
import { vibe, VibeState, AppManifest } from "vibe-sdk";

const VibeClientComponent = () => {
    const [vibeState, setVibeState] = useState<VibeState | null>(null);

    useEffect(() => {
        const manifest: AppManifest = {
            id: "dev.vibeapp.vibe-web",
            name: "Vibe Website",
            description: "Official Vibe Website",
            permissions: ["Read Name", "Read Ratings"],
            onetapEnabled: false,
            pictureUrl: "https://vibeapp.dev/favicon-96x96.png",
        };

        const unsubscribe = vibe.init(manifest, (state) => {
            console.log("Vibe state updated:", state);
            setVibeState(state);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    const handleWriteData = async () => {
        try {
            const result = await vibe.writeData({ key: "exampleKey", value: "exampleValue" });
            console.log("Data written successfully:", result);
        } catch (error) {
            console.error("Error writing data:", error);
        }
    };

    return vibe?.inVibeApp ? (
        <div className="hidden">
            <h1>Vibe Client Component</h1>
            <p>In vibe app: {vibe.inVibeApp.toString()}</p>
            <p>Account: {vibeState?.account?.name || "Not logged in"}</p>
            <p>Permissions: {JSON.stringify(vibeState?.permissions, null, 2)}</p>
            <button onClick={handleWriteData}>Write Data</button>
        </div>
    ) : null;
};

export default VibeClientComponent;
