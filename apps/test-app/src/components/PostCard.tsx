import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useVibe } from "vibe-react";
import { Button } from "./ui/button";

import { Post, Profile } from "vibe-sdk";

interface PostCardProps {
    post: Post;
}

export function PostCard({ post }: PostCardProps) {
    const { remove: removePost } = useVibe();

    const handleRemove = async () => {
        try {
            await removePost("posts", post);
        } catch (error) {
            console.error("Failed to remove post", error);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center space-x-4">
                    <Avatar>
                        <AvatarImage src={(post.author as Profile)?.pictureUrl} alt={(post.author as Profile)?.name} />
                        <AvatarFallback>{(post.author as Profile)?.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-sm font-medium leading-none">{(post.author as Profile)?.name}</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <p>{post.content}</p>
            </CardContent>
            <CardFooter className="flex justify-between">
                <p className="text-sm text-muted-foreground">
                    {/* TODO: Format date */}
                    {new Date(parseInt(post._id.split("/")[1].split("-")[0]) * 1).toLocaleString()}
                </p>
                <Button variant="destructive" size="sm" onClick={handleRemove}>
                    Delete
                </Button>
            </CardFooter>
        </Card>
    );
}
