"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";

type CertDoc = {
    _id?: string;
    id?: string;
    type?: string;
    certType?: {
        did?: string;
        ref?: string;
    };
    issuer?: string;
    subject?: string;
    expires?: string;
    signature?: string;
    createdAt?: string;
    updatedAt?: string;
};

export default function CertificatesPage() {
    const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
    const [token, setToken] = useState<string | null>(null);
    const [certs, setCerts] = useState<CertDoc[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Acquire API token via cookie-auth
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

    const loadCerts = async () => {
        if (!token) {
            setError("No API token. Ensure you are signed in.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/data/certs/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Failed to list certificates (${res.status})`);
            }
            const data = await res.json();
            setCerts(Array.isArray(data?.docs) ? (data.docs as CertDoc[]) : []);
        } catch (e: any) {
            setError(e?.message || "Failed to list certificates");
            setCerts(null);
        } finally {
            setLoading(false);
        }
    };

    const copy = async (text?: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {}
    };

    const mask = (s?: string, head = 8, tail = 8) => (s && s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s || "-");

    return (
        <main className="w-full">
            <section className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-heading">Certificates</h1>
                    <div className="text-xs text-foreground/60">Issue/revoke flows coming soon</div>
                </div>

                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                <div className="flex items-center gap-2 mb-4">
                    <button
                        onClick={loadCerts}
                        disabled={loading || !token}
                        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                        {loading ? "Loading…" : "Load certificates"}
                    </button>
                    {!token && <span className="text-xs text-foreground/60">Waiting for API token…</span>}
                </div>

                <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur">
                    {!certs && <div className="text-sm text-foreground/60">No data yet. Click “Load certificates”.</div>}
                    {certs && certs.length === 0 && <div className="text-sm text-foreground/60">No certificates found.</div>}
                    {certs && certs.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-foreground/70">
                                    <tr>
                                        <th className="py-2 pr-3">ID</th>
                                        <th className="py-2 pr-3">Type</th>
                                        <th className="py-2 pr-3">Issuer</th>
                                        <th className="py-2 pr-3">Subject</th>
                                        <th className="py-2 pr-3">Ref</th>
                                        <th className="py-2 pr-3">Expires</th>
                                        <th className="py-2 pr-3">Signature</th>
                                        <th className="py-2 pr-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {certs.map((c) => (
                                        <tr key={c._id || c.id}>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{c._id || c.id || "-"}</code>
                                            </td>
                                            <td className="py-2 pr-3">{c.type || "-"}</td>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{c.issuer || "-"}</code>
                                            </td>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{c.subject || "-"}</code>
                                            </td>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{c.certType?.ref || "-"}</code>
                                            </td>
                                            <td className="py-2 pr-3">{c.expires || "-"}</td>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{mask(c.signature)}</code>
                                            </td>
                                            <td className="py-2 pr-3">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => copy(c.signature)}
                                                        disabled={!c.signature}
                                                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition disabled:opacity-50"
                                                    >
                                                        Copy signature
                                                    </button>
                                                    {/* Future: revoke */}
                                                    {/* <button className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition">
                            Revoke
                          </button> */}
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
