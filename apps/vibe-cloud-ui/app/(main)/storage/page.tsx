"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";
import { DataTable } from "vibe-react";
import type { ColumnDef } from "vibe-react";
import { UploadArea } from "vibe-react";

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
  const [usage, setUsage] = useState<{
    used_bytes: number;
    reserved_bytes: number;
    limit_bytes: number;
    burst_bytes: number;
    percent: number;
    tier?: string;
  } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

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

  const formatBytes = (n?: number) => {
    if (typeof n !== "number") return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let val = n;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const loadUsage = async () => {
    if (!token) {
      setError("No API token. Ensure you are signed in.");
      return;
    }
    setUsageLoading(true);
    try {
      const res = await fetch(`${apiBase}/storage/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data?.error || `Failed to load usage (${res.status})`);
      }
      const data = await res.json();
      setUsage(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load usage");
      setUsage(null);
    } finally {
      setUsageLoading(false);
    }
  };

  const loadFiles = async () => {
    if (!token) {
      setError("No API token. Ensure you are signed in.");
      return;
    }
    setError(null);
    try {
      // Read from files namespace (read-only)
      const res = await fetch(`${apiBase}/data/types/files/query`, {
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
      const docs = Array.isArray(data?.docs) ? (data.docs as FileDoc[]) : [];
      docs.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
      setFiles(docs);
    } catch (e: any) {
      setError(e?.message || "Failed to list files");
      setFiles(null);
    }
  };

  // Auto-load usage when token becomes available
  useEffect(() => {
    if (token) {
      void loadUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-load files when token becomes available
  useEffect(() => {
    if (token) {
      void loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  const deleteFile = async (storageKey?: string) => {
    if (!token || !storageKey) return;
    try {
      const ok = window.confirm("Delete this file? This cannot be undone.");
      if (!ok) return;
      const res = await fetch(`${apiBase}/storage/object`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storageKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data?.error || `Failed to delete file (${res.status})`);
      }
      await loadFiles();
      await loadUsage();
    } catch (e: any) {
      setError(e?.message || "Failed to delete file");
    }
  };

  const columns: ColumnDef<FileDoc>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => row.original.name || "-",
    },
    {
      accessorKey: "mimeType",
      header: "Type",
      cell: ({ row }) => row.original.mimeType || "-",
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }) =>
        typeof row.original.size === "number" ? `${formatBytes(row.original.size)}` : "-",
    },
    {
      accessorKey: "storageKey",
      header: "Key",
      cell: ({ row }) => <code className="text-xs">{row.original.storageKey || "-"}</code>,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => presignGet(row.original.storageKey)}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
          >
            Preview/Download
          </button>
          <button
            onClick={() => deleteFile(row.original.storageKey)}
            className="inline-flex items-center rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 transition"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <main className="w-full">
      <section className="max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-heading">Storage</h1>
          <div className="text-xs text-foreground/60">Usage and files</div>
        </div>

        {/* Usage bar */}
        <div className="rounded-lg border border-border/60 bg-background/60 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Usage</div>
            <div className="text-xs text-foreground/60">
              {usageLoading && "Loading…"}
              {!usageLoading && usage && (
                <>
                  {formatBytes(usage.used_bytes)} used of {formatBytes(usage.limit_bytes)}
                  {usage.reserved_bytes ? ` (+${formatBytes(usage.reserved_bytes)} reserved)` : ""}{" "}
                  {usage.tier ? `• ${usage.tier}` : ""}
                </>
              )}
              {!usageLoading && !usage && "—"}
            </div>
          </div>
          <div className="w-full h-3 rounded bg-border/60 overflow-hidden">
            <div
              className="h-3 bg-primary transition-all"
              style={{ width: `${Math.min(100, usage?.percent ?? 0)}%` }}
            />
          </div>
          {!token && (
            <div className="mt-2 text-xs text-foreground/60">Waiting for API token…</div>
          )}
        </div>

        {token && (
          <div className="mb-4">
            <UploadArea
              token={token}
              apiBase={apiBase}
              onUploaded={async () => {
                await loadFiles();
                await loadUsage();
              }}
            />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur">
          {files === null && (
            <div className="text-sm text-foreground/60">No files loaded yet.</div>
          )}
          {files !== null && (
            <DataTable columns={columns} data={files} pageSize={10} />
          )}
        </div>
      </section>
    </main>
  );
}
