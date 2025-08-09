"use client";

import React, { useEffect, useState } from "react";

/**
 * Minimal local fallback for the missing `vibe-react` Squircle component.
 * Keeps Docker/CI builds unblocked until packages/vibe-react is added.
 */
function Squircle(props: { imageUrl?: string; size?: number; className?: string }) {
    const size = props.size ?? 56;
    const radius = Math.round(size * 0.3);
    return (
        <div
            className={props.className}
            style={{
                width: size,
                height: size,
                borderRadius: radius,
                overflow: "hidden",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f3f4f6",
            }}
        >
            {props.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
                <div style={{ width: "60%", height: "60%", backgroundColor: "#e5e7eb", borderRadius: 12 }} />
            )}
        </div>
    );
}

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
        <div className="min-h-screen bg-transparent px-4 pt-5 pb-6 box-border font-sans text-gray-900">
            {error && <div className="p-3 border border-red-300 bg-red-100 text-red-800 rounded-lg mb-3">{error}</div>}

            {consents && consents.length === 0 && <div className="p-2 opacity-70">No apps.</div>}

            {consents && consents.length > 0 && (
                <div className="grid grid-cols-4 gap-x-6 gap-y-6">
                    {consents.map((c) => {
                        const title = c.manifest?.appName || new URL(c.origin).hostname.replace(/^www\./, "");
                        const icon = c.manifest?.appLogoUrl;

                        return (
                            <button key={`${c.clientId}:${c.origin}`} onClick={() => openApp(c)} className="flex flex-col items-center justify-start gap-2 cursor-pointer select-none" title={title}>
                                <Squircle imageUrl={icon} size={56} className="bg-gray-100" />
                                <div className="text-[13px] font-medium text-center leading-snug line-clamp-2">{title}</div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
