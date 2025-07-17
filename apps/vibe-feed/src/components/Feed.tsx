"use client";

import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";
import { CreatePost } from "./CreatePost";
import { PostCard } from "./PostCard";

export function Feed() {
    const { read, isLoggedIn } = useVibe();
    const [posts, setPosts] = useState<any[]>([]);

    useEffect(() => {
        if (!isLoggedIn) return;

        const processPosts = (result: { ok: boolean; data?: any; error?: string }) => {
            if (result.ok && result.data) {
                setPosts(result.data);
            } else if (result.error) {
                console.error("Failed to fetch posts:", result.error);
            }
        };

        const subscriptionPromise = read("posts", { global: true, expand: ["author"] }, processPosts);

        let subscription: { unsubscribe: () => void };
        subscriptionPromise.then((sub) => {
            subscription = sub;
        });

        return () => {
            if (subscription) {
                subscription.unsubscribe();
            }
        };
    }, [isLoggedIn, read]);

    if (!isLoggedIn) {
        return <p>Please log in to see the feed.</p>;
    }

    return (
        <div className="flex space-y-4 max-w-[680px] mx-auto flex-col">
            <div className="mb-2">
                <CreatePost />
            </div>
            {posts.map((post) => (
                <PostCard key={post._id} post={post} />
            ))}
        </div>
    );
}
