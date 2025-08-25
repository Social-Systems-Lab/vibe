"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";
import { Squircle } from "vibe-react";
import { usePageTopBar } from "../components/PageTopBarContext";

type BearerUser = {
    did: string;
    instanceId: string;
    displayName?: string;
    pictureUrl?: string;
};

type CookieUser = {
    displayName?: string;
    pictureUrl?: string;
};

export default function ProfilePage() {
    const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<BearerUser | null>(null);
    const [cookieUser, setCookieUser] = useState<CookieUser | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { setContent } = usePageTopBar();

    // Helpers
    const copy = async (text?: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {}
    };

    const shortDid = (did?: string) => {
        if (!did) return "-";
        const last = did.slice(-6);
        return "…" + last;
    };

    // Inject breadcrumb/title into the shared TopBar rendered by Layout
    useEffect(() => {
        setContent(<div className="text-sm md:text-base font-medium">Profile</div>);
        return () => setContent(null);
    }, [setContent]);

    // Acquire API token (cookie-auth)
    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch(`${apiBase}/hub/api-token`, { credentials: "include" });
                if (!res.ok) throw new Error(`Token fetch failed (${res.status})`);
                const data = await res.json();
                setToken(data.token);
            } catch (e: any) {
                setError(e?.message || "Failed to get API token");
            }
        };
        run();
    }, [apiBase]);

    // Load bearer user (preferred for DID + instanceId)
    useEffect(() => {
        const run = async () => {
            if (!token) return;
            try {
                const res = await fetch(`${apiBase}/users/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error(`Failed to load user (${res.status})`);
                const data = await res.json();
                setUser(data.user as BearerUser);
            } catch (e: any) {
                setError(e?.message || "Failed to load user");
            }
        };
        run();
    }, [apiBase, token]);

    // Load cookie user (displayName/picture)
    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
                if (!res.ok) return; // optional
                const data = await res.json();
                setCookieUser(data as CookieUser);
            } catch {}
        };
        run();
    }, [apiBase]);

    const resolvedDisplayName = user?.displayName || cookieUser?.displayName || "Your profile";
    const resolvedPicture = cookieUser?.pictureUrl || user?.pictureUrl || null;

    // Build cover styles
    const coverStyle = resolvedPicture ? { backgroundImage: `url(${resolvedPicture})` } : undefined;

    // Avatar overlap calculations
    const AVATAR_SIZE = 112;
    const OVERLAP = Math.round(AVATAR_SIZE * 0.25); // 25% overlap

    return (
        <main className="w-full">
            <section className="max-w-5xl">
                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                {/* Cover */}
                <div
                    className={[
                        "w-full rounded-xl overflow-hidden",
                        resolvedPicture ? "bg-cover bg-center" : "bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30",
                        "h-36 md:h-48 lg:aspect-[16/5]",
                    ].join(" ")}
                    style={coverStyle}
                    aria-hidden="true"
                />

                {/* Info: avatar on the left, name + DID on the right, under cover.
                    Avatar overlaps the cover by ~25% of its height. */}
                <div className="px-4 md:px-6 pb-6">
                    <div className="flex items-center gap-4" style={{ marginTop: -OVERLAP }}>
                        <div className="shrink-0">
                            <Squircle
                                imageUrl={resolvedPicture || undefined}
                                size={AVATAR_SIZE}
                                className="shadow-lg ring-2 ring-background border border-border"
                            >
                                {resolvedDisplayName?.[0]}
                            </Squircle>
                        </div>

                        <div className="min-w-0">
                            <div className="text-2xl md:text-3xl font-semibold truncate">{resolvedDisplayName}</div>
                            <div className="text-sm text-foreground/60">This is your identity on Vibe.</div>

                            {/* DID pill */}
                            <div className="mt-3">
                                <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background/80 px-3 py-1 text-xs">
                                    <span className="font-mono inline-flex items-center gap-1">
                                        {/* key icon */}
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 9.75l-7.5 7.5m0 0H9.75m2.25 0V15" />
                                        </svg>
                                        {shortDid(user?.did)}
                                    </span>
                                    <button
                                        onClick={() => copy(user?.did)}
                                        className="inline-flex items-center rounded-sm border border-border bg-background px-1.5 py-0.5 text-[11px] hover:bg-accent/20 transition"
                                        title="Copy DID"
                                    >
                                        {/* subtle copy icon */}
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-2 text-xs text-foreground/60">
                    Editing profile is coming soon. You'll be able to update your display name, avatar and cover here.
                </div>
            </section>
        </main>
    );
}
