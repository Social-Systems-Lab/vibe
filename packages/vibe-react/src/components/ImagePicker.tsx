"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useVibe } from "../index";
import FilePreview from "./FilePreview";
import { FileItem, SelectionMode } from "../lib/types";
import { cn } from "../lib/utils";
import { getStreamUrl } from "../lib/storage";

type TabKey = "my-files" | "upload";

export interface ImagePickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (files: FileItem[]) => void;
    accept?: string;
    selectionMode?: SelectionMode;
    title?: string;
    allowUpload?: boolean;
}

export type { FileItem } from "../lib/types";

export function ImagePicker({ open, onOpenChange, onSelect, accept = "image/*", selectionMode = "multiple", title = "Choose files", allowUpload = true }: ImagePickerProps) {
    const { readOnce, upload, presignGet, user, apiBase } = useVibe();
    const [tab, setTab] = useState<TabKey>(allowUpload ? "my-files" : "my-files");
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [selected, setSelected] = useState<Record<string, FileItem>>({});
    const [localUploads, setLocalUploads] = useState<{ id: string; name: string; progress?: number }[]>([]);
    const [query, setQuery] = useState("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!open) return;
        let abort = false;
        (async () => {
            setLoading(true);
            try {
                const res = await readOnce<any>("files", { limit: 2000, selector: {} });
                console.debug("ImagePicker: readOnce(files) response", res);
                // Support multiple backend shapes: docs, items, results, rows, data.docs, arrays, etc.
                const candidates = [
                    (res as any)?.docs,
                    (res as any)?.items,
                    (res as any)?.results,
                    (res as any)?.data?.docs,
                    (res as any)?.data?.items,
                    Array.isArray(res) ? res : undefined,
                    (res as any)?.rows ? (res as any).rows.map((r: any) => r.doc || r.value || r) : undefined,
                ].filter(Boolean);
                let docs = (candidates[0] || []) as any[];
                console.debug("ImagePicker: docs length", Array.isArray(docs) ? docs.length : -1);
                // If hub DB_QUERY returns 0 docs (e.g., permission not granted), fall back to REST (like Storage page)
                if (Array.isArray(docs) && docs.length === 0 && apiBase) {
                    try {
                        console.debug("ImagePicker: REST fallback via /hub/api-token + /data/types/files/query");
                        const tokRes = await fetch(`${apiBase}/hub/api-token`, { credentials: "include" });
                        if (tokRes.ok) {
                            const tokData = await tokRes.json().catch(() => ({} as any));
                            const bearer: string | undefined = (tokData as any)?.token;
                            if (bearer) {
                                const listRes = await fetch(`${apiBase}/data/types/files/query`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${bearer}`,
                                    },
                                    body: JSON.stringify({}),
                                });
                                if (listRes.ok) {
                                    const listData = await listRes.json().catch(() => ({} as any));
                                    const restDocs = Array.isArray((listData as any)?.docs)
                                        ? (listData as any).docs
                                        : Array.isArray(listData)
                                        ? (listData as any)
                                        : [];
                                    console.debug("ImagePicker: REST fallback docs length", restDocs.length);
                                    if (restDocs.length > 0) {
                                        docs = restDocs as any[];
                                    }
                                } else {
                                    console.debug("ImagePicker: REST files query failed", listRes.status);
                                }
                            } else {
                                console.debug("ImagePicker: No hub API token available");
                            }
                        } else {
                            console.debug("ImagePicker: hub/api-token failed", tokRes.status);
                        }
                    } catch (err) {
                        console.debug("ImagePicker: REST fallback failed", err);
                    }
                }
                        const normalized: FileItem[] = await Promise.all(
                            docs.map(async (d) => {
                                const id =
                                    d.id ||
                                    d._id ||
                                    d.docId ||
                                    (d._id && typeof d._id === "object" && ((d._id as any).$id || (d._id as any).id)) ||
                                    crypto.randomUUID();
                                const name = d.name || d.filename || d.title || (d as any).fileName;
                                const mimeType = d.mimeType || d.type || (d as any).contentType;
                                const size = d.size || (d as any).length || (d as any).bytes;
                                const createdAt = d.createdAt || (d as any)._createdAt || (d as any).timestamp || (d as any).created || (d as any)._ts;
                                const item: FileItem = {
                                    id,
                                    name,
                                    mimeType,
                                    size,
                                    createdAt,
                                    acl: (d as any).acl,
                                };
                                const storageKey = (d as any).storageKey || (d as any).key;
                                if (storageKey) {
                                    (item as any).storageKey = storageKey;
                                    // Prefer first-party stream URL for previews
                                    item.url = getStreamUrl(apiBase, storageKey);
                                } else if ((d as any).url) {
                                    item.url = (d as any).url;
                                }
                                if ((d as any).thumbnailUrl || (d as any).thumbnail) item.thumbnailUrl = (d as any).thumbnailUrl || (d as any).thumbnail;
                                return item;
                            })
                        );
                if (!abort) setFiles(normalized);
            } catch (e) {
                console.error("ImagePicker: failed to list files", e);
            } finally {
                if (!abort) setLoading(false);
            }
        })();
        return () => {
            abort = true;
        };
    }, [open, readOnce, presignGet]);

    function matchesAccept(f: FileItem, accept?: string) {
        if (!accept || accept === "*/*") return true;
        const mt = (f.mimeType || "").toLowerCase();
        const name = (f.name || "").toLowerCase();
        const exts = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg", ".avif"];
        const tokens = accept.split(",").map((s) => s.trim().toLowerCase());
        const byMime = tokens.some((t) => {
            if (t.endsWith("/*")) {
                const prefix = t.slice(0, t.length - 1); // keep slash
                return mt.startsWith(prefix);
            }
            return mt === t;
        });
        const byExt = exts.some((ext) => name.endsWith(ext));
        if (tokens.some((t) => t.startsWith("image/"))) {
            return byMime || byExt;
        }
        return byMime || byExt;
    }

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const base = files.filter((f) => matchesAccept(f, accept));
        if (!q) return base;
        return base.filter((f) => (f.name || "").toLowerCase().includes(q));
    }, [files, query, accept]);

    function toggleSelect(file: FileItem) {
        setSelected((prev) => {
            if (selectionMode === "single") {
                return { [file.id]: file };
            }
            const next = { ...prev };
            if (next[file.id]) delete next[file.id];
            else next[file.id] = file;
            return next;
        });
    }

    function handleConfirm() {
        const out = Object.values(selected);
        onSelect(out);
        onOpenChange(false);
        setSelected({});
    }

    async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        // Capture the input element before awaiting to avoid pooled event target becoming null
        const input = e.currentTarget;
        const list = input?.files;
        if (!list || list.length === 0) return;
        await handleUploadFiles(list);
        try {
            if (input) input.value = "";
        } catch (err) {
            console.debug("ImagePicker: failed to reset input value", err);
        }
    }

    async function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        await handleUploadFiles(e.dataTransfer.files);
    }

    function preventDefaults(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
    }

    async function handleUploadFiles(fileList: FileList) {
        const arr = Array.from(fileList);
        const pending = arr.map((f) => ({ id: crypto.randomUUID(), name: f.name }));
        setLocalUploads((u) => [...u, ...pending]);
        let switched = false;

        for (const f of arr) {
            try {
                // 1) Upload binary to storage (server may directly create file doc or require commit; SDK handles both)
                const up = (await upload(f as File)) as { storageKey: string; file?: { id?: string; name?: string; mimeType?: string; size?: number } };
                const storageKey = up.storageKey;

                // 2) Derive a stable preview URL (first-party stream)
                const url: string | undefined = getStreamUrl(apiBase, storageKey);

                const created = up.file;
                const item: FileItem = {
                    id: created?.id || crypto.randomUUID(),
                    name: created?.name || f.name,
                    storageKey,
                    url,
                    mimeType: created?.mimeType || (f as any).type,
                    size: created?.size ?? f.size,
                    createdAt: Date.now(),
                };

                setFiles((prev) => [item, ...prev]);
                setSelected((prev) => (selectionMode === "single" ? { [item.id]: item } : { ...prev, [item.id]: item }));
                if (selectionMode === "single" && !switched) {
                    setTab("my-files");
                    switched = true;
                }
            } catch (e) {
                console.error("Upload failed", e);
            } finally {
                setLocalUploads((u) => u.filter((p) => !pending.find((x) => x.id === p.id)));
            }
        }
    }

    const tabBtns = (
        <div className="flex gap-2">
            <Button variant={tab === "my-files" ? "default" : "outline"} onClick={() => setTab("my-files")} size="sm">
                My files
            </Button>
            {allowUpload && (
                <Button variant={tab === "upload" ? "default" : "outline"} onClick={() => setTab("upload")} size="sm">
                    Upload
                </Button>
            )}
        </div>
    );

    const myFilesView = (
        <div className="space-y-3">
            <Input placeholder="Search files..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className={cn("grid gap-3", "grid-cols-3")}>
                {loading && <div className="text-sm text-muted-foreground col-span-full">Loading...</div>}
                {!loading && filtered.length === 0 && <div className="text-sm text-muted-foreground col-span-full">No files found</div>}
                {filtered.map((f) => (
                    <FilePreview key={f.id} file={f} size="md" variant="grid" selected={!!selected[f.id]} onClick={() => toggleSelect(f)} />
                ))}
            </div>
        </div>
    );

    const uploadView = (
        <div
            className="rounded-md border border-dashed p-6 text-center"
            onDrop={handleDrop}
            onDragOver={preventDefaults}
            onDragEnter={preventDefaults}
            onDragLeave={preventDefaults}
        >
            <p className="mb-3 text-sm text-muted-foreground">Drag and drop files here, or click to select</p>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={accept}
                onChange={handleFileInputChange}
                className="hidden"
            />
            <Button variant="secondary" type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                Choose files
            </Button>
            {localUploads.length > 0 && <div className="mt-4 text-xs text-muted-foreground">{localUploads.length} file(s) uploading...</div>}
        </div>
    );

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                onOpenChange(v);
                if (!v) setSelected({});
            }}
        >
            <DialogContent className="max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="flex items-center justify-between mb-3">
                    {tabBtns}
                    <div className="text-xs text-muted-foreground">{selectionMode === "multiple" ? "Multi-select enabled" : "Single select"}</div>
                </div>
                {tab === "my-files" ? myFilesView : uploadView}
                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={Object.keys(selected).length === 0}>
                        Select
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default ImagePicker;
