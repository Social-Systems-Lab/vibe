import { useState, useEffect, useCallback, useRef } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVibe, VibeProvider } from "vibe-react";
import type { Unsubscribe, AppManifest } from "vibe-react";
import logoSvg from "./logo.svg";
import "./index.css";

// Define PostDoc structure
interface PostDoc {
    _id?: string;
    _rev?: string;
    type: "post";
    content: string;
    createdAt: string;
    userDid: string;
}

const feedsAppManifest: AppManifest = {
    appId: "feed-app",
    name: "Feeds App",
    description: "A decentralized feed of posts.",
    permissions: ["read:posts", "write:posts"],
    iconUrl: `${window.location.origin}${logoSvg}`,
};

// --- Inner Component using useVibe ---
function AppContent() {
    const { activeIdentity, read, write } = useVibe();
    const [posts, setPosts] = useState<PostDoc[]>([]);
    const [newPostContent, setNewPostContent] = useState<string>("");
    const [status, setStatus] = useState<string>("Initializing...");
    const postsSubscription = useRef<Unsubscribe | null>(null);

    useEffect(() => {
        if (activeIdentity) {
            setStatus("VibeProvider initialized. Ready.");
        } else {
            setStatus("Waiting for Vibe initialization...");
            setPosts([]);
        }
    }, [activeIdentity]);

    const handleCreatePost = useCallback(
        async (e?: FormEvent) => {
            if (e) e.preventDefault();
            if (!activeIdentity) {
                setStatus("Active identity not initialized. Cannot create post.");
                return;
            }
            if (!newPostContent.trim()) {
                setStatus("Post content cannot be empty.");
                return;
            }

            setStatus("Creating new post...");
            const now = new Date().toISOString();
            const postData: Partial<PostDoc> = {
                content: newPostContent,
                createdAt: now,
            };

            try {
                const result = await write("posts", postData);
                setStatus(`Post created successfully. ID: ${result.ids?.[0] ?? "N/A"}`);
                setNewPostContent("");
            } catch (error) {
                console.error("[AppContent] Error creating post:", error);
                setStatus(`Error creating post: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        [write, activeIdentity, newPostContent]
    );

    useEffect(() => {
        if (!read || !activeIdentity) {
            setPosts([]);
            if (postsSubscription.current) {
                postsSubscription.current();
                postsSubscription.current = null;
            }
            return;
        }

        let isMounted = true;

        const subscribeToPosts = async () => {
            if (postsSubscription.current) {
                await postsSubscription.current();
                postsSubscription.current = null;
            }

            try {
                postsSubscription.current = await read("posts", undefined, (result) => {
                    if (isMounted) {
                        if (result.ok && result.data) {
                            setPosts((result.data as PostDoc[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
                            setStatus(result.data.length ? "Posts loaded." : "No posts yet.");
                        } else if (!result.ok) {
                            setStatus(`Error in posts subscription: ${result.error || "Unknown error"}`);
                        }
                    }
                });
            } catch (error) {
                if (isMounted) {
                    setStatus(`Error subscribing to posts: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };

        subscribeToPosts();

        return () => {
            isMounted = false;
            if (postsSubscription.current) {
                postsSubscription.current();
                postsSubscription.current = null;
            }
        };
    }, [read, activeIdentity]);

    return (
        <div className="container mx-auto p-4 max-w-2xl">
            <header className="flex justify-center my-4">
                <nav className="flex gap-4">
                    <Button variant="ghost" disabled>
                        Following
                    </Button>
                    <Button variant="default">Discover</Button>
                </nav>
            </header>

            <Card className="mb-6">
                <CardContent className="p-4">
                    <form onSubmit={handleCreatePost} className="space-y-4">
                        <Textarea
                            value={newPostContent}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewPostContent(e.target.value)}
                            placeholder="Share your story..."
                            required
                            rows={3}
                            disabled={!activeIdentity}
                        />
                        <div className="flex justify-end">
                            <Button type="submit" disabled={!activeIdentity || !newPostContent.trim()}>
                                Post
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {posts.map((post) => (
                    <Card key={post._id}>
                        <CardHeader>
                            <CardTitle className="text-sm font-normal">{post.userDid}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>{post.content}</p>
                            <p className="text-xs text-muted-foreground mt-2">{new Date(post.createdAt).toLocaleString()}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Card className="bg-card/50 backdrop-blur-sm border-muted mt-6">
                <CardHeader>
                    <CardTitle>App Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>
                        <span className="italic">{status}</span>
                    </p>
                    <p className="mt-2">
                        Vibe Active Identity:{" "}
                        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
                            {activeIdentity?.label ?? "None"} ({activeIdentity?.did ?? "N/A"})
                        </code>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

// --- Page Component ---
function App() {
    return (
        <VibeProvider manifest={feedsAppManifest}>
            <AppContent />
        </VibeProvider>
    );
}

export default App;
