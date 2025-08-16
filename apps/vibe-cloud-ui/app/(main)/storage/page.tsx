"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";

type FileDoc = {
    _id?: string;
    id?: string;
    name?: string;
    storageKey?: string;
    mimeType?: string;
    size?: number;
    createdAt?: string;
    updatedAt?: string;
};

export default function StoragePage() {
    const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
    const [token, setToken] = useState<string | null>(null);
    const [files, setFiles] = useState<FileDoc[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Get API token via cookie-auth endpoint
    useEffect(() => {
        const getToken = async () => {
            try {
                const res = await fetch(`${apiBase}/hub/api-token`, { credentials: "include" });
                if (!res.ok) throw new Error(`Token fetch failed (${res.status})`);
                const data = await res.json();
                setToken(data.token);
            } catch (e: any) {
                setError(e?.message || "Failed to get API token");
            }
        };
        getToken();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadFiles = async () => {
        if (!token) {
            setError("No API token. Ensure you are signed in.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // Read from files namespace (read-only)
            const res = await fetch(`${apiBase}/data/files/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Failed to list files (${res.status})`);
            }
            const data = await res.json();
            setFiles(Array.isArray(data?.docs) ? (data.docs as FileDoc[]) : []);
        } catch (e: any) {
            setError(e?.message || "Failed to list files");
            setFiles(null);
        } finally {
            setLoading(false);
        }
    };

    const presignGet = async (storageKey?: string) => {
        if (!token || !storageKey) return;
        try {
            // Use debug=1 in dev to get helpful URLs (presigned and/or public)
            const res = await fetch(`${apiBase}/storage/presign-get?debug=1`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ storageKey, expires: 300 }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Failed to presign download (${res.status})`);
            }
            const data = await res.json();
            // Prefer explicit URL field, fall back to presignedURL/publicURL in debug payloads
            const url: string | undefined = data.url || data.presignedURL || data.publicURL;
            if (!url) throw new Error("No downloadable URL available");
            window.open(url, "_blank", "noopener,noreferrer");
        } catch (e: any) {
            setError(e?.message || "Failed to presign download");
        }
    };

    return (
        <main className="w-full">
            <section className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-heading">Storage (Read-only)</h1>
                    <div className="text-xs text-foreground/60">Phase 1 lists from the files namespace</div>
                </div>

                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                <div className="flex items-center gap-2 mb-4">
                    <button
                        onClick={loadFiles}
                        disabled={loading || !token}
                        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                        {loading ? "Loading…" : "Load files"}
                    </button>
                    {!token && <span className="text-xs text-foreground/60">Waiting for API token…</span>}
                </div>

                <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur">
                    {!files && <div className="text-sm text-foreground/60">No data yet. Click “Load files”.</div>}
                    {files && files.length === 0 && <div className="text-sm text-foreground/60">No files found.</div>}
                    {files && files.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-foreground/70">
                                    <tr>
                                        <th className="py-2 pr-3">Name</th>
                                        <th className="py-2 pr-3">Type</th>
                                        <th className="py-2 pr-3">Size</th>
                                        <th className="py-2 pr-3">Key</th>
                                        <th className="py-2 pr-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {files.map((f) => (
                                        <tr key={f._id || f.id}>
                                            <td className="py-2 pr-3">{f.name || "-"}</td>
                                            <td className="py-2 pr-3">{f.mimeType || "-"}</td>
                                            <td className="py-2 pr-3">{typeof f.size === "number" ? `${f.size.toLocaleString()} B` : "-"}</td>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{f.storageKey || "-"}</code>
                                            </td>
                                            <td className="py-2 pr-3">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => presignGet(f.storageKey)}
                                                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                                    >
                                                        Preview/Download
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
