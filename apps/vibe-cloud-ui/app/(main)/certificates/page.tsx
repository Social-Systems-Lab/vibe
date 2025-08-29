"use client";

import { useEffect, useMemo, useState } from "react";
import { appManifest } from "../../lib/manifest";
import { Button } from "vibe-react";

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

type CertTypeDoc = {
    _id?: string;
    id?: string;
    type?: "cert-types";
    owner?: string;
    name?: string;
    label?: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
};

type RevocationDoc = {
    _id?: string;
    id?: string;
    type?: "revocations";
    certId: string;
    revokedAt: string;
};

type ApiReadOnceResponse<T> = {
    docs?: T[];
    doc?: T | null;
};

function base64UrlDecode(input: string): string {
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const bin = atob(padded);
    // Decode as UTF-8
    try {
        return decodeURIComponent(
            Array.prototype.map.call(bin, (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
        );
    } catch {
        return bin;
    }
}

function decodeJwt(token: string): any | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
        const json = base64UrlDecode(parts[1]);
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function mask(s?: string, head = 8, tail = 8) {
    return s && s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s || "-";
}

function formatDate(iso?: string) {
    if (!iso) return "-";
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString();
    } catch {
        return iso;
    }
}

export default function CertificatesPage() {
    const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
    const [token, setToken] = useState<string | null>(null);
    const [myDid, setMyDid] = useState<string | null>(null);

    // Tabs
    const tabs = ["Issued to Me", "Issued by Me", "My Types"] as const;
    type Tab = (typeof tabs)[number];
    const [activeTab, setActiveTab] = useState<Tab>("Issued to Me");

    // Data
    const [issuedToMe, setIssuedToMe] = useState<CertDoc[] | null>(null);
    const [issuedByMe, setIssuedByMe] = useState<CertDoc[] | null>(null);
    const [revocations, setRevocations] = useState<Record<string, RevocationDoc>>({});
    const [myTypes, setMyTypes] = useState<CertTypeDoc[] | null>(null);

    // Issue form
    const [issueOpen, setIssueOpen] = useState(false);
    const [issueSubject, setIssueSubject] = useState("");
    const [issueTypeRef, setIssueTypeRef] = useState("");
    const [issueExpires, setIssueExpires] = useState(""); // yyyy-mm-dd
    const [issuing, setIssuing] = useState(false);

    // Global UI
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({}); // revoke button spinners

    // Acquire API token via cookie-auth (server will look at session cookie)
    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch(`${apiBase}/hub/api-token`, { credentials: "include" });
                if (!res.ok) throw new Error(`Token fetch failed (${res.status})`);
                const data = await res.json();
                const t = data.token as string;
                setToken(t);
                const payload = decodeJwt(t);
                const sub = payload?.sub as string | undefined;
                if (sub) setMyDid(sub);
            } catch (e: any) {
                setError(e?.message || "Failed to get API token");
            }
        };
        run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    const authHeaders = useMemo(
        () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : undefined),
        [token]
    );

    const copy = async (text?: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {}
    };

    // Loaders
    const loadIssuedToMe = async () => {
        if (!authHeaders) return;
        const body: any = {};
        if (myDid) {
            body.selector = { subject: myDid };
        }
        const res = await fetch(`${apiBase}/data/types/certs/query`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({} as any));
            throw new Error(data?.error || `Failed to list certificates (${res.status})`);
        }
        const data = (await res.json()) as ApiReadOnceResponse<CertDoc>;
        setIssuedToMe(Array.isArray(data?.docs) ? data.docs : []);
    };

    const loadIssuedByMe = async () => {
        if (!authHeaders) return;
        const body: any = {};
        if (myDid) {
            body.selector = { issuer: myDid };
        }
        const res = await fetch(`${apiBase}/data/types/issued-certs/query`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({} as any));
            throw new Error(data?.error || `Failed to list issued certificates (${res.status})`);
        }
        const data = (await res.json()) as ApiReadOnceResponse<CertDoc>;
        const docs = Array.isArray(data?.docs) ? data.docs : [];
        setIssuedByMe(docs);

        // Optionally annotate revocations for these certs
        if (docs.length > 0) {
            try {
                const ids = docs.map((d) => d._id || d.id).filter(Boolean) as string[];
                if (ids.length > 0) {
                    const revRes = await fetch(`${apiBase}/data/types/revocations/query`, {
                        method: "POST",
                        headers: authHeaders,
                        body: JSON.stringify({ certId: { $in: ids } }),
                    });
                    if (revRes.ok) {
                        const revData = (await revRes.json()) as ApiReadOnceResponse<RevocationDoc>;
                        const byId: Record<string, RevocationDoc> = {};
                        (revData.docs || []).forEach((r) => {
                            if (r.certId) byId[r.certId] = r;
                        });
                        setRevocations(byId);
                    }
                }
            } catch {
                // non-fatal
            }
        } else {
            setRevocations({});
        }
    };

    const loadMyTypes = async () => {
        if (!authHeaders) return;
        const body: any = {};
        if (myDid) {
            body.selector = { owner: myDid };
        }
        const res = await fetch(`${apiBase}/data/types/cert-types/query`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({} as any));
            throw new Error(data?.error || `Failed to list certificate types (${res.status})`);
        }
        const data = (await res.json()) as ApiReadOnceResponse<CertTypeDoc>;
        setMyTypes(Array.isArray(data?.docs) ? data.docs : []);
    };

    const loadAll = async () => {
        if (!authHeaders) return;
        setLoading(true);
        setError(null);
        try {
            await Promise.all([loadIssuedToMe(), loadIssuedByMe(), loadMyTypes()]);
        } catch (e: any) {
            setError(e?.message || "Failed to load certificates");
        } finally {
            setLoading(false);
        }
    };

    // Auto-load once token is ready
    useEffect(() => {
        if (authHeaders && myDid) {
            void loadAll();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authHeaders, myDid]);

    // Actions
    const revokeCert = async (certId?: string) => {
        if (!authHeaders || !certId) return;
        setBusyIds((s) => ({ ...s, [certId]: true }));
        setError(null);
        try {
            const res = await fetch(`${apiBase}/certs/revoke/${encodeURIComponent(certId)}`, {
                method: "POST",
                headers: { Authorization: authHeaders.Authorization! },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Failed to revoke (${res.status})`);
            }
            // Refresh issued by me and revocations
            await loadIssuedByMe();
        } catch (e: any) {
            setError(e?.message || "Failed to revoke certificate");
        } finally {
            setBusyIds((s) => ({ ...s, [certId]: false }));
        }
    };

    const issueCert = async () => {
        if (!authHeaders || !myDid) return;
        if (!issueSubject || !issueTypeRef) {
            setError("Subject DID and Certificate Type are required");
            return;
        }
        setIssuing(true);
        setError(null);
        try {
            // certType did must be the owner of the type (myDid)
            const body = {
                subject: issueSubject.trim(),
                certType: {
                    did: myDid,
                    ref: issueTypeRef,
                },
                expires: issueExpires ? new Date(issueExpires).toISOString() : undefined,
            };
            const res = await fetch(`${apiBase}/certs/issue-auto`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Failed to issue certificate (${res.status})`);
            }
            // Reset form
            setIssueSubject("");
            setIssueTypeRef("");
            setIssueExpires("");
            setIssueOpen(false);
            // Refresh both lists
            await Promise.all([loadIssuedByMe(), loadIssuedToMe()]);
        } catch (e: any) {
            setError(e?.message || "Failed to issue certificate");
        } finally {
            setIssuing(false);
        }
    };

    const isRevoked = (cert: CertDoc) => {
        const key = cert._id || cert.id;
        if (!key) return false;
        return !!revocations[key];
    };

    const currentTypesSelect = useMemo(() => {
        const items = myTypes || [];
        return items.map((t) => ({
            value: t._id || t.id || "",
            label: t.name || t.label || t._id || t.id || "-",
        }));
    }, [myTypes]);

    return (
        <main className="w-full">
            <section className="max-w-6xl">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-heading">Certificates</h1>
                </div>

                {error && (
                    <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">
                        {error}
                    </div>
                )}

                <div className="mb-3 flex items-center gap-2">
                    {tabs.map((t) => (
                        <button
                            key={t}
                            onClick={() => setActiveTab(t)}
                            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm border ${
                                activeTab === t
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:bg-accent/20"
                            }`}
                        >
                            {t}
                        </button>
                    ))}

                    <div className="ml-auto">
                        <Button onClick={() => setIssueOpen((v) => !v)} disabled={!myDid || !token}>
                            Issue Certificate
                        </Button>
                    </div>
                </div>

                {/* Issue form */}
                {issueOpen && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-3 mb-4">
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="flex flex-col">
                                <label className="text-xs text-foreground/60 mb-1">Subject DID</label>
                                <input
                                    value={issueSubject}
                                    onChange={(e) => setIssueSubject(e.target.value)}
                                    placeholder="did:vibe:..."
                                    className="border rounded-md px-2 py-1.5 bg-background"
                                />
                            </div>
                            <div className="flex flex-col">
                                <label className="text-xs text-foreground/60 mb-1">Certificate Type</label>
                                <select
                                    value={issueTypeRef}
                                    onChange={(e) => setIssueTypeRef(e.target.value)}
                                    className="border rounded-md px-2 py-1.5 bg-background"
                                >
                                    <option value="">Select a type…</option>
                                    {currentTypesSelect.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <label className="text-xs text-foreground/60 mb-1">Expires (optional)</label>
                                <input
                                    type="date"
                                    value={issueExpires}
                                    onChange={(e) => setIssueExpires(e.target.value)}
                                    className="border rounded-md px-2 py-1.5 bg-background"
                                />
                            </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                onClick={() => void issueCert()}
                                disabled={issuing || !issueSubject || !issueTypeRef}
                                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                                {issuing ? "Issuing…" : "Issue"}
                            </button>
                            <button
                                onClick={() => setIssueOpen(false)}
                                className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-accent/20"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Tabs content */}
                {activeTab === "Issued to Me" && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur">
                        {!issuedToMe ? (
                            <div className="text-sm text-foreground/60">Loading…</div>
                        ) : issuedToMe.length === 0 ? (
                            <div className="text-sm text-foreground/60">No certificates issued to you.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-foreground/70">
                                        <tr>
                                            <th className="py-2 pr-3">ID</th>
                                            <th className="py-2 pr-3">Type</th>
                                            <th className="py-2 pr-3">Issuer</th>
                                            <th className="py-2 pr-3">Ref</th>
                                            <th className="py-2 pr-3">Expires</th>
                                            <th className="py-2 pr-3">Signature</th>
                                            <th className="py-2 pr-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {issuedToMe.map((c) => (
                                            <tr key={c._id || c.id}>
                                                <td className="py-2 pr-3">
                                                    <code className="text-xs">{c._id || c.id || "-"}</code>
                                                </td>
                                                <td className="py-2 pr-3">{c.type || "-"}</td>
                                                <td className="py-2 pr-3">
                                                    <code className="text-xs">{c.issuer || "-"}</code>
                                                </td>
                                                <td className="py-2 pr-3">
                                                    <code className="text-xs">{c.certType?.ref || "-"}</code>
                                                </td>
                                                <td className="py-2 pr-3">{formatDate(c.expires)}</td>
                                                <td className="py-2 pr-3">
                                                    <code className="text-xs">{mask(c.signature)}</code>
                                                </td>
                                                <td className="py-2 pr-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => void copy(c.signature)}
                                                            disabled={!c.signature}
                                                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition disabled:opacity-50"
                                                        >
                                                            Copy signature
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
                )}

                {activeTab === "Issued by Me" && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur">
                        {!issuedByMe ? (
                            <div className="text-sm text-foreground/60">Loading…</div>
                        ) : issuedByMe.length === 0 ? (
                            <div className="text-sm text-foreground/60">You have not issued any certificates.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-foreground/70">
                                        <tr>
                                            <th className="py-2 pr-3">ID</th>
                                            <th className="py-2 pr-3">Type</th>
                                            <th className="py-2 pr-3">Subject</th>
                                            <th className="py-2 pr-3">Ref</th>
                                            <th className="py-2 pr-3">Expires</th>
                                            <th className="py-2 pr-3">Status</th>
                                            <th className="py-2 pr-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {issuedByMe.map((c) => {
                                            const id = c._id || c.id || "";
                                            const revoked = isRevoked(c);
                                            return (
                                                <tr key={id}>
                                                    <td className="py-2 pr-3">
                                                        <code className="text-xs">{id || "-"}</code>
                                                    </td>
                                                    <td className="py-2 pr-3">{c.type || "-"}</td>
                                                    <td className="py-2 pr-3">
                                                        <code className="text-xs">{c.subject || "-"}</code>
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <code className="text-xs">{c.certType?.ref || "-"}</code>
                                                    </td>
                                                    <td className="py-2 pr-3">{formatDate(c.expires)}</td>
                                                    <td className="py-2 pr-3">
                                                        {revoked ? (
                                                            <span className="inline-flex items-center rounded border border-red-300 bg-red-50 text-red-800 px-2 py-0.5 text-xs">
                                                                Revoked
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center rounded border border-emerald-300 bg-emerald-50 text-emerald-800 px-2 py-0.5 text-xs">
                                                                Active
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => void copy(c.signature)}
                                                                disabled={!c.signature}
                                                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition disabled:opacity-50"
                                                            >
                                                                Copy signature
                                                            </button>
                                                            <button
                                                                onClick={() => void revokeCert(id)}
                                                                disabled={!id || revoked || !!busyIds[id]}
                                                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition disabled:opacity-50"
                                                            >
                                                                {busyIds[id] ? "Revoking…" : "Revoke"}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "My Types" && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur">
                        {!myTypes ? (
                            <div className="text-sm text-foreground/60">Loading…</div>
                        ) : myTypes.length === 0 ? (
                            <div className="text-sm text-foreground/60">No certificate types found.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-foreground/70">
                                        <tr>
                                            <th className="py-2 pr-3">Ref</th>
                                            <th className="py-2 pr-3">Name</th>
                                            <th className="py-2 pr-3">Owner</th>
                                            <th className="py-2 pr-3">Created</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {myTypes.map((t) => (
                                            <tr key={t._id || t.id}>
                                                <td className="py-2 pr-3">
                                                    <code className="text-xs">{t._id || t.id || "-"}</code>
                                                </td>
                                                <td className="py-2 pr-3">{t.name || t.label || "-"}</td>
                                                <td className="py-2 pr-3">
                                                    <code className="text-xs">{t.owner || "-"}</code>
                                                </td>
                                                <td className="py-2 pr-3">{formatDate(t.createdAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </main>
    );
}
