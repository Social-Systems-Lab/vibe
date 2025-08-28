"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";
import { Squircle, ImagePicker } from "vibe-react";
import { usePageTopBar } from "../components/PageTopBarContext";
import { User as UserIcon, Camera } from "lucide-react";

type BearerUser = {
    did: string;
    instanceId: string;
    displayName?: string;
    pictureUrl?: string;
    coverUrl?: string;
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

    // Image picker state
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerMode, setPickerMode] = useState<"avatar" | "cover">("avatar");
    const [saving, setSaving] = useState(false);

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
        setContent(
            <div className="flex items-center gap-2">
                <UserIcon size={16} className="text-foreground/70" />
                <span className="text-sm md:text-base font-medium">Profile</span>
            </div>
        );
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

    // Load cover: try expand first, then authorized fallback by did
    useEffect(() => {
        const run = async () => {
            if (!user?.did) return;
            try {
                // 1) Try unauthenticated expand for canonical id profiles/me
                const res = await fetch(`${apiBase}/data/expand?did=${encodeURIComponent(user.did)}&ref=${encodeURIComponent("profiles/me")}`);
                if (res.ok) {
                    const doc = await res.json();
                    if (doc && typeof doc === "object" && (doc as any).coverUrl) {
                        setUser((prev) => (prev ? { ...prev, coverUrl: (doc as any).coverUrl as string } : prev));
                        return;
                    }
                }
                // 2) Fallback: authorized query by did (handles missing profiles/me doc)
                if (token) {
                    const listRes = await fetch(`${apiBase}/data/types/profiles/query`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ did: user.did, limit: 1 }),
                    });
                    if (listRes.ok) {
                        const data = await listRes.json();
                        const first = Array.isArray((data as any)?.docs) ? (data as any).docs[0] : null;
                        if (first && (first as any).coverUrl) {
                            setUser((prev) => (prev ? { ...prev, coverUrl: (first as any).coverUrl as string } : prev));
                        }
                    }
                }
            } catch {}
        };
        run();
    }, [apiBase, user?.did, token]);

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

    // Build cover styles: use user's coverUrl if present; otherwise gradient fallback via classes
    const coverImage = user?.coverUrl || null;
    const coverStyle = coverImage ? { backgroundImage: `url(${coverImage})` } : undefined;

    // Avatar overlap calculations
    const AVATAR_SIZE = 160;
    const OVERLAP = Math.round(AVATAR_SIZE * 0.25); // 25% overlap

    const openPicker = (mode: "avatar" | "cover") => {
        setPickerMode(mode);
        setPickerOpen(true);
    };

    const applyAvatarUrl = async (url: string) => {
        if (!token) return;
        setSaving(true);
        try {
            const res = await fetch(`${apiBase}/users/me`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ pictureUrl: url }),
            });
            if (!res.ok) throw new Error(`Failed to update avatar (${res.status})`);
            // Optimistically update UI
            setUser((prev) => (prev ? { ...prev, pictureUrl: url } : prev));
            setCookieUser((prev) => (prev ? { ...prev, pictureUrl: url } : prev));
        } catch (e: any) {
            setError(e?.message || "Failed to update avatar");
        } finally {
            setSaving(false);
        }
    };

    const applyCoverUrl = async (url: string) => {
        if (!token || !user?.did) return;
        setSaving(true);
        try {
            // Upsert profiles/me with coverUrl via data API
            const res = await fetch(`${apiBase}/data/types/profiles`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ _id: "profiles/me", coverUrl: url, did: user.did }),
            });
            if (!res.ok) throw new Error(`Failed to update cover (${res.status})`);
            setUser((prev) => (prev ? { ...prev, coverUrl: url } : prev));
        } catch (e: any) {
            setError(e?.message || "Failed to update cover");
        } finally {
            setSaving(false);
        }
    };

    const onPickerSelect = async (files: any[]) => {
        const f = Array.isArray(files) ? files[0] : null;
        if (!f) {
            setPickerOpen(false);
            return;
        }
        const url: string | undefined = f.url || f.thumbnailUrl;
        if (!url) {
            setError("Selected image has no accessible URL");
            setPickerOpen(false);
            return;
        }
        if (pickerMode === "avatar") {
            await applyAvatarUrl(url);
        } else {
            await applyCoverUrl(url);
        }
        setPickerOpen(false);
    };

    return (
        <main className="w-full">
            <section className="max-w-5xl">
                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                {/* Cover */}
                <div className="relative group">
                    <div
                        className={[
                            "w-full rounded-xl overflow-hidden",
                            coverImage ? "bg-cover bg-center" : "bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30",
                            "h-[300px] md:h-[350px] lg:aspect-[16/4]",
                        ].join(" ")}
                        style={coverStyle}
                        aria-hidden="true"
                    />
                    <button
                        type="button"
                        onClick={() => openPicker("cover")}
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Change cover image"
                        title="Change cover image"
                    >
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 border border-border shadow-sm text-sm">
                            <Camera className="w-4 h-4" />
                            <span>Change cover</span>
                        </span>
                    </button>
                </div>

                {/* Info: avatar on the left, name + DID on the right, under cover.
                    Avatar overlaps the cover by ~25% of its height. */}
                <div className="px-4 md:px-6 pb-6">
                    <div className="flex items-start gap-4">
                        <div className="shrink-0 relative group" style={{ marginTop: -OVERLAP }}>
                            <Squircle
                                imageUrl={resolvedPicture || undefined}
                                size={AVATAR_SIZE}
                                className="shadow-lg ring-2 ring-background border border-border"
                            >
                                {resolvedDisplayName?.[0]}
                            </Squircle>
                            <button
                                type="button"
                                onClick={() => openPicker("avatar")}
                                className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 border border-border rounded-full p-2 shadow-sm"
                                aria-label="Change profile picture"
                                title="Change profile picture"
                            >
                                <Camera className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="min-w-0 mt-2">
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
                    Click the camera icons to update your profile picture and cover image.
                    {saving ? <span className="ml-2 text-foreground/50">(Saving…)</span> : null}
                </div>
            </section>

            {/* Image Picker Dialog */}
            <ImagePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onSelect={onPickerSelect}
                accept="image/*"
                selectionMode="single"
                title={pickerMode === "avatar" ? "Choose profile picture" : "Choose cover image"}
                allowUpload={true}
            />
        </main>
    );
}
