import { useState, useEffect, useCallback, useRef } from "react";
import type { ChangeEvent, FormEvent } from "react";
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
    permissions: ["read:posts", "write:posts", "blob:read:profile", "blob:write:profile"],
    iconUrl: `${window.location.origin}${logoSvg}`,
};

// --- Inner Component using useVibe ---
function AppContent() {
    const { vibe, activeIdentity, read, write, readOnce } = useVibe();
    const [posts, setPosts] = useState<PostDoc[]>([]);
    const [newPostContent, setNewPostContent] = useState<string>("");
    const [status, setStatus] = useState<string>("Initializing...");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [profilePicUrl, setProfilePicUrl] = useState<string>("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const postsSubscription = useRef<Unsubscribe | null>(null);

    useEffect(() => {
        if (activeIdentity && vibe) {
            setStatus("VibeProvider initialized. Ready.");
            // Fetch user profile to get profile picture
            readOnce("profile").then((result) => {
                if (result.ok && result.data.length > 0) {
                    const profile = result.data[0];
                    if (profile.avatarObjectKey) {
                        vibe.blob.getReadUrl(profile.avatarObjectKey).then(setProfilePicUrl);
                    }
                }
            });
        } else {
            setStatus("Waiting for Vibe initialization...");
            setPosts([]);
            setProfilePicUrl("");
        }
    }, [activeIdentity, vibe]);

    const handleProfilePicUpload = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            if (!e.target.files || e.target.files.length === 0 || !vibe) {
                return;
            }
            const file = e.target.files[0];
            setStatus("Uploading profile picture...");
            try {
                const metadata = await vibe.blob.upload("profile", file);
                setStatus("Profile picture uploaded. Saving reference...");

                // Save the object key in the user's profile document
                await write("profile", { _id: "main", avatarObjectKey: metadata._id });

                const url = await vibe.blob.getReadUrl(metadata._id);
                setProfilePicUrl(url);
                setStatus("Profile picture updated.");
            } catch (error) {
                console.error("Error uploading profile picture:", error);
                setStatus(`Error uploading profile picture: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        [vibe, write]
    );

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
                setIsDialogOpen(false); // Close dialog on successful post
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
        <div className="bg-gray-50 min-h-screen w-screen">
            <div className="container mx-auto p-4 max-w-2xl">
                <div className="bg-white p-4 rounded-lg shadow-lg mb-6">
                    <div className="flex items-center">
                        <input type="file" ref={fileInputRef} onChange={handleProfilePicUpload} style={{ display: "none" }} accept="image/*" />
                        <img
                            src={profilePicUrl || `https://i.pravatar.cc/40?u=${activeIdentity?.did}`}
                            alt="Your profile"
                            className="w-10 h-10 rounded-full mr-4 cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        />
                        <div className="text-gray-500 flex-grow cursor-pointer" onClick={() => setIsDialogOpen(true)}>
                            Create a post...
                        </div>
                    </div>
                </div>

                {isDialogOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
                            <div className="flex items-center mb-4">
                                <img
                                    src={profilePicUrl || `https://i.pravatar.cc/40?u=${activeIdentity?.did}`}
                                    alt="Your profile"
                                    className="w-10 h-10 rounded-full mr-4"
                                />
                                <div>
                                    <p className="font-semibold">{activeIdentity?.label}</p>
                                    <p className="text-sm text-gray-500">Everyone</p>
                                </div>
                                <button onClick={() => setIsDialogOpen(false)} className="ml-auto text-gray-500 hover:text-gray-800">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <form onSubmit={handleCreatePost}>
                                <Textarea
                                    value={newPostContent}
                                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewPostContent(e.target.value)}
                                    placeholder="Share your story..."
                                    required
                                    rows={5}
                                    className="w-full p-2 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    disabled={!activeIdentity}
                                />
                                <div className="flex justify-end items-center mt-4 space-x-2">
                                    <div className="flex-grow"></div>
                                    <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={!activeIdentity || !newPostContent.trim()}>
                                        Post
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    {posts.map((post) => (
                        <div key={post._id} className="bg-white p-4 rounded-lg shadow-lg">
                            <div className="flex items-start">
                                <img
                                    src={profilePicUrl || `https://i.pravatar.cc/40?u=${post.userDid}`}
                                    alt="User profile"
                                    className="w-10 h-10 rounded-full mr-4"
                                />
                                <div className="flex-1">
                                    <p className="font-semibold">{post.userDid}</p>
                                    <p className="text-xs text-gray-500 mb-2">{new Date(post.createdAt).toLocaleString()}</p>
                                    <p className="whitespace-pre-wrap">{post.content}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
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
