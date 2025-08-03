"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Document } from "vibe-sdk";
import { useVibe } from "vibe-react";

type FileDoc = {
    _id?: string;
    collection: "files";
    name: string;
    ext?: string;
    mime: string;
    size: number;
    sha256?: string;
    storageKey: string;
    previewKey?: string;
    type?: string;
    tags?: string[];
    collections?: string[];
    createdAt?: string;
    updatedAt?: string;
} & Document;

export default function CollectionsPage() {
    return <CollectionsInner />;
}

function CollectionsInner() {
    // Consume the stable context API from vibe-react, mirroring vibe-feeds usage
    const { readOnce, isLoggedIn, user, write, upload, presignGet } = useVibe();
    const [files, setFiles] = useState<FileDoc[]>([]);
    const [q, setQ] = useState("");
    const [type, setType] = useState<string>("");

    // Global drag overlay
    const [dragActive, setDragActive] = useState(false);
    const dragCounter = useRef(0);

    // No manual subscriptions; rely on vibe context state

    const refresh = useCallback(async () => {
        if (!isLoggedIn || !user) return;
        const res = await readOnce("files");

        console.log("Files fetched:", res);

        setFiles((res?.docs ?? []) as FileDoc[]);
    }, [isLoggedIn, user, q, type, readOnce]);

    useEffect(() => {
        if (!isLoggedIn || !user) {
            setFiles([]);
            return;
        }
        refresh();
    }, [isLoggedIn, user, q, type, refresh]);

    // Window-level DnD to show overlay and accept drop anywhere
    useEffect(() => {
        const onDragEnter = (e: DragEvent) => {
            e.preventDefault();
            dragCounter.current += 1;
            setDragActive(true);
        };
        const onDragOver = (e: DragEvent) => {
            e.preventDefault();
        };
        const onDragLeave = (e: DragEvent) => {
            e.preventDefault();
            dragCounter.current = Math.max(0, dragCounter.current - 1);
            if (dragCounter.current === 0) setDragActive(false);
        };
        const onDrop = async (e: DragEvent) => {
            e.preventDefault();
            dragCounter.current = 0;
            setDragActive(false);
            if (!e.dataTransfer?.files?.length) return;
            const files = Array.from(e.dataTransfer.files);
            await handleFilesUpload(files);
        };
        window.addEventListener("dragenter", onDragEnter);
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("dragleave", onDragLeave);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragenter", onDragEnter);
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("dragleave", onDragLeave);
            window.removeEventListener("drop", onDrop);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn, user]);

    // No unauthenticated branch; layout ensures this page is only shown when signed in

    // Removed unauthenticated UI per routing guard

    const handleFilesUpload = useCallback(
        async (list: File[]) => {
            for (const file of list) {
                const { storageKey } = await upload(file);
                const now = new Date().toISOString();
                const doc: FileDoc = {
                    _id: `files/${crypto.randomUUID()}`,
                    collection: "files",
                    name: file.name,
                    ext: extFromName(file.name),
                    mime: file.type || "application/octet-stream",
                    size: file.size,
                    storageKey,
                    type: inferType(file.type || ""),
                    tags: [],
                    collections: [],
                    createdAt: now,
                    updatedAt: now,
                };
                await write("files", doc);
            }
            await refresh();
        },
        [upload, write, refresh]
    );

    return (
        <div className="min-h-screen flex">
            <LeftSidebar onFilesSelected={handleFilesUpload} />
            <div className="flex-1 flex flex-col">
                <Header q={q} setQ={setQ} type={type} setType={setType} onRefresh={refresh} />
                <main className="flex-1 p-4">
                    <DragDropUploader
                        onUploaded={async () => {
                            await refresh();
                        }}
                        onFilesSelected={handleFilesUpload}
                    />
                    <FilesGrid files={files} presignGet={presignGet} />
                </main>
            </div>

            {dragActive && (
                <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
                    <div className="absolute inset-0 bg-blue-600/10 ring-2 ring-blue-500" />
                    <div className="relative z-50 rounded-full bg-blue-600 text-white px-6 py-3 shadow-lg border border-blue-500">Drop files to upload</div>
                </div>
            )}
        </div>
    );
}

function Header({
    q,
    setQ,
    type,
    setType,
    onRefresh,
}: {
    q: string;
    setQ: (v: string) => void;
    type: string;
    setType: (v: string) => void;
    onRefresh: () => void;
}) {
    return (
        <div className="border-b p-4 flex items-center gap-3">
            <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or tag"
                className="border rounded-full px-4 py-2 text-sm w-96 bg-neutral-100"
            />
            <select value={type} onChange={(e) => setType(e.target.value)} className="border rounded px-2 py-1 text-sm">
                <option value="">All types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="doc">Documents</option>
                <option value="audio">Audio</option>
                <option value="other">Other</option>
            </select>
            <button onClick={onRefresh} className="px-3 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-sm">
                Refresh
            </button>
        </div>
    );
}

