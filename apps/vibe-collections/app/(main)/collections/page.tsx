"use client";

import React, { useCallback, useEffect, useState } from "react";
import { VibeProvider } from "../../components/VibeProvider";
import { createSdk, Document } from "vibe-sdk";
import { appManifest } from "../../lib/manifest";

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

const sdk = createSdk({
    apiUrl: appManifest.apiUrl,
    clientId: appManifest.clientId,
    redirectUri: appManifest.redirectUri,
    hubUrl: `${appManifest.apiUrl}/hub.html`,
}) as any;

export default function CollectionsPage() {
    const [ready, setReady] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [files, setFiles] = useState<FileDoc[]>([]);
    const [q, setQ] = useState("");
    const [type, setType] = useState<string>("");

    useEffect(() => {
        const unsub = sdk.onStateChange(({ isAuthenticated }: { isAuthenticated: boolean; user: any }) => {
            setIsAuthenticated(isAuthenticated);
        });
        (async () => {
            await sdk.init();
            setReady(true);
        })();
        return () => {
            unsub();
        };
    }, []);

    const refresh = useCallback(async () => {
        const res = await (sdk as any).readOnce("files", {
            selector: { collection: "files" },
            q: q || undefined,
            type: type || undefined,
        });
        setFiles(res.docs || []);
    }, [q, type]);

    useEffect(() => {
        if (isAuthenticated) {
            refresh();
        }
    }, [isAuthenticated, q, type, refresh]);

    if (!ready) {
        return (
            <VibeProvider>
                <div className="p-8 text-sm text-neutral-500">Initializing…</div>
            </VibeProvider>
        );
    }

    if (!isAuthenticated) {
        return (
            <VibeProvider>
                <div className="p-8">
                    <h1 className="text-xl font-semibold mb-2">Collections</h1>
                    <p className="text-sm text-neutral-600 mb-4">Please sign in to continue.</p>
                    <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={() => sdk.login()}>
                        Sign in
                    </button>
                </div>
            </VibeProvider>
        );
    }

    return (
        <VibeProvider>
            <div className="min-h-screen flex flex-col">
                <Header q={q} setQ={setQ} type={type} setType={setType} onRefresh={refresh} />
                <main className="flex-1 p-4">
                    <DragDropUploader
                        onUploaded={async () => {
                            await refresh();
                        }}
                    />
                    <FilesGrid files={files} />
                </main>
            </div>
        </VibeProvider>
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
            <h1 className="text-lg font-semibold mr-auto">Collections</h1>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or tag" className="border rounded px-3 py-1 text-sm w-64" />
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

function DragDropUploader({ onUploaded }: { onUploaded: () => void }) {
    const [busy, setBusy] = useState(false);
    const onFiles = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            setBusy(true);
            try {
                const file = files[0];
                // 1) Upload the blob via SDK
                const { storageKey } = await (sdk as any).storage.upload(file as any);
                // 2) Persist a FileDoc via /data
                const now = new Date().toISOString();
                const doc: FileDoc = {
                    _id: `files/${crypto.randomUUID()}`,
                    collection: "files",
                    name: file.name,
                    ext: extFromName(file.name),
                    mime: (file as any).type || "application/octet-stream",
                    size: file.size,
                    storageKey,
                    type: inferType((file as any).type || ""),
                    tags: [],
                    collections: [],
                    createdAt: now,
                    updatedAt: now,
                };
                await sdk.write("files", doc);
                onUploaded();
            } catch (e) {
                console.error("Upload failed:", e);
                alert("Upload failed");
            } finally {
                setBusy(false);
            }
        },
        [onUploaded]
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
            <p className="text-sm text-neutral-600 mb-2">Drag & drop a file here, or pick one</p>
            <input type="file" onChange={(e) => onFiles(e.target.files)} disabled={busy} className="block mx-auto" />
            {busy && <p className="text-xs text-neutral-500 mt-2">Uploading…</p>}
        </div>
    );
}

function FilesGrid({ files }: { files: FileDoc[] }) {
    if (!files?.length) {
        return <div className="text-sm text-neutral-500">No files yet.</div>;
    }
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {files.map((f) => (
                <div key={f._id} className="border rounded p-2">
                    <div className="text-xs text-neutral-500">{f.type?.toUpperCase()}</div>
                    <div className="font-medium truncate" title={f.name}>
                        {f.name}
                    </div>
                    <div className="text-xs text-neutral-500">{humanSize(f.size)}</div>
                    <div className="text-[10px] text-neutral-400 break-all mt-1">{f.storageKey}</div>
                </div>
            ))}
        </div>
    );
}
