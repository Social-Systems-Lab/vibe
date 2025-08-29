"use client";

import { useEffect, useState } from "react";
import { useVibe, Squircle, ImagePicker, VibeImage } from "vibe-react";
import { usePageTopBar } from "../components/PageTopBarContext";
import { User as UserIcon, Camera } from "lucide-react";
import { FileDoc } from "vibe-sdk";

type ProfileDoc = {
    _id: string;
    name?: string;
    pictureUrl?: string;
    coverUrl?: string;
    coverStorageKey?: string;
    did: string;
};

export default function ProfilePage() {
    const { user: vibeUser, read, write } = useVibe();
    const [profile, setProfile] = useState<ProfileDoc | null>(null);
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

    // Subscribe to profile document
    useEffect(() => {
        if (!vibeUser) return;
        const query = { _id: "profiles/me", limit: 1 };
        const sub = read("profiles", query, ({ data }) => {
            const doc = data?.[0] as ProfileDoc | undefined;
            console.log("********* Profile doc update", doc);
            if (doc) {
                setProfile(doc);
            }
        });
        return () => {
            sub.then((s) => s.unsubscribe());
        };
    }, [vibeUser, read]);

    const resolvedDisplayName = profile?.name || vibeUser?.displayName || "Your profile";
    const resolvedPicture = profile?.pictureUrl || (vibeUser as any)?.pictureUrl || null;
    const coverFileDoc = profile?.coverStorageKey
        ? ({ storageKey: profile.coverStorageKey, mimeType: "image/" } as FileDoc)
        : null;

    // Avatar overlap calculations
    const AVATAR_SIZE = 160;
    const OVERLAP = Math.round(AVATAR_SIZE * 0.25); // 25% overlap

    const openPicker = (mode: "avatar" | "cover") => {
        setPickerMode(mode);
        setPickerOpen(true);
    };

    const onPickerSelect = async (files: any[]) => {
        const f = Array.isArray(files) ? files[0] : null;
        if (!f || !vibeUser) {
            setPickerOpen(false);
            return;
        }
        setSaving(true);
        try {
            const payload: Partial<ProfileDoc> = { _id: "profiles/me", did: vibeUser.did };
            if (pickerMode === "avatar") {
                payload.pictureUrl = f.storageKey;
            } else {
                payload.coverStorageKey = f.storageKey;
            }
            await write("profiles", payload);
        } catch (e: any) {
            setError(e?.message || "Failed to update profile");
        } finally {
            setSaving(false);
            setPickerOpen(false);
        }
    };

    return (
        <main className="w-full">
            <section className="max-w-5xl">
                {error && (
                    <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">
                        {error}
                    </div>
                )}

                {/* Cover */}
                <div className="relative group">
                    <div
                        className={[
                            "w-full rounded-xl overflow-hidden",
                            coverFileDoc
                                ? "bg-cover bg-center"
                                : "bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30",
                            "h-[300px] md:h-[350px] lg:aspect-[16/4]",
                        ].join(" ")}
                        aria-hidden="true"
                    >
                        {coverFileDoc && <VibeImage src={coverFileDoc} className="w-full h-full object-cover" />}
                    </div>
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
                                src={resolvedPicture}
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
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-3 w-3 text-foreground/50"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M19.5 9.75l-7.5 7.5m0 0H9.75m2.25 0V15"
                                            />
                                        </svg>
                                        {shortDid(vibeUser?.did)}
                                    </span>
                                    <button
                                        onClick={() => copy(vibeUser?.did)}
                                        className="inline-flex items-center rounded-sm border border-border bg-background px-1.5 py-0.5 text-[11px] hover:bg-accent/20 transition"
                                        title="Copy DID"
                                    >
                                        {/* subtle copy icon */}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-3 w-3 text-foreground/50"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M8 7h8a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M16 7V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2"
                                            />
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
