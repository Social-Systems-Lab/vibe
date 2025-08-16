import Link from "next/link";

export default function DeveloperPortalPromo() {
    return (
        <section className="w-full">
            <div className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-10">
                <div className="rounded-xl border border-border/60 bg-background/40 p-6 md:p-8 backdrop-blur">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h2 className="text-xl md:text-2xl font-heading">Build on Vibe</h2>
                            <p className="mt-1 text-sm text-foreground/70">Create portable apps with user-owned identity, content, and connections.</p>
                        </div>
                        <Link
                            href="/developers"
                            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
                        >
                            Open Developer Portal
                        </Link>
                    </div>

                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <a
                            className="rounded-lg border border-border/60 bg-background/40 p-3 hover:bg-accent/10 transition"
                            href="https://github.com/Social-Systems-Lab/vibe/blob/main/docs/VibeReactSDK.md"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <div className="font-medium">Quickstart</div>
                            <div className="text-foreground/70 text-xs">Get started with Vibe React SDK</div>
                        </a>
                        <a
                            className="rounded-lg border border-border/60 bg-background/40 p-3 hover:bg-accent/10 transition"
                            href="https://github.com/Social-Systems-Lab/vibe/tree/main/packages/vibe-sdk"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <div className="font-medium">SDK</div>
                            <div className="text-foreground/70 text-xs">Core TypeScript SDK</div>
                        </a>
                        <a className="rounded-lg border border-border/60 bg-background/40 p-3 hover:bg-accent/10 transition" href="/app-grid">
                            <div className="font-medium">Example apps</div>
                            <div className="text-foreground/70 text-xs">Explore live apps and patterns</div>
                        </a>
                        <a
                            className="rounded-lg border border-border/60 bg-background/40 p-3 hover:bg-accent/10 transition"
                            href="https://github.com/Social-Systems-Lab/vibe/tree/main/apps/vibe-cloud-api"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <div className="font-medium">API</div>
                            <div className="text-foreground/70 text-xs">Cloud API service</div>
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}
