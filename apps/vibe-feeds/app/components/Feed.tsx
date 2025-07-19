"use client";

import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";
import { CreatePost } from "./CreatePost";
import { PostCard } from "./PostCard";

export function Feed({ feedId }: { feedId: string }) {
    const { read, readOnce, isLoggedIn, user } = useVibe();
    const [posts, setPosts] = useState<any[]>([]);
    const [following, setFollowing] = useState<string[]>([]);

    useEffect(() => {
        if (!isLoggedIn || !user) return;

        const fetchFollowing = async () => {
            const profileDoc = await readOnce("profiles", { did: user.did });
            if (profileDoc.ok && profileDoc.data.length > 0) {
                setFollowing(profileDoc.data[0].following || []);
            }
        };

        fetchFollowing();

        const processPosts = (result: { ok: boolean; data?: any; error?: string }) => {
            if (result.ok && result.data) {
                setPosts(result.data);
            } else if (result.error) {
                console.error("Failed to fetch posts:", result.error);
            }
        };

        let subscriptionPromise: Promise<{ unsubscribe: () => void }> | undefined;

        if (feedId === "discover") {
            subscriptionPromise = read("posts", { global: true, expand: ["author"] }, processPosts);
        } else if (feedId === "following" && following.length > 0) {
            subscriptionPromise = read("posts", { author: { $in: following }, expand: ["author"] }, processPosts);
        }

        if (!subscriptionPromise) {
            setPosts([]);
            return;
        }

        let subscription: { unsubscribe: () => void };
        subscriptionPromise.then((sub) => {
            subscription = sub;
        });

        return () => {
            if (subscription) {
                subscription.unsubscribe();
            }
        };
    }, [isLoggedIn, user, read, feedId, following]);

    if (!isLoggedIn) {
        return <p>Please log in to see the feed.</p>;
    }

    return (
        <div className="max-w-[680px] mx-auto">
            <div className="mb-2">
                <CreatePost />
            </div>
            {posts.map((post) => (
                <PostCard key={post._id} post={post} />
            ))}
        </div>
    );
}
