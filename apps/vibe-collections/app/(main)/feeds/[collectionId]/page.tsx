type PageProps = {
    params: Promise<{ collectionId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FeedPage(props: PageProps) {
    // Await the params to get the feedId
    const params = await props.params;
    return (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[240px_1fr_300px] max-w-7xl mx-auto">
            <div className="invisible md:visible space-y-8"></div>
            <div className="w-full">Collection Page {params.collectionId}</div>
            <div></div>
        </div>
    );
}
