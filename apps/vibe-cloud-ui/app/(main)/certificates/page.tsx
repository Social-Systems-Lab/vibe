"use client";

import { useEffect, useMemo, useState } from "react";
import { appManifest } from "../../lib/manifest";
import { Button, DataTable, type ColumnDef, Input } from "vibe-react";
import { Search, LayoutGrid, List } from "lucide-react";
import CertificateDesigner from "./designer";

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
    const tabs = ["Issued to Me", "Issued by Me", "My Certificate Types"] as const;
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

    // Create type form
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createLabel, setCreateLabel] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [creating, setCreating] = useState(false);

    // Global UI
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({}); // revoke button spinners
    const [query, setQuery] = useState("");
    const [view, setView] = useState<"table" | "grid">("table");
    const [designerOpen, setDesignerOpen] = useState(false);

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

    const createCertType = async () => {
        if (!authHeaders || !myDid) return;
        if (!createName || !createLabel) {
            setError("Name and Label are required");
            return;
        }
        setCreating(true);
        setError(null);
        try {
            const body = {
                name: createName.trim(),
                label: createLabel.trim(),
                description: createDescription.trim(),
            };
            const res = await fetch(`${apiBase}/certs/types/create`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Failed to create certificate type (${res.status})`);
            }
            // Reset form
            setCreateName("");
            setCreateLabel("");
            setCreateDescription("");
            setCreateOpen(false);
            // Refresh my types
            await loadMyTypes();
        } catch (e: any) {
            setError(e?.message || "Failed to create certificate type");
        } finally {
            setCreating(false);
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

    const filteredIssuedToMe = useMemo(() => {
        const base = issuedToMe || [];
        const q = query.trim().toLowerCase();
        return base.filter((c) => {
            const matchQ =
                !q ||
                c.type?.toLowerCase().includes(q) ||
                c.issuer?.toLowerCase().includes(q) ||
                c.certType?.ref?.toLowerCase().includes(q);
            return matchQ;
        });
    }, [issuedToMe, query]);

    const filteredIssuedByMe = useMemo(() => {
        const base = issuedByMe || [];
        const q = query.trim().toLowerCase();
        return base.filter((c) => {
            const matchQ =
                !q ||
                c.type?.toLowerCase().includes(q) ||
                c.subject?.toLowerCase().includes(q) ||
                c.certType?.ref?.toLowerCase().includes(q);
            return matchQ;
        });
    }, [issuedByMe, query]);

    const filteredMyTypes = useMemo(() => {
        const base = myTypes || [];
        const q = query.trim().toLowerCase();
        return base.filter((t) => {
            const matchQ =
                !q ||
                t.name?.toLowerCase().includes(q) ||
                t.label?.toLowerCase().includes(q) ||
                t.owner?.toLowerCase().includes(q);
            return matchQ;
        });
    }, [myTypes, query]);

    const columnsIssuedToMe: ColumnDef<CertDoc>[] = [
        {
            accessorKey: "id",
            header: "ID",
            cell: ({ row }) => <code className="text-xs">{row.original._id || row.original.id || "-"}</code>,
        },
        {
            accessorKey: "type",
            header: "Type",
            cell: ({ row }) => row.original.type || "-",
        },
        {
            accessorKey: "issuer",
            header: "Issuer",
            cell: ({ row }) => <code className="text-xs">{row.original.issuer || "-"}</code>,
        },
        {
            accessorKey: "ref",
            header: "Ref",
            cell: ({ row }) => <code className="text-xs">{row.original.certType?.ref || "-"}</code>,
        },
        {
            accessorKey: "expires",
            header: "Expires",
            cell: ({ row }) => formatDate(row.original.expires),
        },
        {
            accessorKey: "signature",
            header: "Signature",
            cell: ({ row }) => <code className="text-xs">{mask(row.original.signature)}</code>,
        },
        {
            id: "actions",
            header: "Actions",
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void copy(row.original.signature)}
                        disabled={!row.original.signature}
                    >
                        Copy signature
                    </Button>
                </div>
            ),
        },
    ];

    const columnsIssuedByMe: ColumnDef<CertDoc>[] = [
        {
            accessorKey: "id",
            header: "ID",
            cell: ({ row }) => <code className="text-xs">{row.original._id || row.original.id || "-"}</code>,
        },
        {
            accessorKey: "type",
            header: "Type",
            cell: ({ row }) => row.original.type || "-",
        },
        {
            accessorKey: "subject",
            header: "Subject",
            cell: ({ row }) => <code className="text-xs">{row.original.subject || "-"}</code>,
        },
        {
            accessorKey: "ref",
            header: "Ref",
            cell: ({ row }) => <code className="text-xs">{row.original.certType?.ref || "-"}</code>,
        },
        {
            accessorKey: "expires",
            header: "Expires",
            cell: ({ row }) => formatDate(row.original.expires),
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => {
                const revoked = isRevoked(row.original);
                return revoked ? (
                    <span className="inline-flex items-center rounded border border-red-300 bg-red-50 text-red-800 px-2 py-0.5 text-xs">
                        Revoked
                    </span>
                ) : (
                    <span className="inline-flex items-center rounded border border-emerald-300 bg-emerald-50 text-emerald-800 px-2 py-0.5 text-xs">
                        Active
                    </span>
                );
            },
        },
        {
            id: "actions",
            header: "Actions",
            cell: ({ row }) => {
                const id = row.original._id || row.original.id || "";
                const revoked = isRevoked(row.original);
                return (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void copy(row.original.signature)}
                            disabled={!row.original.signature}
                        >
                            Copy signature
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void revokeCert(id)}
                            disabled={!id || revoked || !!busyIds[id]}
                        >
                            {busyIds[id] ? "Revoking…" : "Revoke"}
                        </Button>
                    </div>
                );
            },
        },
    ];

    const columnsMyTypes: ColumnDef<CertTypeDoc>[] = [
        {
            accessorKey: "badge",
            header: "Badge",
            cell: () => <div></div>,
        },
        {
            accessorKey: "name",
            header: "Name",
            cell: ({ row }) => row.original.name || row.original.label || "-",
        },
        {
            accessorKey: "createdAt",
            header: "Created",
            cell: ({ row }) => formatDate(row.original.createdAt),
        },
        {
            id: "actions",
            header: "Actions",
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDesignerOpen(true)}>
                        Design
                    </Button>
                </div>
            ),
        },
    ];

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

                {/* Toolbar */}
                <div className="mb-3 flex flex-col gap-2 sm:flex-row items-center sm:justify-between">
                    <div className="relative w-full sm:w-80 flex flex-row gap-2">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-foreground/50" />
                        <Input
                            placeholder="Search..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="pl-8 shrink-0"
                        />
                    </div>
                    <div className="inline-flex rounded-md border border-border overflow-hidden">
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Grid view"
                            className={
                                view === "grid"
                                    ? "bg-violet-600 text-white border-transparent hover:bg-violet-600/90 rounded-none rounded-l-lg"
                                    : "rounded-none rounded-l-lg border-border"
                            }
                            onClick={() => setView("grid")}
                        >
                            <LayoutGrid className="size-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Table view"
                            className={
                                view === "table"
                                    ? "bg-violet-600 text-white border-transparent hover:bg-violet-600/90 rounded-none rounded-r-lg"
                                    : "rounded-none rounded-r-lg border-border"
                            }
                            onClick={() => setView("table")}
                        >
                            <List className="size-4" />
                        </Button>
                    </div>
                </div>

                {/* Tabs content */}
                {activeTab === "Issued to Me" && (
                    <DataTable columns={columnsIssuedToMe} data={filteredIssuedToMe} pageSize={10} />
                )}

                {activeTab === "Issued by Me" && (
                    <DataTable columns={columnsIssuedByMe} data={filteredIssuedByMe} pageSize={10} />
                )}

                {activeTab === "My Certificate Types" && (
                    <div>
                        <div className="flex items-center justify-end mb-2">
                            <Button onClick={() => setCreateOpen(true)}>Create Type</Button>
                        </div>
                        {createOpen && (
                            <div className="rounded-lg border border-border/60 bg-background/40 p-3 mb-4">
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="flex flex-col">
                                        <label className="text-xs text-foreground/60 mb-1">Name</label>
                                        <input
                                            value={createName}
                                            onChange={(e) => setCreateName(e.target.value)}
                                            placeholder="e.g. friend-of"
                                            className="border rounded-md px-2 py-1.5 bg-background"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-xs text-foreground/60 mb-1">Label</label>
                                        <input
                                            value={createLabel}
                                            onChange={(e) => setCreateLabel(e.target.value)}
                                            placeholder="e.g. Friend Of"
                                            className="border rounded-md px-2 py-1.5 bg-background"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-xs text-foreground/60 mb-1">Description</label>
                                        <input
                                            value={createDescription}
                                            onChange={(e) => setCreateDescription(e.target.value)}
                                            placeholder="e.g. A friend of the user"
                                            className="border rounded-md px-2 py-1.5 bg-background"
                                        />
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        onClick={() => void createCertType()}
                                        disabled={creating || !createName || !createLabel}
                                        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                    >
                                        {creating ? "Creating…" : "Create"}
                                    </button>
                                    <button
                                        onClick={() => setCreateOpen(false)}
                                        className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-accent/20"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                        {view === "table" ? (
                            <DataTable columns={columnsMyTypes} data={filteredMyTypes} pageSize={10} />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {filteredMyTypes.map((t) => (
                                    <div
                                        key={t._id || t.id}
                                        className="border rounded-lg overflow-hidden bg-background shadow-sm hover:shadow-md transition-shadow"
                                    >
                                        <div className="relative h-28 bg-accent/10"></div>
                                        <div className="p-2">
                                            <div className="font-medium truncate" title={t.name || ""}>
                                                {t.name || "-"}
                                            </div>
                                            <div className="text-xs text-foreground/60">{formatDate(t.createdAt)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {designerOpen && (
                    <CertificateDesigner
                        onClose={() => setDesignerOpen(false)}
                        onSave={(template) => {
                            console.log("save", template);
                            setDesignerOpen(false);
                        }}
                    />
                )}
            </section>
        </main>
    );
}
