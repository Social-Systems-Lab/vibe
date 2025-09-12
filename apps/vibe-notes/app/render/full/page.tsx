"use client";

import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";

export default function FullPage() {
    const [data, setData] = useState<any>(null);
    const { sdk } = useVibe();

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.action === "VIBE_INIT") {
                // In a real app, you might use the contentId to fetch the full document
                // For this example, we'll just use the data from the preview
                setData(event.data.data);
            }
        };

        window.addEventListener("message", handleMessage);
        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);

    if (!data) {
        return <div>Loading content...</div>;
    }

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-4">Wordlock Game</h1>
            <div className="text-xl">
                <p>
                    The word is: <strong>{data.word}</strong>
                </p>
                <p>(Full renderer view)</p>
            </div>
        </div>
    );
}
