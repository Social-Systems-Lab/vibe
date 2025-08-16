"use client";

import Link from "next/link";
import { useState } from "react";

type AppCard = {
    id: string;
    name: string;
    description: string;
    href: string;
    badge?: string;
};

const apps: AppCard[] = [
    {
        id: "feeds",
        name: "Vibe Feeds",
        description: "A personal social reader powered by your portable identity.",
        href: "/app-grid",
        badge: "New",
    },
    {
        id: "collections",
        name: "Vibe Collections",
        description: "Curate, remix, and share across apps.",
        href: "/app-grid",
    },
    {
        id: "notes",
        name: "Vibe Notes",
        description: "Write once, publish everywhere.",
        href: "/app-grid",
    },
    {
        id: "media",
        name: "Vibe Media",
        description: "Own your media, move it between apps.",
        href: "/app-grid",
    },
    {
        id: "chat",
        name: "Vibe Chat",
        description: "Portable conversations with real ownership.",
        href: "/app-grid",
    },
    {
        id: "studio",
        name: "Vibe Studio",
        description: "Build, test, and ship Vibe apps.",
        href: "/app-grid",
    },
];

function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-foreground/70">
            {children}
        </span>
    );
}

export default function DiscoverAppsGrid() {
    const [followed, setFollowed] = useState<Record<string, boolean>>({});

    return (
        <section className="w-full">
            <div className="max-w-5xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl md:text-2xl font-heading">Discover apps</h2>
                    <Link href="/app-grid" className="text-xs text-foreground/70 hover:text-primary">
                        See all →
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {apps.map((app) => {
                        const isFollowed = !!followed[app.id];
                        return (
                            <div
                                key={app.id}
                                className="group rounded-lg border border-border/60 bg-background/40 p-4 backdrop-blur hover:bg-accent/10 transition"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-base font-medium line-clamp-1">{app.name}</div>
                                    {app.badge ? <Pill>{app.badge}</Pill> : null}
                                </div>
                                <p className="text-sm text-foreground/70 line-clamp-2">{app.description}</p>

                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        onClick={() => setFollowed((s) => ({ ...s, [app.id]: !isFollowed }))}
                                        className={`inline-flex items-center rounded-md border px-3 py-1 text-xs transition ${
                                            isFollowed
                                                ? "bg-primary text-primary-foreground border-transparent"
                                                : "border-border bg-background hover:bg-accent/20"
                                        }`}
                                        aria-pressed={isFollowed}
                                    >
                                        {isFollowed ? "Following" : "Follow"}
                                    </button>
                                    <Link
                                        href={app.href}
                                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                    >
                                        Learn more
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
