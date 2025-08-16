import Link from "next/link";

type FeedItem = {
    id: string;
    title: string;
    kind: "app" | "update" | "milestone";
    summary: string;
    href?: string;
};

const placeholder: FeedItem[] = [
    {
        id: "1",
        title: "New app: Vibe Feeds",
        kind: "app",
        summary: "A social reader powered by your portable identity.",
        href: "/app-grid",
    },
    {
        id: "2",
        title: "Milestone: 1.0.0-alpha",
        kind: "milestone",
        summary: "First alpha of the Vibe SDKs shipped.",
        href: "https://github.com/Social-Systems-Lab/vibe",
    },
    {
        id: "3",
        title: "Update: Collections UI",
        kind: "update",
        summary: "Improved onboarding and discoverability.",
        href: "/app-grid",
    },
];

function Badge({ kind }: { kind: FeedItem["kind"] }) {
    const map = {
        app: "bg-blue-600/20 text-blue-300",
        update: "bg-yellow-600/20 text-yellow-300",
        milestone: "bg-purple-600/20 text-purple-300",
    } as const;
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${map[kind]}`}>{kind}</span>;
}

export default function WhatsNewFeed() {
    // Phase 1: Placeholder. Phase 2: fetch from Cloud API (REST or SSE)
    return (
        <section className="w-full">
            <div className="max-w-5xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl md:text-2xl font-heading">What's new</h2>
                    <Link href="/app-grid" className="text-xs text-foreground/70 hover:text-primary">
                        Explore all apps →
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {placeholder.map((item) => {
                        const Card = (
                            <div className="h-full rounded-lg border border-border/60 bg-background/40 p-4 backdrop-blur">
                                <div className="flex items-center justify-between mb-2">
                                    <Badge kind={item.kind} />
                                </div>
                                <div className="text-base font-medium mb-1">{item.title}</div>
                                <p className="text-sm text-foreground/70">{item.summary}</p>
                            </div>
                        );
                        return item.href ? (
                            <Link key={item.id} href={item.href} className="block hover:bg-accent/10 rounded-lg transition">
                                {Card}
                            </Link>
                        ) : (
                            <div key={item.id}>{Card}</div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
