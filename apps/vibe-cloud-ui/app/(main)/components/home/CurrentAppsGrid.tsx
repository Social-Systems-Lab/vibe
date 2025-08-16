"use client";

import { useEffect, useMemo, useState } from "react";
import { appManifest } from "../../../lib/manifest";

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
    addedAt?: string; // Using as a proxy for "last used" until a dedicated field exists
};

export default function CurrentAppsGrid() {
    const [consents, setConsents] = useState<ConsentEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [followed, setFollowed] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const fetchConsents = async () => {
            try {
                const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
                const endpoint = `${apiBase}/auth/me/consents`;
                const res = await fetch(endpoint, { credentials: "include" });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({} as any));
                    throw new Error(data?.error || `Failed to load consents (${res.status})`);
                }
                const data = await res.json();
                setConsents((data?.consents || []) as ConsentEntry[]);
            } catch (e: any) {
                setError(e?.message || "Failed to load your apps");
            }
        };
        fetchConsents();
    }, []);

    const sorted = useMemo(() => {
        if (!consents) return null;
        return [...consents].sort((a, b) => {
            const ta = a.addedAt ? Date.parse(a.addedAt) : 0;
            const tb = b.addedAt ? Date.parse(b.addedAt) : 0;
            return tb - ta;
        });
    }, [consents]);

    return (
        <section className="w-full">
            <div className="max-w-5xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl md:text-2xl font-heading">Your apps</h2>
                    <div className="text-xs text-foreground/60">Sorted by last used</div>
                </div>

                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                {sorted && sorted.length === 0 && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-6 text-sm text-foreground/70 backdrop-blur">
                        You don't have any apps yet. Explore the app directory to get started.
                    </div>
                )}

                {sorted && sorted.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {sorted.map((c) => {
                            const key = `${c.clientId}:${c.origin}`;
                            const title = c.manifest?.appName || new URL(c.origin).hostname.replace(/^www\./, "");
                            const tagline = c.manifest?.appTagline || c.manifest?.appDescription || "";
                            const logo = c.manifest?.appLogoUrl || c.manifest?.appLogotypeUrl || "";
                            const showcase = c.manifest?.appShowcaseUrl || c.manifest?.backgroundImageUrl || "";

                            const isFollowed = !!followed[key];

                            return (
                                <div key={key} className="rounded-lg border border-border/60 bg-background/40 overflow-hidden backdrop-blur">
                                    <a href={c.origin} target="_blank" rel="noreferrer" className="block hover:bg-accent/10 transition" title={title}>
                                        <div className="relative w-full aspect-video bg-muted/40">
                                            {showcase ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={showcase} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                                            ) : (
                                                <div className="absolute inset-0 w-full h-full bg-muted/30" />
                                            )}
                                            {logo ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={logo}
                                                    alt=""
                                                    className="absolute left-3 bottom-3 h-8 w-8 rounded-md border border-border/60 bg-background/60 backdrop-blur"
                                                    loading="lazy"
                                                />
                                            ) : null}
                                        </div>
                                        <div className="p-4">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="text-base font-medium line-clamp-1">{title}</div>
                                            </div>
                                            {tagline ? <p className="text-sm text-foreground/70 line-clamp-2">{tagline}</p> : null}
                                        </div>
                                    </a>
                                    <div className="px-4 pb-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    // TODO: Wire to real follow API; this toggles local state as a cue
                                                    setFollowed((s) => ({ ...s, [key]: !isFollowed }));
                                                }}
                                                className={`inline-flex items-center rounded-md border px-3 py-1 text-xs transition ${
                                                    isFollowed
                                                        ? "bg-primary text-primary-foreground border-transparent"
                                                        : "border-border bg-background hover:bg-accent/20"
                                                }`}
                                            >
                                                {isFollowed ? "Following" : "Follow"}
                                            </button>
                                            <a
                                                href={c.origin}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                            >
                                                Open
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
