import Link from "next/link";

type AppCard = {
    id: string;
    name: string;
    description: string;
    href: string;
    badge?: string;
};

const apps: AppCard[] = [
    {
        id: "feeds",
        name: "Vibe Feeds",
        description: "A personal social reader powered by your portable identity.",
        href: "/app-grid",
        badge: "New",
    },
    {
        id: "collections",
        name: "Vibe Collections",
        description: "Curate, remix, and share across apps.",
        href: "/app-grid",
    },
    {
        id: "notes",
        name: "Vibe Notes",
        description: "Write once, publish everywhere.",
        href: "/app-grid",
    },
    {
        id: "media",
        name: "Vibe Media",
        description: "Own your media, move it between apps.",
        href: "/app-grid",
    },
    {
        id: "chat",
        name: "Vibe Chat",
        description: "Portable conversations with real ownership.",
        href: "/app-grid",
    },
    {
        id: "studio",
        name: "Vibe Studio",
        description: "Build, test, and ship Vibe apps.",
        href: "/app-grid",
    },
];

function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-foreground/70">
            {children}
        </span>
    );
}

export default function DiscoverAppsGrid() {
    return (
        <section className="w-full">
            <div className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl md:text-2xl font-heading">Discover apps</h2>
                    <Link href="/app-grid" className="text-xs text-foreground/70 hover:text-primary">
                        See all →
                    </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {apps.map((app) => (
                        <Link
                            key={app.id}
                            href={app.href}
                            className="group rounded-lg border border-border/60 bg-background/40 p-4 hover:bg-accent/10 transition backdrop-blur"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-base font-medium">{app.name}</div>
                                {app.badge ? <Pill>{app.badge}</Pill> : null}
                            </div>
                            <p className="text-sm text-foreground/70">{app.description}</p>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
