import Link from "next/link";

export default function DevelopersPage() {
    return (
        <main className="w-full">
            <section className="mx-auto max-w-5xl px-4 md:px-6 py-10 md:py-14">
                <div className="flex flex-col gap-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-foreground/70 backdrop-blur">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span>Developer Portal</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-heading tracking-tight">Build on Vibe</h1>
                    <p className="max-w-2xl text-base md:text-lg text-foreground/80">
                        Create portable apps with user-owned identity, content, and connections. Explore the SDKs, examples, and API to get started.
                    </p>
                    <div className="flex items-center gap-3 pt-2">
                        <a
                            href="https://github.com/Social-Systems-Lab/vibe"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/30 transition"
                        >
                            GitHub Repo
                        </a>
                        <Link
                            href="/app-grid"
                            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/30 transition"
                        >
                            Example Apps
                        </Link>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-5xl px-4 md:px-6 pb-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <a
                        className="rounded-lg border border-border/60 bg-background/40 p-4 hover:bg-accent/10 transition backdrop-blur"
                        href="https://github.com/Social-Systems-Lab/vibe/blob/main/docs/VibeReactSDK.md"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <div className="text-base font-medium">Quickstart (React)</div>
                        <div className="text-foreground/70 text-xs mt-1">Build your first Vibe app with the React SDK</div>
                    </a>
                    <a
                        className="rounded-lg border border-border/60 bg-background/40 p-4 hover:bg-accent/10 transition backdrop-blur"
                        href="https://github.com/Social-Systems-Lab/vibe/tree/main/packages/vibe-sdk"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <div className="text-base font-medium">TypeScript SDK</div>
                        <div className="text-foreground/70 text-xs mt-1">Core primitives and client utilities</div>
                    </a>
                    <a
                        className="rounded-lg border border-border/60 bg-background/40 p-4 hover:bg-accent/10 transition backdrop-blur"
                        href="https://github.com/Social-Systems-Lab/vibe/tree/main/apps/vibe-cloud-api"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <div className="text-base font-medium">Cloud API</div>
                        <div className="text-foreground/70 text-xs mt-1">Services backing identity, data, and feeds</div>
                    </a>
                    <Link className="rounded-lg border border-border/60 bg-background/40 p-4 hover:bg-accent/10 transition backdrop-blur" href="/app-grid">
                        <div className="text-base font-medium">Example Apps</div>
                        <div className="text-foreground/70 text-xs mt-1">See live apps and reference implementations</div>
                    </Link>
                    <a
                        className="rounded-lg border border-border/60 bg-background/40 p-4 hover:bg-accent/10 transition backdrop-blur"
                        href="https://github.com/Social-Systems-Lab/vibe/blob/main/docs/Structure.md"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <div className="text-base font-medium">Monorepo Structure</div>
                        <div className="text-foreground/70 text-xs mt-1">Understand packages, apps, and infra</div>
                    </a>
                    <a
                        className="rounded-lg border border-border/60 bg-background/40 p-4 hover:bg-accent/10 transition backdrop-blur"
                        href="https://github.com/Social-Systems-Lab/vibe/releases"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <div className="text-base font-medium">Changelog</div>
                        <div className="text-foreground/70 text-xs mt-1">Keep up with new features and fixes</div>
                    </a>
                </div>
            </section>
        </main>
    );
}
