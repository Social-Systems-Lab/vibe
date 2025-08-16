"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";

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

    // Helpers
    const copy = async (text?: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {}
    };

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

    return (
        <main className="w-full">
            <section className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
                <h1 className="text-2xl font-heading mb-4">Profile</h1>

                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                <div className="rounded-lg border border-border/60 bg-background/40 p-4 backdrop-blur">
                    <div className="flex items-center gap-4">
                        {cookieUser?.pictureUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cookieUser.pictureUrl} alt="" className="h-14 w-14 rounded-full border border-border/60 object-cover" loading="lazy" />
                        ) : (
                            <div className="h-14 w-14 rounded-full border border-border/60 bg-muted/30" />
                        )}
                        <div className="min-w-0">
                            <div className="text-lg font-medium truncate">{resolvedDisplayName}</div>
                            <div className="text-xs text-foreground/60">This is your identity on Vibe.</div>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">DID</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{user?.did || "-"}</div>
                                <button
                                    onClick={() => copy(user?.did)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">Instance ID</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{user?.instanceId || "-"}</div>
                                <button
                                    onClick={() => copy(user?.instanceId)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">Display name</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{resolvedDisplayName}</div>
                                <button
                                    onClick={() => copy(resolvedDisplayName)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">Avatar URL</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{cookieUser?.pictureUrl || user?.pictureUrl || "-"}</div>
                                <button
                                    onClick={() => copy(cookieUser?.pictureUrl || user?.pictureUrl)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 text-xs text-foreground/60">
                        Editing profile is coming soon. You&#39;ll be able to update your display name and avatar here.
                    </div>
                </div>
            </section>
        </main>
    );
}
