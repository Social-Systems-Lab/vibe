import { appManifest } from "../../../lib/manifest";

export default function CommunityPulse() {
    // Phase 1: Placeholder metrics. Phase 2: fetch from `${appManifest.apiUrl}/api/metrics/community`
    const metrics = [
        { label: "New users (24h)", value: "~", hint: "Coming soon" },
        { label: "New apps (7d)", value: "~", hint: "Coming soon" },
        { label: "Active devs (7d)", value: "~", hint: "Coming soon" },
    ];

    return (
        <section className="w-full">
            <div className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl md:text-2xl font-heading">Community pulse</h2>
                    <span className="inline-flex items-center gap-2 text-xs text-foreground/60">
                        <span className="h-2 w-2 rounded-full bg-green-500/80 animate-pulse" />
                        Live metrics (soon)
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {metrics.map((m) => (
                        <div key={m.label} className="rounded-lg border border-border/60 bg-background/40 p-4 backdrop-blur">
                            <div className="text-3xl font-semibold tracking-tight">{m.value}</div>
                            <div className="text-sm text-foreground/70">{m.label}</div>
                            <div className="mt-1 text-[11px] text-foreground/50">{m.hint}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
