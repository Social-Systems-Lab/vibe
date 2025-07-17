"use client";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useVibe } from "vibe-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
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

    if (typeof allowRule === "object" && "issuer" in allowRule && allowRule.issuer === did) {
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
    return "Custom";
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

    const postDate = new Date(parseInt(post._id.split("/")[1].split("-")[0]) * 1);
    const isOwnPost = post.author.did === user?.did;

    return (
        <Card className="relative">
            <CardHeader>
                <div className="flex items-center space-x-4">
                    <Avatar>
                        <AvatarImage src={(post.author as Profile)?.pictureUrl} alt={(post.author as Profile)?.name} />
                        <AvatarFallback>{(post.author as Profile)?.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-sm font-medium leading-none">{(post.author as Profile)?.name}</p>
                        <p className="text-sm text-muted-foreground">
                            {postDate.toLocaleDateString()} · {getPermissionFromAcl(post.acl, user?.did)}
                        </p>
                    </div>
                </div>
                {isOwnPost && (
                    <div className="absolute top-2 right-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={handleRemove} className="text-red-500">
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <p>{post.content}</p>
            </CardContent>
        </Card>
    );
}
