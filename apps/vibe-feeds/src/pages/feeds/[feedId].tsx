import { Feed } from "@/components/Feed";

export default function FeedsPage({ feedId }: { feedId: string }) {
    return <Feed feedId={feedId} />;
}
