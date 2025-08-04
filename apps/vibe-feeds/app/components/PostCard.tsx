"use client";

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
} from "vibe-react";
import { useVibe } from "vibe-react";
import { MoreHorizontal, Heart, MessageCircle, Repeat, Bookmark } from "lucide-react";
import { Post, Profile, Acl } from "vibe-sdk";

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
    const { remove: removePost, user } = useVibe();

    const handleRemove = async () => {
        try {
            await removePost("posts", post);
        } catch (error) {
            console.error("Failed to remove post", error);
        }
    };

    const postDate = new Date(parseInt(post._id?.split("/")[1]?.split("-")[0]) * 1);
    const isOwnPost = post.author.did === user?.did;

    return (
        <div className="bg-background p-4 border-b border-[#f3f3f3]">
            <div className="flex space-x-4">
                <Squircle imageUrl={(post.author as Profile)?.pictureUrl} size={38}>
                    {(post.author as Profile)?.name?.substring(0, 2).toUpperCase()}
                </Squircle>
                <div className="w-full">
                    <div className="flex justify-between">
                        <div>
                            <p className="font-semibold">{(post.author as Profile)?.name}</p>
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
                        <pre>{JSON.stringify(post, null, 2)}</pre>
                    </div>
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
