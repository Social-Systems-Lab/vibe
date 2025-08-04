"use client";

import React, { useEffect, useState } from "react";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    Avatar,
    AvatarFallback,
    AvatarImage,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Squircle,
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "vibe-react";
import { useVibe } from "vibe-react";
import { MoreHorizontal, Heart, MessageCircle, Repeat, Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
import { Post, Profile, Acl } from "vibe-sdk";
import { UserHoverCard } from "./UserHoverCard";
import { useSelectedUser } from "../context/SelectedUserContext";

const mockUser = {
    name: "John Doe",
    handle: "johndoe",
    avatar: "https://github.com/shadcn.png",
    coverImage: "/images/showcase.png",
    bio: "Building in public and sharing my journey. Follow for updates on my projects and thoughts on web development.",
    location: "San Francisco, CA",
    joinedDate: "April 2021",
    website: "https://johndoe.com",
    followers: 1200,
    following: 300,
    posts: 150,
};

interface PostCardProps {
    post: Post;
}

function getPermissionFromAcl(acl: Acl, did?: string): string {
    const allow = acl?.read?.allow;
    if (!allow || allow.length === 0) {
        return "Just Me";
    }

    const allowRule = allow[0];
    if (allowRule === "*") {
        return "Everyone";
    }

    if (typeof allowRule === "object" && "issuer" in allowRule) {
        switch (allowRule.type) {
            case "admin-of":
                return "Admins";
            case "moderator-of":
                return "Moderators";
            case "friend-of":
                return "Friends";
            case "member-of":
                return "Members";
            case "follower-of":
                return "Followers";
        }
    }
    return "";
}

export function PostCard({ post }: PostCardProps) {
    const { remove: removePost, user, presignGet } = useVibe();
    const { selectedUser, setSelectedUser } = useSelectedUser();

    const handleSelectUser = () => {
        console.log("Setting selected user", mockUser);
        setSelectedUser(selectedUser ? null : mockUser);
    };

    const handleRemove = async () => {
        try {
            await removePost("posts", post);
        } catch (error) {
            console.error("Failed to remove post", error);
        }
    };

    const postDate = new Date(parseInt(post._id?.split("/")[1]?.split("-")[0]) * 1);
    const isOwnPost = post.author.did === user?.did;

    // Normalize attachments: post.attachments can be an array of DocRefs or expanded file docs (after expand)
    // Expect each expanded file doc to have storageKey or url; presign if necessary for display.
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [currentIdx, setCurrentIdx] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const atts = Array.isArray((post as any).attachments) ? (post as any).attachments : [];
                // Only images
                const files = atts
                    .map((a: any) => {
                        // If expansion occurred server/hub-side, a is the file doc; else it's a DocRef {did, ref}
                        // We only handle already expanded docs here (contains storageKey/mime/mimeType)
                        return a && (a.storageKey || a.url) ? a : null;
                    })
                    .filter(Boolean) as any[];

                const urls: string[] = [];
                for (const f of files) {
                    if (f.url) {
                        urls.push(f.url);
                    } else if (f.storageKey) {
                        try {
                            const signed = await presignGet(f.storageKey, 300);
                            urls.push((signed?.url || signed?.presignedURL || signed?.publicURL) as string);
                        } catch {
                            // push placeholder or skip
                        }
                    }
                }
                if (!cancelled) setImageUrls(urls);
            } catch (e) {
                console.warn("Failed to prepare attachment previews", e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [post, presignGet]);

    const hasImages = imageUrls.length > 0;

    const goPrev = () => setCurrentIdx((i) => Math.max(0, i - 1));
    const goNext = () => setCurrentIdx((i) => Math.min(imageUrls.length - 1, i + 1));

    return (
        <div className="bg-background p-4 border-b border-[#f3f3f3]">
            <div className="flex space-x-4">
                <HoverCard>
                    <HoverCardTrigger onClick={handleSelectUser}>
                        <Squircle imageUrl={(post.author as Profile)?.pictureUrl} size={38}>
                            {(post.author as Profile)?.name?.substring(0, 2).toUpperCase()}
                        </Squircle>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-96">
                        <UserHoverCard user={mockUser} />
                    </HoverCardContent>
                </HoverCard>
                <div className="w-full">
                    <div className="flex justify-between">
                        <div>
                            <HoverCard>
                                <HoverCardTrigger onClick={handleSelectUser}>
                                    <p className="font-semibold">{(post.author as Profile)?.name}</p>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-96">
                                    <UserHoverCard user={mockUser} />
                                </HoverCardContent>
                            </HoverCard>
                            <p className="text-sm text-gray-500">{postDate.toLocaleDateString()}</p>
                        </div>
                        {isOwnPost && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={handleRemove} className="text-red-500">
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                    <div className="mt-2">
                        <p>{post.content}</p>
                        {/* Debug: remove when verified */}
                        {/* <pre>{JSON.stringify(post, null, 2)}</pre> */}
                    </div>

                    {/* Image carousel */}
                    {hasImages && (
                        <div className="relative mt-3 w-full">
                            <div className="h-64 w-full overflow-hidden rounded-lg bg-neutral-100">
                                <img src={imageUrls[currentIdx]} alt={`image-${currentIdx + 1}`} className="h-64 w-full rounded-lg object-cover" />
                            </div>

                            {imageUrls.length > 1 && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60"
                                        onClick={goPrev}
                                        disabled={currentIdx === 0}
                                        aria-label="Previous"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60"
                                        onClick={goNext}
                                        disabled={currentIdx === imageUrls.length - 1}
                                        aria-label="Next"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </Button>

                                    <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                                        <div className="flex items-center">
                                            {imageUrls.map((_, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setCurrentIdx(idx)}
                                                    className={`mx-1 h-1.5 w-1.5 rounded-full ${idx === currentIdx ? "bg-blue-500" : "bg-gray-300"}`}
                                                    aria-label={`Go to image ${idx + 1}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex justify-between items-center mt-4 text-gray-500">
                        <div className="flex space-x-4">
                            <Button variant="ghost" size="icon">
                                <Heart className="h-5 w-5" />
                            </Button>
                            <Button variant="ghost" size="icon">
                                <MessageCircle className="h-5 w-5" />
                            </Button>
                            <Button variant="ghost" size="icon">
                                <Repeat className="h-5 w-5" />
                            </Button>
                        </div>
                        <Button variant="ghost" size="icon">
                            <Bookmark className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
