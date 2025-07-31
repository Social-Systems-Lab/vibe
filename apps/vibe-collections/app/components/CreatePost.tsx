"use client";

import { useState, useEffect } from "react";
import { useVibe, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Textarea, PermissionSelector, Input, Squircle } from "vibe-react";
import { Image as ImageIcon, MapPin as MapPinIcon, Users as UsersIcon } from "lucide-react";
import { Profile, Acl } from "vibe-sdk";

export function CreatePost() {
    const [open, setOpen] = useState(false);
    const [content, setContent] = useState("");
    const { write, user, readOnce } = useVibe();
    const [acl, setAcl] = useState<Acl>({ read: { allow: ["*"] } });

    const handlePost = async () => {
        if (!content.trim()) return;
        try {
            await write("posts", {
                content,
                author: { did: user?.did, ref: "profiles/me" },
                acl,
            });
            setContent("");
            setOpen(false);
        } catch (error) {
            console.error("Failed to create post:", error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <div className="flex flex-1 cursor-pointer items-center space-x-4  rounded-[15px] bg-white p-4">
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
            <DialogContent className="max-w-[525px]">
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
                <div className="py-4">
                    <Textarea
                        placeholder={`Share your story...`}
                        value={content}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                        className="min-h-[120px] border-none focus:ring-0 focus:outline-none"
                    />
                </div>
                <DialogFooter className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon">
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
                        <Button onClick={handlePost} disabled={!content.trim()}>
                            Post
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