function inferType(mime: string): string {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.includes("pdf") || mime.includes("word") || mime.includes("excel") || mime.includes("text")) return "doc";
    return "other";
}

function extFromName(name: string): string | undefined {
    const i = name.lastIndexOf(".");
    if (i <= 0) return undefined;
    return name.slice(i + 1).toLowerCase();
}

function humanSize(bytes: number) {
    if (!bytes && bytes !== 0) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = bytes;
    let idx = 0;
    while (v >= 1024 && idx < units.length - 1) {
        v /= 1024;
        idx++;
    }
    return `${v.toFixed(1)} ${units[idx]}`;
}

function DragDropUploader({ onUploaded, onFilesSelected }: { onUploaded: () => void; onFilesSelected: (files: File[]) => Promise<void> }) {
    const [busy, setBusy] = useState(false);

    const onFiles = useCallback(
        async (fileList: FileList | null) => {
            if (!fileList || fileList.length === 0) return;
            setBusy(true);
            try {
                await onFilesSelected(Array.from(fileList));
                onUploaded();
            } catch (e) {
                console.error("Upload failed:", e);
                alert("Upload failed");
            } finally {
                setBusy(false);
            }
        },
        [onFilesSelected, onUploaded]
    );

    const onDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            onFiles(e.dataTransfer.files);
        },
        [onFiles]
    );

    return (
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="border-2 border-dashed rounded p-6 mb-4 text-center">
            <p className="text-sm text-neutral-600 mb-2">Drag & drop files here, or pick</p>
            <input type="file" multiple onChange={(e) => onFiles(e.target.files)} disabled={busy} className="block mx-auto" />
            {busy && <p className="text-xs text-neutral-500 mt-2">Uploading…</p>}
        </div>
    );
}

function LeftSidebar({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const imageAspectRatio = 717 / 161;
    const height = 42;
    const width = Math.round(height * imageAspectRatio);

    return (
        <aside className="w-86 p-6 space-y-4 h-screen">
            <div className="mr-auto flex items-center gap-2">
                <Image src="/images/logotype.png" alt="Collections" height={height} width={width} />
            </div>
            <button
                className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 transition"
                onClick={() => inputRef.current?.click()}
            >
                Upload
            </button>
            <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) onFilesSelected(files);
                    e.currentTarget.value = "";
                }}
            />
            <div className="text-sm text-neutral-600">Storage</div>
            <UsageBar usedBytes={0} quotaBytes={100 * 1024 * 1024 * 1024} />
        </aside>
    );
}

function UsageBar({ usedBytes, quotaBytes }: { usedBytes: number; quotaBytes: number }) {
    const ratio = Math.min(1, usedBytes / (quotaBytes || 1));
    const pct = Math.round(ratio * 100);
    const fmt = (n: number) => humanSize(n);
    return (
        <div className="mb-4">
            <div className="flex justify-between text-xs text-neutral-600 mb-1">
                <span>Storage</span>
                <span>
                    {fmt(usedBytes)} / {fmt(quotaBytes)} ({pct}%)
                </span>
            </div>
            <div className="h-2 bg-neutral-200 rounded">
                <div className="h-2 bg-blue-600 rounded" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

const presignCache = new Map<string, string>();

function FilesGrid({ files, presignGet }: { files: FileDoc[]; presignGet: (key: string, expires?: number) => Promise<any> }) {
    if (!files?.length) {
        return <div className="text-sm text-neutral-500">No files yet.</div>;
    }
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {files.map((f) => (
                <FileCard key={f._id} file={f} presignGet={presignGet} />
            ))}
        </div>
    );
}

function FileCard({ file, presignGet }: { file: FileDoc; presignGet: (key: string, expires?: number) => Promise<any> }) {
    const [imgUrl, setImgUrl] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (file.mime?.startsWith("image/") && file.storageKey) {
                if (presignCache.has(file.storageKey)) {
                    if (mounted) setImgUrl(presignCache.get(file.storageKey)!);
                    return;
                }
                const res = await presignGet(file.storageKey, 300);
                if (res?.strategy === "presigned" && res.url) {
                    presignCache.set(file.storageKey, res.url);
                    if (mounted) setImgUrl(res.url);
                }
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, [file, presignGet]);

    return (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
            <div className="relative h-28 bg-neutral-100">
                {imgUrl ? (
                    <Image src={imgUrl} alt={file.name} fill sizes="200px" className="object-cover" />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-neutral-400 text-sm">No preview</div>
                )}
            </div>
            <div className="p-2">
                <div className="text-xs text-neutral-500">{file.type?.toUpperCase()}</div>
                <div className="font-medium truncate" title={file.name}>
                    {file.name}
                </div>
                <div className="text-xs text-neutral-500">{humanSize(file.size)}</div>
            </div>
        </div>
    );
}
