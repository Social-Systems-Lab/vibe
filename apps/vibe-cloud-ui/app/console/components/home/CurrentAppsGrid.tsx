"use client";

import { useEffect, useMemo, useState } from "react";
import { appManifest } from "../../../lib/manifest";
import { Button, DataTable, type ColumnDef, ToggleGroup, ToggleGroupItem } from "vibe-react";
import { LayoutGrid, List as ListIcon, Trash2Icon } from "lucide-react";

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
    const [view, setView] = useState<"grid" | "table">("grid");

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

    useEffect(() => {
        fetchConsents();
    }, []);

    const revokeConsent = async (clientId: string) => {
        const ok = window.confirm("Are you sure you want to remove this app? This will revoke its permissions.");
        if (!ok) return;

        try {
            const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
            const endpoint = `${apiBase}/auth/me/consents`;
            const res = await fetch(endpoint, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ clientId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Failed to revoke consent (${res.status})`);
            }
            await fetchConsents();
        } catch (e: any) {
            setError(e?.message || "Failed to remove app");
        }
    };

    const sorted = useMemo(() => {
        if (!consents) return null;
        return [...consents].sort((a, b) => {
            const ta = a.addedAt ? Date.parse(a.addedAt) : 0;
            const tb = b.addedAt ? Date.parse(b.addedAt) : 0;
            return tb - ta;
        });
    }, [consents]);

    const columns: ColumnDef<ConsentEntry>[] = [
        {
            accessorKey: "manifest.appName",
            header: "App",
            cell: ({ row }) => {
                const c = row.original;
                const title = c.manifest?.appName || new URL(c.origin).hostname.replace(/^www\./, "");
                const logo = c.manifest?.appLogoUrl || c.manifest?.appLogotypeUrl || "";
                return (
                    <a href={c.origin} target="_blank" rel="noreferrer" className="flex items-center gap-3">
                        {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="" className="size-8 rounded-md border" />
                        ) : (
                            <div className="size-8 rounded-md border bg-muted" />
                        )}
                        <div className="font-medium">{title}</div>
                    </a>
                );
            },
        },
        {
            accessorKey: "origin",
            header: "Origin",
        },
        {
            id: "actions",
            header: "Actions",
            cell: ({ row }) => {
                const c = row.original;
                return (
                    <Button variant="outline" size="sm" onClick={() => revokeConsent(c.clientId)}>
                        <Trash2Icon className="size-4 mr-2" />
                        Remove
                    </Button>
                );
            },
        },
    ];

    return (
        <section className="w-full">
            <div className="max-w-5xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl md:text-2xl font-heading">Your apps</h2>
                    <div className="flex items-center gap-2">
                        <div className="text-xs text-foreground/60">Sorted by last used</div>
                        <ToggleGroup type="single" value={view} onValueChange={(v) => setView(v as any)}>
                            <ToggleGroupItem value="grid" aria-label="Grid view">
                                <LayoutGrid className="size-4" />
                            </ToggleGroupItem>
                            <ToggleGroupItem value="table" aria-label="Table view">
                                <ListIcon className="size-4" />
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </div>

                {error && (
                    <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">
                        {error}
                    </div>
                )}

                {sorted && sorted.length === 0 && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-6 text-sm text-foreground/70 backdrop-blur">
                        You don't have any apps yet. Explore the app directory to get started.
                    </div>
                )}

                {sorted &&
                    sorted.length > 0 &&
                    (view === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {sorted.map((c) => {
                                const key = `${c.clientId}:${c.origin}`;
                                const title = c.manifest?.appName || new URL(c.origin).hostname.replace(/^www\./, "");
                                const tagline = c.manifest?.appTagline || c.manifest?.appDescription || "";
                                const logo = c.manifest?.appLogoUrl || c.manifest?.appLogotypeUrl || "";
                                const showcase = c.manifest?.appShowcaseUrl || c.manifest?.backgroundImageUrl || "";

                                return (
                                    <div
                                        key={key}
                                        className="rounded-lg border border-border/60 bg-background/40 overflow-hidden backdrop-blur"
                                    >
                                        <a
                                            href={c.origin}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block hover:bg-accent/10 transition"
                                            title={title}
                                        >
                                            <div className="relative w-full aspect-video bg-muted/40">
                                                {showcase ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={showcase}
                                                        alt=""
                                                        className="absolute inset-0 w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
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
                                                {tagline ? (
                                                    <p className="text-sm text-foreground/70 line-clamp-2">{tagline}</p>
                                                ) : null}
                                            </div>
                                        </a>
                                        <div className="px-4 pb-4">
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={c.origin}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                                >
                                                    Open
                                                </a>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => revokeConsent(c.clientId)}
                                                >
                                                    <Trash2Icon className="size-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <DataTable columns={columns} data={sorted} pageSize={10} />
                    ))}
            </div>
        </section>
    );
}
