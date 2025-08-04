"use client";

import { useState, useCallback } from "react";
import {
    useVibe,
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Textarea,
    PermissionSelector,
    Input,
    Squircle,
} from "vibe-react";
import { ImagePicker } from "vibe-react";
import { FilePreview } from "vibe-react";
import { Image as ImageIcon, MapPin as MapPinIcon } from "lucide-react";
import type { Acl } from "vibe-sdk";

export function CreatePost() {
    const [open, setOpen] = useState(false);
    const [content, setContent] = useState("");
    const { write, user, upload, presignGet } = useVibe();
    const [acl, setAcl] = useState<Acl>({ read: { allow: ["*"] } });

    // Attached files to this post (any type; previews show images best-effort)
    const [attachments, setAttachments] = useState<{ id: string; name?: string; url?: string; storageKey?: string; mimeType?: string; size?: number }[]>([]);

    // ImagePicker modal
    const [pickerOpen, setPickerOpen] = useState(false);

    const handlePost = async () => {
        if (!content.trim()) return;
        try {
            await write("posts", {
                content,
                attachments: attachments.map((f) => ({
                    id: f.id,
                    name: f.name,
                    storageKey: f.storageKey,
                    url: f.url,
                    mimeType: f.mimeType,
                    size: f.size,
                })),
                author: { did: user?.did, ref: "profiles/me" },
                acl,
            });
            setContent("");
            setAttachments([]);
            setOpen(false);
        } catch (error) {
            console.error("Failed to create post:", error);
        }
    };

    // Drag-and-drop handlers on the composer area
    const onDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
            const files = Array.from(e.dataTransfer.files);
            for (const f of files) {
                try {
                    const { storageKey } = await upload(f as File);
                    let url: string | undefined;
                    try {
                        const signed = await presignGet(storageKey, 300);
                        url = (signed as any)?.url || (signed as any);
                    } catch {}
                    setAttachments((prev) => [
                        {
                            id: crypto.randomUUID(),
                            name: f.name,
                            storageKey,
                            url,
                            mimeType: (f as any).type,
                            size: f.size,
                        },
                        ...prev,
                    ]);
                } catch (err) {
                    console.error("Drop upload failed", err);
                }
            }
        },
        [upload, presignGet]
    );

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const removeAttachment = (id: string) => {
        setAttachments((prev) => prev.filter((f) => f.id !== id));
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <div className="flex flex-1 cursor-pointer items-center space-x-4 rounded-[15px] bg-white p-4">
                    <Squircle imageUrl={user?.pictureUrl} size={40}>
                        {user?.displayName?.[0]}
                    </Squircle>
                    <div className="flex flex-1">
                        <Input
                            placeholder="What's on your mind?"
                            className="pointer-events-none border-none w-full rounded-full bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </DialogTrigger>
            <DialogContent className="max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-4">
                            <Squircle imageUrl={user?.pictureUrl} size={40}>
                                {user?.displayName?.[0]}
                            </Squircle>
                            <div>
                                <p className="font-bold">{user?.displayName || user?.did}</p>
                                <PermissionSelector acl={acl} onAclChange={setAcl} />
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4" onDrop={onDrop} onDragOver={onDragOver}>
                    <Textarea
                        placeholder={`Share your story...`}
                        value={content}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                        className="min-h-[120px] border-none focus:ring-0 focus:outline-none"
                    />
                    {attachments.length > 0 && (
                        <div className="mt-4 grid grid-cols-3 gap-3">
                            {attachments.map((f) => (
                                <div key={f.id} className="relative group">
                                    <FilePreview
                                        file={{ id: f.id, name: f.name, url: f.url, storageKey: f.storageKey, mimeType: f.mimeType, size: f.size }}
                                        size="md"
                                        variant="grid"
                                    />
                                    <button
                                        type="button"
                                        className="absolute top-1 right-1 hidden group-hover:block text-xs rounded bg-black/60 text-white px-2 py-1"
                                        onClick={() => removeAttachment(f.id)}
                                        aria-label="Remove"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setPickerOpen(true)}>
                            <ImageIcon className="w-5 h-5" />
                        </Button>
                        <Button variant="ghost" size="icon">
                            <MapPinIcon className="w-5 h-5" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handlePost} disabled={!content.trim() && attachments.length === 0}>
                            Post
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>

            <ImagePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onSelect={(picked: Array<{ id: string; name?: string; storageKey?: string; url?: string; mimeType?: string; size?: number }>) => {
                    setAttachments((prev) => {
                        const mapped = picked.map((p) => ({
                            id: p.id,
                            name: p.name,
                            storageKey: p.storageKey,
                            url: p.url,
                            mimeType: p.mimeType,
                            size: p.size,
                        }));
                        const next = [...mapped, ...prev];
                        const seen = new Set<string>();
                        return next.filter((x) => {
                            if (seen.has(x.id)) return false;
                            seen.add(x.id);
                            return true;
                        });
                    });
                }}
                accept="*/*"
                selectionMode="multiple"
                title="Pick files to attach"
                allowUpload={true}
            />
        </Dialog>
    );
}
