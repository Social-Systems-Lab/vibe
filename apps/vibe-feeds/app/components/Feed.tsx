"use client";

import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";
import { Post } from "vibe-sdk";
import { CreatePost } from "./CreatePost";
import { PostCard } from "./PostCard";

export function Feed({ feedId }: { feedId: string }) {
    const { read, readOnce, isLoggedIn, user } = useVibe();
    const [posts, setPosts] = useState<Post[]>([]);

    useEffect(() => {
        if (!isLoggedIn || !user) return;

        const processPosts = (result: { ok: boolean; data?: any; error?: string }) => {
            if (result.ok && result.data) {
                setPosts(result.data);
            } else if (result.error) {
                console.error("Failed to fetch posts:", result.error);
            }
        };

        let subscriptionPromise: Promise<{ unsubscribe: () => void }> | undefined;
        if (feedId === "discover") {
            // disabled until read is optimized
            //subscriptionPromise = read("posts", { global: true, expand: ["author"] }, processPosts);

            // read posts once
            readOnce<Post>("posts", { global: true, expand: ["author"] }).then((res) => {
                if (res && res.docs) {
                    setPosts(res.docs);
                } else {
                    console.error("Failed to fetch posts:", res);
                }
            });
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
    }, [isLoggedIn, user, read, feedId]);

    if (!isLoggedIn) {
        return <p>Please log in to see the feed.</p>;
    }

    return (
        <div className="max-w-[680px] mx-auto">
            <div className="mb-2 mr-[80px] lg:mr-0">
                <CreatePost />
            </div>
            {posts.map((post) => (
                <PostCard key={post._id} post={post} />
            ))}
        </div>
    );
}
