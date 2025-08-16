"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";

type HubSession = {
    username: string;
    password: string;
    cookie: string;
    dbName: string;
    url?: string;
};

export default function DevelopmentPage() {
    const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
    const [token, setToken] = useState<string | null>(null);
    const [session, setSession] = useState<HubSession | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Helpers
    const copy = async (text?: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {}
    };

    // Acquire API token (cookie-auth) for bearer endpoints testing
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

    // Get hub session (cookie-auth)
    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch(`${apiBase}/hub/session`, { credentials: "include" });
                if (!res.ok) throw new Error(`Failed to fetch DB session (${res.status})`);
                const data = await res.json();
                setSession(data as HubSession);
            } catch (e: any) {
                setError(e?.message || "Failed to fetch DB session");
            }
        };
        run();
    }, [apiBase]);

    const masked = (secret?: string, head = 4, tail = 4) =>
        secret && secret.length > head + tail ? `${secret.slice(0, head)}…${secret.slice(-tail)}` : secret || "-";

    return (
        <main className="w-full">
            <section className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
                <h1 className="text-2xl font-heading mb-4">Development</h1>

                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                <div className="rounded-lg border border-border/60 bg-background/40 p-4 backdrop-blur">
                    <div className="text-sm text-foreground/70 mb-3">
                        Use these credentials and tokens for local development. Treat them as secrets.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">API Token (Bearer)</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{masked(token || undefined, 12, 12)}</div>
                                <button
                                    onClick={() => copy(token || undefined)}
                                    disabled={!token}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition disabled:opacity-50"
                                >
                                    Copy
                                </button>
                            </div>
                            <div className="mt-2 text-[11px] text-foreground/60">
                                Use as Authorization: Bearer <token> with {apiBase}/data/* endpoints.
                            </div>
                        </div>

                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">Database name</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{session?.dbName || "-"}</div>
                                <button
                                    onClick={() => copy(session?.dbName)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">DB Username</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{session?.username || "-"}</div>
                                <button
                                    onClick={() => copy(session?.username)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">DB Password</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{masked(session?.password)}</div>
                                <button
                                    onClick={() => copy(session?.password)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        <div className="rounded-md border border-border/60 bg-background p-3 md:col-span-2">
                            <div className="text-xs text-foreground/60 mb-1">Session Cookie</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{masked(session?.cookie, 8, 8)}</div>
                                <button
                                    onClick={() => copy(session?.cookie)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                            <div className="mt-2 text-[11px] text-foreground/60">
                                Use for direct CouchDB access if needed. Prefer the API where possible.
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 text-xs text-foreground/60">
                    More dev helpers (webhook tester, SSE viewer, schema browser) will be added here.
                </div>
            </section>
        </main>
    );
}
