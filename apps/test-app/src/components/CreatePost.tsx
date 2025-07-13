import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useVibe } from "vibe-react";

export function CreatePost() {
    const [open, setOpen] = useState(false);
    const [content, setContent] = useState("");
    const { write, user } = useVibe();

    const handlePost = async () => {
        if (!content.trim()) return;
        try {
            await write("posts", { content, author: { did: user?.did, ref: "profiles/me" } });
            setContent("");
            setOpen(false);
        } catch (error) {
            console.error("Failed to create post:", error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Input placeholder="What's on your mind?" className="cursor-pointer" />
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create Post</DialogTitle>
                    <DialogDescription>Share your thoughts with the world.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea placeholder="What's on your mind?" value={content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)} className="col-span-3" />
                </div>
                <DialogFooter>
                    <Button onClick={handlePost}>Post</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
