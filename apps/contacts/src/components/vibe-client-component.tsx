// vibe-client-component.tsx
"use client";

import { useEffect, useState } from "react";
import { vibe, VibeState, AppManifest } from "vibe-sdk";

const VibeClientComponent = () => {
    const [vibeState, setVibeState] = useState<VibeState | null>(null);
    const [vibeActive, setVibeActive] = useState<boolean>(false);
    const [testMessage, setTestMessage] = useState<string>("Hello from Vibe Client Component!");

    useEffect(() => {
        if (typeof window !== "undefined") {
            const checkVibe = () => {
                if (window._VIBE_ENABLED) {
                    setVibeActive(true);
                } else {
                    setVibeActive(false);
                    setTimeout(checkVibe, 500); // Retry in case of delayed injection
                }
            };
            checkVibe();
        }
    }, []);

    useEffect(() => {
        if (!vibeActive) return;

        try {
            const manifest: AppManifest = {
                id: "dev.vibeapp.contacts",
                name: "Contacts",
                description: "Official Contacts App",
                permissions: ["Read Name", "Read Ratings"],
                onetapEnabled: false,
                pictureUrl: "http://192.168.10.204:5201/icon.png",
            };

            setTestMessage(`Calling vibe init, window.ReactNativeWebView = ${window.ReactNativeWebView}`);

            const unsubscribe = vibe.init(manifest, (state) => {
                console.log("Vibe state updated:", state);
                setTestMessage("Vibe state updated: " + JSON.stringify(state));
                setVibeState(state);
            });

            return () => {
                unsubscribe();
            };
        } catch (error) {
            setTestMessage("Error initializing Vibe SDK. " + error);
        }
    }, [vibeActive]);

    const handleWriteData = async () => {
        try {
            const result = await vibe.writeData({ key: "exampleKey", value: "exampleValue" });
            console.log("Data written successfully:", result);
        } catch (error) {
            console.error("Error writing data:", error);
        }
    };

    return (
        <>
            {vibe?.isInVibeApp() ? (
                <div className="flex flex-col w-full">
                    <div className="text-3xl">Vibe Client Component</div>
                    <pre style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>{JSON.stringify(vibeState, null, 2)}</pre>
                    <button onClick={handleWriteData}>Write Data</button>
                </div>
            ) : null}
        </>
    );
};

export default VibeClientComponent;
