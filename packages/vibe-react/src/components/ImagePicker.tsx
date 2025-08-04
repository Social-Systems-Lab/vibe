"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useVibe } from "../index";
import FilePreview from "./FilePreview";
import { FileItem, SelectionMode } from "../lib/types";
import { cn } from "../lib/utils";

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

export function ImagePicker({
    open,
    onOpenChange,
    onSelect,
    accept = "image/*",
    selectionMode = "multiple",
    title = "Choose files",
    allowUpload = true,
}: ImagePickerProps) {
    const { readOnce, upload, presignGet, write, user } = useVibe();
    const [tab, setTab] = useState<TabKey>(allowUpload ? "my-files" : "my-files");
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [selected, setSelected] = useState<Record<string, FileItem>>({});
    const [localUploads, setLocalUploads] = useState<{ id: string; name: string; progress?: number }[]>([]);
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (!open) return;
        let abort = false;
        (async () => {
            setLoading(true);
            try {
                const res = await readOnce<any>("files", {});
                const docs = (res.docs || []) as any[];
                const normalized: FileItem[] = await Promise.all(
                    docs.map(async (d) => {
                        const item: FileItem = {
                            id: d.id || d._id || d.docId || crypto.randomUUID(),
                            name: d.name || d.filename || d.title,
                            mimeType: d.mimeType || d.type,
                            size: d.size,
                            createdAt: d.createdAt || d._createdAt || d.timestamp,
                            acl: d.acl,
                        };
                        if (d.url) {
                            item.url = d.url;
                        } else if (d.storageKey) {
                            try {
                                const signed = await presignGet(d.storageKey, 300);
                                item.url = signed?.url || signed;
                            } catch {}
                            item.storageKey = d.storageKey;
                        }
                        if (d.thumbnailUrl) item.thumbnailUrl = d.thumbnailUrl;
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

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return files;
        return files.filter((f) => (f.name || "").toLowerCase().includes(q));
    }, [files, query]);

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
        const list = e.target.files;
        if (!list || list.length === 0) return;
        await handleUploadFiles(list);
        e.currentTarget.value = "";
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

        for (const f of arr) {
            try {
                // 1) Upload binary to storage
                const { storageKey } = await upload(f as File);

                // 2) Create file metadata document to get a stable id
                const fileDoc = await write("files", {
                    name: f.name,
                    storageKey,
                    mimeType: (f as any).type,
                    size: f.size,
                    // Default ACL mirrors post default; can be changed later via Permission dialog
                    acl: { read: { allow: ["*"] } },
                    owner: { did: user?.did, ref: "profiles/me" },
                });

                const newId = fileDoc?.id || fileDoc?._id || fileDoc?.docId || crypto.randomUUID();

                // 3) Derive a temporary viewing URL
                let url: string | undefined;
                try {
                    const signed = await presignGet(storageKey, 300);
                    url = (signed as any)?.url || (signed as any);
                } catch {}

                const item: FileItem = {
                    id: newId,
                    name: f.name,
                    storageKey,
                    url,
                    mimeType: (f as any).type,
                    size: f.size,
                    createdAt: Date.now(),
                };

                setFiles((prev) => [item, ...prev]);
                setSelected((prev) => (selectionMode === "single" ? { [item.id]: item } : { ...prev, [item.id]: item }));
            } catch (e) {
                console.error("Upload/write file doc failed", e);
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
            <div className={cn("grid gap-3", "grid-cols-3 sm:grid-cols-4")}>
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
            <label className="inline-block">
                <Input type="file" multiple accept={accept} onChange={handleFileInputChange} className="hidden" />
                <Button variant="secondary" type="button">
                    Choose files
                </Button>
            </label>
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
