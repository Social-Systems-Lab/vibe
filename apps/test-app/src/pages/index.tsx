import { Feed } from "@/components/Feed";

export default function HomePage() {
    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-4">Vibe Feed</h1>
            <Feed />
        </div>
    );
}
