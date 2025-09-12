"use client";

import { useEffect, useState } from "react";

export default function PreviewPage() {
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.action === "VIBE_INIT") {
                setData(event.data.data);
            }
        };

        window.addEventListener("message", handleMessage);
        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);

    if (!data) {
        return <div>Loading preview...</div>;
    }

    return (
        <div className="p-4 border rounded">
            <h3 className="font-bold">Wordlock Game</h3>
            <p>Word: {data.word}</p>
        </div>
    );
}
