import Link from "next/link";
import { appManifest } from "../../../lib/manifest";

export default function WelcomeHero() {
    const tagline = appManifest.appTagline || "Build. Share. Belong.";
    const description = appManifest.appDescription || "A movement of apps and people — portable identity, portable content, portable connections.";

    return (
        <section className="w-full">
            <div className="max-w-5xl">
                <div className="flex flex-col items-start gap-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-foreground/70 backdrop-blur">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span>Vibe is evolving — join the movement</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-heading tracking-tight">Welcome to Vibe</h1>
                    <p className="max-w-2xl text-base md:text-lg text-foreground/80">
                        {tagline} — {description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <Link
                            href="/app-grid"
                            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
                        >
                            Explore Apps
                        </Link>
                        <Link
                            href="/developers"
                            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/30 transition"
                        >
                            Developer Portal
                        </Link>
                        <a
                            href="https://github.com/Social-Systems-Lab/vibe"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/30 transition"
                        >
                            GitHub
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}
