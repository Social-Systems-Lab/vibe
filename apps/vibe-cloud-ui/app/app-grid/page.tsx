"use client";

import React, { useEffect, useMemo, useState } from "react";
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
    const CACHE_KEY = "vibe.appGrid.consents.v1";
    const [consents, setConsents] = useState<ConsentEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    // This effect runs once on the client to populate initial state from cache
    useEffect(() => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as { consents: ConsentEntry[] };
                setConsents(parsed.consents);
            }
        } catch {
            // Ignore localStorage errors
        }
    }, []);

    // This effect runs on mount to fetch fresh data and update the cache
    useEffect(() => {
        let cancelled = false;

        const fetchConsents = async () => {
            try {
                const res = await fetch("/auth/me/consents", { credentials: "include" });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({} as any));
                    throw new Error(data?.error || `Failed to load consents (${res.status})`);
                }
                const data = await res.json();
                if (cancelled) return;

                // update state
                setConsents(data.consents || []);

                // write-through cache
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ consents: data.consents || [], ts: Date.now() }));
                } catch {}

                // notify host
                try {
                    window.parent?.postMessage({ type: "appGridReady" }, "*");
                } catch {}
            } catch (e: any) {
                if (cancelled) return;
                setError(e.message || "Failed to load");
            }
        };

        // always fetch to refresh cache, but UI shows cached data immediately
        fetchConsents();
        return () => {
            cancelled = true;
        };
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

            {/* Remove explicit "Loading..." — show cache immediately; if no cache, render empty grid state */}
            {consents && consents.length === 0 && <div className="p-2 opacity-70">No apps yet. Approve consent in an app to see it here.</div>}

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
