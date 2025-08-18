"use client";

import { useEffect, useMemo, useState } from "react";
import { appManifest } from "../../lib/manifest";

type Doc = Record<string, any>;

export default function DatabasePage() {
    const [apiBase] = useState(() => (appManifest.apiUrl || "").replace(/\/$/, ""));
    const [token, setToken] = useState<string | null>(null);

    // Namespaces (types)
    const [namespaces, setNamespaces] = useState<string[] | null>(null);
    const [nsLoading, setNsLoading] = useState(false);
    const [namespace, setNamespace] = useState<string>("");

    // Query + results
    const [selectorText, setSelectorText] = useState<string>("{}");
    const [docs, setDocs] = useState<Doc[] | null>(null);
    const [selected, setSelected] = useState<Doc | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Fetch an access token via cookie session
    useEffect(() => {
        const fetchToken = async () => {
            try {
                const res = await fetch(`${apiBase}/hub/api-token`, { credentials: "include" });
                if (!res.ok) throw new Error(`Token fetch failed (${res.status})`);
                const data = await res.json();
                setToken(data.token);
            } catch (e: any) {
                setError(e?.message || "Failed to get API token");
            }
        };
        fetchToken();
    }, [apiBase]);

    // Load namespaces (types) once token is available
    useEffect(() => {
        const run = async () => {
            if (!token) return;
            setNsLoading(true);
            setError(null);
            try {
                const res = await fetch(`${apiBase}/data/types?limit=5000`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({} as any));
                    throw new Error(data?.error || `Failed to list namespaces (${res.status})`);
                }
                const data = await res.json();
                const cols: string[] = Array.isArray(data?.types) ? data.types : [];
                setNamespaces(cols);
                // Choose a sensible default (files first, else first collection)
                const defaultNs = cols.includes("files") ? "files" : cols[0] || "";
                setNamespace((prev) => prev || defaultNs);
            } catch (e: any) {
                setError(e?.message || "Failed to list namespaces");
                setNamespaces([]);
            } finally {
                setNsLoading(false);
            }
        };
        run();
    }, [apiBase, token]);

    const selector = useMemo(() => {
        try {
            const parsed = JSON.parse(selectorText || "{}");
            if (parsed && typeof parsed === "object") return parsed;
            return {};
        } catch {
            return {};
        }
    }, [selectorText]);

    const query = async (ns?: string) => {
        const targetNs = ns ?? namespace;
        if (!token) {
            setError("No API token. Ensure you are signed in.");
            return;
        }
        if (!targetNs) {
            setError("Select a namespace.");
            return;
        }
        setLoading(true);
        setError(null);
        setSelected(null);
        try {
            const res = await fetch(`${apiBase}/data/types/${encodeURIComponent(targetNs)}/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(selector),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Query failed (${res.status})`);
            }
            const data = await res.json();
            const list = Array.isArray(data?.docs) ? data.docs : [];
            setDocs(list);
        } catch (e: any) {
            setError(e?.message || "Query failed");
            setDocs(null);
        } finally {
            setLoading(false);
        }
    };

    // Auto-load docs when namespace changes (default view)
    useEffect(() => {
        if (namespace) {
            query(namespace);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [namespace]);

    return (
        <main className="w-full">
            <section className="max-w-7xl">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-heading">Database</h1>
                    <div className="text-xs text-foreground/60">Read-only. All namespaces visible.</div>
                </div>

                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                <div className="grid grid-cols-12 gap-6">
                    {/* Namespaces */}
                    <aside className="col-span-12 md:col-span-3">
                        <div className="rounded-xl border border-border/60 bg-background/60 p-2 backdrop-blur">
                            <div className="px-2 py-1.5 text-xs text-foreground/60">Namespaces</div>
                            <div className="flex flex-col gap-1">
                                {nsLoading && <div className="px-2 py-1 text-xs text-foreground/60">Loading…</div>}
                                {!nsLoading && namespaces && namespaces.length === 0 && (
                                    <div className="px-2 py-1 text-xs text-foreground/60">No namespaces.</div>
                                )}
                                {!nsLoading &&
                                    namespaces &&
                                    namespaces.map((ns) => {
                                        const active = ns === namespace;
                                        return (
                                            <button
                                                key={ns}
                                                onClick={() => setNamespace(ns)}
                                                className={[
                                                    "text-left inline-flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition",
                                                    active ? "bg-accent/20 ring-1 ring-border text-foreground" : "hover:bg-accent/10 text-foreground/90",
                                                ].join(" ")}
                                            >
                                                <span className="truncate">{ns}</span>
                                                {active ? <span className="text-[10px] rounded-full bg-primary/10 px-2 py-0.5">active</span> : null}
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    </aside>

                    {/* Results + Viewer */}
                    <div className="col-span-12 md:col-span-9">
                        {/* Query controls */}
                        <div className="rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur mb-3">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                <div className="md:col-span-3">
                                    <label className="block text-xs text-foreground/70 mb-1">Selector JSON</label>
                                    <textarea
                                        value={selectorText}
                                        onChange={(e) => setSelectorText(e.target.value)}
                                        rows={3}
                                        className="w-full rounded-md border border-border/60 bg-background p-2 font-mono text-xs"
                                        placeholder='{"_id": {"$gte": "files/", "$lt": "files/\ufff0"}}'
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs text-foreground/70 mb-1">Actions</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => query()}
                                            disabled={loading || !token || !namespace}
                                            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                        >
                                            {loading ? "Querying…" : "Run query"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-foreground/60 mb-2">Results in “{namespace || "-"}”</div>
                                <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur min-h-40">
                                    {!docs && <div className="text-sm text-foreground/60">No results.</div>}
                                    {docs && docs.length === 0 && <div className="text-sm text-foreground/60">No documents matched.</div>}
                                    {docs && docs.length > 0 && (
                                        <ul className="divide-y divide-border/60">
                                            {docs.map((d: any) => (
                                                <li key={d._id || d.id} className="py-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium truncate">{d._id || d.id}</div>
                                                            <div className="text-xs text-foreground/60 truncate">{d.type}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => setSelected(d)}
                                                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                                        >
                                                            View
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-foreground/60 mb-2">Document</div>
                                <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur min-h-40">
                                    {selected ? (
                                        <pre className="text-xs font-mono whitespace-pre-wrap break-words">{JSON.stringify(selected, null, 2)}</pre>
                                    ) : (
                                        <div className="text-sm text-foreground/60">Select a document to view.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
