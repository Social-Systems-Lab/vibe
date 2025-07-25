import { Feed } from "@/app/components/Feed";
import { LeftSidebar } from "@/app/components/LeftSidebar";

type PageProps = {
    params: Promise<{ feedId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FeedPage(props: PageProps) {
    // Await the params to get the feedId
    const params = await props.params;
    return (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[240px_1fr_300px] max-w-7xl mx-auto">
            <LeftSidebar />
            <div className="w-full">
                <Feed feedId={params.feedId} />
            </div>
            <div></div>
        </div>
    );
}
