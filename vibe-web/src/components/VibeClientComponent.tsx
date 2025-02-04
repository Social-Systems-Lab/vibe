"use client";

import { useEffect, useState } from "react";
import { vibe, VibeState, AppManifest } from "vibe-sdk";

const VibeClientComponent = () => {
    const [vibeState, setVibeState] = useState<VibeState | null>(null);

    useEffect(() => {
        const manifest: AppManifest = {
            id: "com.example.vibe-web",
            name: "Movie Database",
            description: "A demo web app using the Vibe SDK",
            permissions: ["Read Name", "Read Ratings"],
            onetapEnabled: true,
            pictureUrl: "https://makecircles.org/images/demo/moviedblogo.jpg",
        };

        const unsubscribe = vibe.init(manifest, (state) => {
            console.log("Vibe state updated:", state);
            setVibeState(state);
        });

        return () => {
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

    return (
        <div>
            <h1>Vibe Client Component</h1>
            <p>In vibe app: {vibe.inVibeApp.toString()}</p>
            <p>Account: {vibeState?.account?.name || "Not logged in"}</p>
            <p>Permissions: {JSON.stringify(vibeState?.permissions, null, 2)}</p>
            <button onClick={handleWriteData}>Write Data</button>
        </div>
    );
};

export default VibeClientComponent;
