import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useVibe } from "vibe-react";
import { Button } from "./ui/button";

// TODO: Define a proper type for the post object
interface PostCardProps {
    post: any;
}

export function PostCard({ post }: PostCardProps) {
    const { delete: deletePost } = useVibe();

    const handleDelete = async () => {
        try {
            await deletePost("posts", post);
        } catch (error) {
            console.error("Failed to delete post", error);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center space-x-4">
                    <Avatar>
                        {/* TODO: Add a real avatar image */}
                        <AvatarImage src={`https://github.com/shadcn.png`} alt="@shadcn" />
                        <AvatarFallback>
                            {/* TODO: Get user initials */}
                            CN
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-sm font-medium leading-none">
                            {/* TODO: Get user name */}
                            Chad Next
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {/* TODO: Get user handle */}
                            @chadnext
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <p>{post.content}</p>
            </CardContent>
            <CardFooter className="flex justify-between">
                <p className="text-sm text-muted-foreground">
                    {/* TODO: Format date */}
                    {new Date(post._id.split("/")[1].split("-")[0] * 1).toLocaleString()}
                </p>
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                    Delete
                </Button>
            </CardFooter>
        </Card>
    );
}
