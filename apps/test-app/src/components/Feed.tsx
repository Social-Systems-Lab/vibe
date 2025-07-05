import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";
import { CreatePost } from "./CreatePost";
import { PostCard } from "./PostCard";

export function Feed() {
    const { read, isLoggedIn } = useVibe();
    const [posts, setPosts] = useState<any[]>([]);

    useEffect(() => {
        if (!isLoggedIn) return;

        const subscription = read("posts");

        const handleData = (data: any) => {
            // Assuming the subscription returns the full list of docs
            setPosts(data.docs || []);
        };

        // This is a simplified subscription model.
        // In a real implementation, the subscription object would have
        // proper event listeners, e.g., subscription.on('data', handleData);
        const setupSubscription = async () => {
            const ws = await subscription;
            ws.on("message", (event: MessageEvent) => {
                const data = JSON.parse(event.data);
                // This is a placeholder for how real-time updates might work.
                // The actual implementation will depend on the backend's WebSocket logic.
                if (data.type === "initial" || data.type === "update") {
                    setPosts(data.payload);
                }
            });
        };

        setupSubscription();

        // Cleanup function
        return () => {
            // In a real implementation, we would close the WebSocket connection.
            // e.g., subscription.close();
        };
    }, [isLoggedIn, read]);

    if (!isLoggedIn) {
        return <p>Please log in to see the feed.</p>;
    }

    return (
        <div className="space-y-4">
            <CreatePost />
            {posts.map((post) => (
                <PostCard key={post._id} post={post} />
            ))}
        </div>
    );
}
