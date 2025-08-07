"use client";

import React, { useEffect, useState } from "react";
import { Squircle } from "vibe-react";

type ConsentEntry = {
    clientId: string;
    origin: string;
    manifest?: {
        appName?: string;
        appDescription?: string;
        appTagline?: string;
        appLogoUrl?: string;
        appLogotypeUrl?: string;
        appShowcaseUrl?: string;
        backgroundImageUrl?: string;
        backgroundColor?: string;
        buttonColor?: string;
        themeColor?: string;
    };
    addedAt?: string;
};

export default function AppGridPage() {
    const [consents, setConsents] = useState<ConsentEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchConsents = async () => {
            try {
                // Important: Use same-origin credentials through the API proxy
                const res = await fetch("/auth/me/consents", { credentials: "include" });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({} as any));
                    throw new Error(data?.error || `Failed to load consents (${res.status})`);
                }
                const data = await res.json();
                setConsents(data.consents || []);
                // Notify host the grid is ready
                try {
                    window.parent?.postMessage({ type: "appGridReady" }, "*");
                } catch {}
            } catch (e: any) {
                setError(e.message || "Failed to load");
            }
        };
        fetchConsents();
    }, []);

    const openApp = (c: ConsentEntry) => {
        const url = c.origin;
        try {
            window.open(url, "_blank", "noopener,noreferrer");
        } catch {}
    };

    return (
        <div className="min-h-screen bg-transparent p-4 box-border font-sans text-gray-800">
            {error && <div className="p-3 border border-red-300 bg-red-100 text-red-800 rounded-lg mb-3">{error}</div>}

            {!consents && !error && <div className="p-2 opacity-70">Loading...</div>}

            {consents && consents.length === 0 && <div className="p-2 opacity-70">No apps yet. Approve consent in an app to see it here.</div>}

            {consents && consents.length > 0 && (
                <div className="grid grid-cols-fill-160 gap-3">
                    {consents.map((c) => {
                        const title = c.manifest?.appName || new URL(c.origin).hostname.replace(/^www\./, "");
                        const icon = c.manifest?.appLogoUrl;

                        return (
                            <button
                                key={`${c.clientId}:${c.origin}`}
                                onClick={() => openApp(c)}
                                className="flex flex-col items-center justify-center gap-2.5 p-4 rounded-lg cursor-pointer"
                                title={title}
                            >
                                <Squircle imageUrl={icon} size={56}>
                                    <span className="text-3xl">🟦</span>
                                </Squircle>
                                <div className="text-sm font-semibold text-center leading-tight">{title}</div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
