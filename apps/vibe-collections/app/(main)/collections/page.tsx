"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Document } from "vibe-sdk";
import { ProfileMenu, useVibe } from "vibe-react";
import { Home } from "lucide-react";

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
        <div className="flex bg-white">
            <div className="flex-1 flex flex-col">
                <TopBar />
                <div className="flex flex-1">
                    <LeftSidebar onFilesSelected={handleFilesUpload} />
                    <div className="flex-1 flex flex-col">
                        {/* <Header q={q} setQ={setQ} type={type} setType={setType} onRefresh={refresh} /> */}
                        <main className="flex-1 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-lg font-semibold">All files</h2>
                                {/* Filter/Sort placeholders to sit above list */}
                                {/* <div className="flex items-center gap-2 text-sm text-neutral-600">
                                    <button className="px-3 py-1.5 rounded-full border bg-white hover:bg-neutral-50">Filter</button>
                                    <button className="px-3 py-1.5 rounded-full border bg-white hover:bg-neutral-50">Sort</button>
                                </div> */}
                            </div>
                            <FilesArea presignGet={presignGet} files={files} />
                        </main>
                    </div>
                </div>
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

function SearchInTopBar() {
    const [qLocal, setQLocal] = useState("");
    // fire a custom event so CollectionsInner/Header can listen if needed later
    useEffect(() => {
        const id = setTimeout(() => {
            window.dispatchEvent(new CustomEvent("collections:search", { detail: { q: qLocal } }));
        }, 200);
        return () => clearTimeout(id);
    }, [qLocal]);
    return (
        <input
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            placeholder="Search by name or tag"
            className="w-full max-w-xl h-12 rounded-full bg-neutral-100 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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
    const [view, setView] = useState<"grid" | "list">("grid");
    return (
        <div className="px-4 py-3 flex items-center gap-3">
            <div className="ml-auto flex items-center gap-2">
                <div className="inline-flex rounded-lg border overflow-hidden">
                    <button
                        className={`px-3 py-2 text-sm ${view === "grid" ? "bg-neutral-100" : "bg-white hover:bg-neutral-50"}`}
                        onClick={() => setView("grid")}
                        aria-label="Grid view"
                        title="Grid view"
                    >
                        ⬚
                    </button>
                    <button
                        className={`px-3 py-2 text-sm ${view === "list" ? "bg-neutral-100" : "bg-white hover:bg-neutral-50"}`}
                        onClick={() => setView("list")}
                        aria-label="List view"
                        title="List view"
                    >
                        ≡
                    </button>
                </div>
                <button onClick={onRefresh} className="px-3 py-2 rounded bg-neutral-100 hover:bg-neutral-200 text-sm">
                    Refresh
                </button>
            </div>
        </div>
    );
}

function TopBar() {
    const imageAspectRatio = 717 / 161;
    const height = 42;
    const width = Math.round(height * imageAspectRatio);
    return (
        <header className="h-20 flex items-center">
            <div className="flex items-center gap-2 pl-2 w-80">
                <Image src="/images/logotype.png" alt="Collections" height={height} width={width} className="ml-4" />
            </div>
            {/* Search belongs in the top bar, aligned with main content by same horizontal padding */}
            <div className="flex-1 pl-4">
                <SearchInTopBar />
            </div>
            <div className="ml-auto pr-4">
                <ProfileMenu />
            </div>
        </header>
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
    // Component retained for input handling if we want inline picker later, but not rendered in UI.
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

    return null;
}

function LeftSidebar({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <aside className="flex w-80 h-[calc(100vh-80px)] sticky top-[80px] flex-col">
            <div className="p-6">
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
            </div>

            <nav className="px-6">
                <ul className="space-y-1">
                    <li className="h-12 flex flex-row px-3 py-2 rounded-md bg-neutral-100 font-medium text-neutral-900 items-center gap-2">
                        <Home className="h-5 w-5" />
                        <p>All</p>
                    </li>
                    {/* Future: collections list items go here */}
                </ul>
            </nav>

            <div className="mt-auto p-6">
                <UsageBar usedBytes={0.75 * 1024 * 1024 * 1024} quotaBytes={5 * 1024 * 1024 * 1024} />
            </div>
        </aside>
    );
}

function UsageBar({ usedBytes, quotaBytes }: { usedBytes: number; quotaBytes: number }) {
    const ratio = Math.min(1, usedBytes / (quotaBytes || 1));
    const pct = Math.round(ratio * 100.0);
    const fmt = (n: number) => humanSize(n);
    return (
        <div className="space-y-2">
            <div className="flex text-[16px] font-bold text-neutral-600">
                <span>Storage</span>
            </div>
            <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-center text-[16px] text-neutral-500">
                {fmt(usedBytes)} of {fmt(quotaBytes)} used
            </div>
        </div>
    );
}

const presignCache = new Map<string, string>();

function FilesArea({ files, presignGet }: { files: FileDoc[]; presignGet: (key: string, expires?: number) => Promise<any> }) {
    const [view, setView] = useState<"grid" | "list">("grid");

    // View is controlled by Header via CSS variable hack or global state in future; for now allow keyboard toggle
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === "g") setView("grid");
            if (e.key.toLowerCase() === "l") setView("list");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    if (!files?.length) {
        return <div className="text-sm text-neutral-500">No files yet.</div>;
    }

    if (view === "list") {
        return (
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-neutral-500">
                        <th className="py-2 px-2">Name</th>
                        <th className="py-2 px-2">Type</th>
                        <th className="py-2 px-2">Size</th>
                        <th className="py-2 px-2">Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {files.map((f) => (
                        <tr key={f._id} className="border-t hover:bg-neutral-50">
                            <td className="py-2 px-2">{f.name}</td>
                            <td className="py-2 px-2 uppercase text-neutral-500">{f.type}</td>
                            <td className="py-2 px-2">{humanSize(f.size)}</td>
                            <td className="py-2 px-2 text-neutral-500">{f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "-"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
            console.log("Loading image for file:", JSON.stringify(file, null, 2));

            if (file.mime?.startsWith("image/") && file.storageKey) {
                if (presignCache.has(file.storageKey)) {
                    if (mounted) setImgUrl(presignCache.get(file.storageKey)!);
                    return;
                }
                const res = await presignGet(file.storageKey, 300);
                console.log("Presigned URL response:", res);

                // Prefer explicit url
                if (res?.url) {
                    presignCache.set(file.storageKey, res.url);
                    if (mounted) setImgUrl(res.url);
                    return;
                }
                // Fallback when strategy is public-or-server
                if (res?.strategy === "public-or-server") {
                    // Avoid double-encoding: use the raw storageKey after first slash
                    const url = `/files/${file.storageKey}`;
                    presignCache.set(file.storageKey, url);
                    if (mounted) setImgUrl(url);
                    return;
                }
                // Last resort: try direct storageKey assuming it is already a path
                if (typeof res === "object") {
                    const url = `/files/${file.storageKey}`;
                    presignCache.set(file.storageKey, url);
                    if (mounted) setImgUrl(url);
                }
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, [file, presignGet]);

    return (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="relative h-28 bg-neutral-100">
                {imgUrl ? (
                    <Image src={imgUrl} alt={file.name} fill sizes="200px" className="object-cover" />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-neutral-400 text-sm">No preview</div>
                )}
            </div>
            <div className="p-2">
                <div className="text-[10px] tracking-wide text-neutral-500">{file.type?.toUpperCase()}</div>
                <div className="font-medium truncate" title={file.name}>
                    {file.name}
                </div>
                <div className="text-xs text-neutral-500">{humanSize(file.size)}</div>
            </div>
        </div>
    );
}
