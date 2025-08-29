"use client";

import { useEffect, useMemo, useState } from "react";
import { useVibe, VibeImage, getStreamUrl } from "vibe-react";
import {
    DataTable,
    type ColumnDef,
    type FileDoc,
    UploadArea,
    StorageUsageCard,
    Button,
    Input,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    Toggle,
    ToggleGroup,
    ToggleGroupItem,
} from "vibe-react";
import {
    DownloadIcon,
    EyeIcon,
    Trash2Icon,
    ImageIcon,
    FileIcon,
    FileTextIcon,
    VideoIcon,
    MusicIcon,
    FileArchiveIcon,
    MoreHorizontal,
    Search,
    SlidersHorizontal,
    LayoutGrid,
    List as ListIcon,
} from "lucide-react";

type TypeFilter = "all" | "image" | "video" | "audio" | "doc" | "archive" | "other";
type SortKey = "newest" | "oldest" | "name" | "size-desc" | "size-asc";

export default function StoragePage() {
    const { apiBase, readOnce } = useVibe();
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

    // UI state
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("newest");
    const [view, setView] = useState<"table" | "grid">("table");

    // Preview modal
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<FileDoc | null>(null);

    // Get API token via cookie-auth endpoint
    useEffect(() => {
        const getToken = async () => {
            try {
                const res = await fetch(`${apiBase}/hub/api-token`, {
                    credentials: "include",
                });
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

    const mimeGroup = (mime?: string): TypeFilter => {
        if (!mime) return "other";
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("video/")) return "video";
        if (mime.startsWith("audio/")) return "audio";
        if (mime.includes("zip") || mime.includes("compressed")) return "archive";
        if (
            mime.includes("pdf") ||
            mime.includes("msword") ||
            mime.includes("officedocument") ||
            mime.startsWith("text/")
        )
            return "doc";
        return "other";
    };

    const IconForMime = ({ mime }: { mime?: string }) => {
        const m = mimeGroup(mime);
        const cn = "size-4 text-foreground/70";
        switch (m) {
            case "image":
                return <ImageIcon className={cn} />;
            case "video":
                return <VideoIcon className={cn} />;
            case "audio":
                return <MusicIcon className={cn} />;
            case "archive":
                return <FileArchiveIcon className={cn} />;
            case "doc":
                return <FileTextIcon className={cn} />;
            default:
                return <FileIcon className={cn} />;
        }
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
        setError(null);
        try {
            // Hub-aware read; avoids manual REST and plays well with PouchDB cache
            const res = await readOnce("files", { limit: 2000 });
            const docs: FileDoc[] = Array.isArray((res as any)?.docs)
                ? (res as any).docs
                : Array.isArray(res)
                ? (res as any)
                : Array.isArray((res as any)?.items)
                ? (res as any).items
                : [];
            // Default sort newest first
            docs.sort((a, b) => {
                const da = new Date(a.createdAt || 0).getTime();
                const db = new Date(b.createdAt || 0).getTime();
                return db - da;
            });
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

    const getPreviewUrl = async (storageKey?: string) => {
        if (!storageKey) return;
        return getStreamUrl(apiBase, storageKey);
    };

    const handleDownload = async (storageKey?: string) => {
        try {
            const url = storageKey ? getStreamUrl(apiBase, storageKey) : undefined;
            if (url) window.open(url, "_blank", "noopener,noreferrer");
        } catch (e: any) {
            setError(e?.message || "Failed to open download");
        }
    };

    const onPreview = async (file: FileDoc) => {
        try {
            const url = file.storageKey ? getStreamUrl(apiBase, file.storageKey) : null;
            setPreviewUrl(url);
            setPreviewFile(file);
            setPreviewOpen(true);
        } catch (e: any) {
            setError(e?.message || "Failed to open preview");
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

    // Derived list with search/filter/sort
    const filtered = useMemo(() => {
        const base = files || [];
        const q = query.trim().toLowerCase();
        let list = base.filter((f) => {
            const matchQ = !q || f.name?.toLowerCase().includes(q) || f.mimeType?.toLowerCase().includes(q);
            const matchType = typeFilter === "all" ? true : mimeGroup(f.mimeType) === typeFilter;
            return matchQ && matchType;
        });
        switch (sortKey) {
            case "name":
                list = [...list].sort((a, b) =>
                    (a.name || "").localeCompare(b.name || "", undefined, {
                        sensitivity: "base",
                    })
                );
                break;
            case "size-asc":
                list = [...list].sort((a, b) => (a.size || 0) - (b.size || 0));
                break;
            case "size-desc":
                list = [...list].sort((a, b) => (b.size || 0) - (a.size || 0));
                break;
            case "oldest":
                list = [...list].sort(
                    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
                );
                break;
            case "newest":
            default:
                list = [...list].sort(
                    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                );
        }
        return list;
    }, [files, query, typeFilter, sortKey]);

    const columns: ColumnDef<FileDoc>[] = [
        {
            accessorKey: "name",
            header: "Name",
            cell: ({ row }) => {
                const file = row.original;
                return (
                    <div className="flex items-center gap-3">
                        <div className="size-8 rounded-md border border-border/60 bg-accent/10 flex items-center justify-center">
                            <IconForMime mime={file.mimeType} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{file.name || "-"}</div>
                            <div className="text-xs text-foreground/60">
                                {file.mimeType || "-"} • {typeof file.size === "number" ? formatBytes(file.size) : "-"}
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            accessorKey: "createdAt",
            header: "Uploaded",
            cell: ({ row }) => {
                const d = row.original.createdAt ? new Date(row.original.createdAt) : null;
                return <span className="text-sm">{d ? d.toLocaleString() : "-"}</span>;
            },
        },
        {
            id: "actions",
            header: "Actions",
            cell: ({ row }) => {
                const file = row.original;
                return (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label="Preview"
                            onClick={() => onPreview(file)}
                            title="Preview"
                        >
                            <EyeIcon className="size-4" />
                            <span className="sr-only">Preview</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label="Download"
                            onClick={() => handleDownload(file.storageKey)}
                            title="Download"
                        >
                            <DownloadIcon className="size-4" />
                            <span className="sr-only">Download</span>
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            aria-label="Delete"
                            onClick={() => deleteFile(file.storageKey)}
                            title="Delete"
                        >
                            <Trash2Icon className="size-4" />
                            <span className="sr-only">Delete</span>
                        </Button>
                    </div>
                );
            },
        },
    ];

    // Grid view components
    const FileCard = ({ file }: { file: FileDoc }) => {
        return (
            <div className="border rounded-lg overflow-hidden bg-background shadow-sm hover:shadow-md transition-shadow">
                <div className="relative h-28 bg-accent/10">
                    {file ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <VibeImage src={file} alt={file.name || "preview"} className="w-full h-full object-cover" />
                    ) : (
                        // <img src={imgUrl} alt={file.name || "preview"} className="w-full h-full object-cover" />
                        <div className="h-full w-full flex items-center justify-center text-foreground/60 text-xs">
                            No preview
                        </div>
                    )}
                </div>
                <div className="p-2">
                    <div className="text-[10px] tracking-wide text-foreground/60">
                        {(mimeGroup(file.mimeType) || "").toUpperCase()}
                    </div>
                    <div className="font-medium truncate" title={file.name || ""}>
                        {file.name || "-"}
                    </div>
                    <div className="text-xs text-foreground/60">
                        {typeof file.size === "number" ? formatBytes(file.size) : "-"}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <Button variant="outline" size="sm" aria-label="Preview" onClick={() => onPreview(file)}>
                            <EyeIcon className="size-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label="Download"
                            onClick={() => handleDownload(file.storageKey)}
                        >
                            <DownloadIcon className="size-4" />
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            aria-label="Delete"
                            onClick={() => deleteFile(file.storageKey)}
                        >
                            <Trash2Icon className="size-4" />
                        </Button>
                    </div>
                </div>
            </div>
        );
    };

    const FileGrid = ({ data }: { data: FileDoc[] }) => {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {data.map((f) => (
                    <FileCard key={f._id || f.id || f.storageKey} file={f} />
                ))}
            </div>
        );
    };

    const FilterChip = ({ value, label }: { value: TypeFilter; label: string }) => (
        <Button
            variant="outline"
            size="sm"
            onClick={() => setTypeFilter(value)}
            aria-pressed={typeFilter === value}
            className={
                typeFilter === value
                    ? "bg-violet-600 text-white border-transparent hover:bg-violet-600/90"
                    : "border-border"
            }
        >
            {label}
        </Button>
    );

    return (
        <main className="w-full">
            <section className="max-w-6xl">
                {/* Header */}
                {/* <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h1 className="text-3xl font-heading">Storage</h1>
          </div>
        </div> */}

                {/* <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h1 className="text-2xl font-heading">Storage</h1>
            <div className="text-xs text-foreground/60">Manage your uploaded files and usage</div>
          </div>
          <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Grid view"
                  className={view === "grid" ? "bg-violet-600 text-white border-transparent hover:bg-violet-600/90" : "border-border"}
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Table view"
                  className={view === "table" ? "bg-violet-600 text-white border-transparent hover:bg-violet-600/90" : "border-border"}
                  onClick={() => setView("table")}
                >
                  <ListIcon className="size-4" />
                </Button>
              </div>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Grid view"
                  className={view === "grid" ? "bg-violet-600 text-white border-transparent hover:bg-violet-600/90" : "border-border"}
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Table view"
                  className={view === "table" ? "bg-violet-600 text-white border-transparent hover:bg-violet-600/90" : "border-border"}
                  onClick={() => setView("table")}
                >
                  <ListIcon className="size-4" />
                </Button>
              </div>
                          {token && (
              <UploadArea
                token={token}
                apiBase={apiBase}
                mode="button"
                onUploaded={async () => {
                  await loadFiles();
                  await loadUsage();
                }}
                globalDrop
              />
            )}      
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void loadFiles()}>Refresh list</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div> */}

                {/* Usage */}
                <div className="mb-4">
                    <StorageUsageCard
                        usedBytes={usage?.used_bytes}
                        reservedBytes={usage?.reserved_bytes}
                        limitBytes={usage?.limit_bytes}
                        percent={usage?.percent}
                        tier={usage?.tier}
                        loading={usageLoading}
                    />
                </div>

                {/* Error */}
                {error && (
                    <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">
                        {error}
                    </div>
                )}

                {/* Upload hero / empty state */}
                {token && files && files.length === 0 && (
                    <div className="mb-4">
                        <div className="rounded-lg border border-dashed p-8 text-center">
                            <div className="mx-auto mb-2 size-10 rounded-md border border-border/60 bg-accent/10 flex items-center justify-center">
                                <SlidersHorizontal className="size-5 text-foreground/70" />
                            </div>
                            <div className="font-medium">No files yet</div>
                            <div className="text-xs text-foreground/60 mb-3">
                                Drag & drop to upload, or click below.
                            </div>
                            <UploadArea
                                token={token}
                                apiBase={apiBase}
                                mode="button"
                                onUploaded={async () => {
                                    await loadFiles();
                                    await loadUsage();
                                }}
                                globalDrop
                            />
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="mb-3 flex flex-col gap-2 sm:flex-row items-center sm:justify-between">
                    <div className="relative w-full sm:w-80 flex flex-row gap-2">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-foreground/50" />
                        <Input
                            placeholder="Search files by name or type"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="pl-8 shrink-0"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* <FilterChip value="all" label="All" />
            <FilterChip value="image" label="Images" />
            <FilterChip value="video" label="Video" />
            <FilterChip value="audio" label="Audio" />
            <FilterChip value="doc" label="Docs" /> */}
                        {/* <FilterChip value="archive" label="Archives" />
            <FilterChip value="other" label="Other" /> */}
                        {/* <div className="h-6 w-px bg-border mx-1" />
            <select
              className="h-9 text-sm rounded-md border bg-background px-2"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name A–Z</option>
              <option value="size-desc">Size (large first)</option>
              <option value="size-asc">Size (small first)</option>
            </select> */}

                        {/* <ToggleGroup variant="outline" type="single">
                  <ToggleGroupItem value="bold" aria-label="Toggle bold">
                    <LayoutGrid className="size-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="italic" aria-label="Toggle italic">
                    <ListIcon className="size-4" />
                  </ToggleGroupItem>
                </ToggleGroup> */}

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
                                <ListIcon className="size-4" />
                            </Button>
                        </div>
                        {token && (
                            <UploadArea
                                token={token}
                                apiBase={apiBase}
                                mode="button"
                                onUploaded={async () => {
                                    await loadFiles();
                                    await loadUsage();
                                }}
                                globalDrop
                            />
                        )}
                    </div>
                </div>

                {/* Files table */}
                <div>
                    {files === null && <div className="text-sm text-foreground/60">No files loaded yet.</div>}
                    {files !== null && filtered.length === 0 && files.length > 0 && (
                        <div className="text-sm text-foreground/60">No results match your filters.</div>
                    )}
                    {files !== null &&
                        filtered.length > 0 &&
                        (view === "table" ? (
                            <DataTable columns={columns} data={filtered} pageSize={10} />
                        ) : (
                            <FileGrid data={filtered} />
                        ))}
                </div>

                {/* Global drop affordance when using header upload */}
                {token && (
                    <div className="sr-only" aria-live="polite">
                        Ready to upload
                    </div>
                )}
            </section>

            {/* Preview dialog */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{previewFile?.name || "Preview"}</DialogTitle>
                        <DialogDescription>{previewFile?.mimeType}</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-[300px] max-h-[70vh] overflow-auto flex items-center justify-center rounded-md border bg-muted/20">
                        {previewUrl && (previewFile?.mimeType || "").startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={previewUrl}
                                alt={previewFile?.name || "preview"}
                                className="max-h-[70vh] object-contain"
                            />
                        ) : previewUrl ? (
                            <div className="text-sm p-4">
                                Preview not available for this file type. You can download it to view.
                            </div>
                        ) : (
                            <div className="text-sm p-4">Loading preview…</div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => previewFile && handleDownload(previewFile.storageKey)}>
                            <DownloadIcon className="size-4" />
                            Download
                        </Button>
                        <DialogClose asChild>
                            <Button>Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}
