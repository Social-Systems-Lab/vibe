import { Feed } from "@/app/components/Feed";

type PageProps = {
    params: Promise<{ feedId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FeedPage(props: PageProps) {
    // Await the params to get the feedId
    const params = await props.params;
    // The shared Layout + Content already provides the left (and optional right) panels.
    // This page should only render its main content.
    return <Feed feedId={params.feedId} />;
}
