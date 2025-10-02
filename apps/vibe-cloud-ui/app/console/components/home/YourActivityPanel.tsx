export default function YourActivityPanel() {
    // Phase 1: Placeholder. Phase 2: fetch recent user activity and notifications.
    const items: { id: string; text: string; when: string }[] = [];

    return (
        <section className="w-full">
            <div className="max-w-5xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl md:text-2xl font-heading">Your activity</h2>
                </div>

                {items.length === 0 ? (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-6 text-sm text-foreground/70 backdrop-blur">
                        <div className="font-medium text-foreground mb-1">No recent activity</div>
                        <p>Start exploring apps and connecting with others — your activity will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {items.map((it) => (
                            <div key={it.id} className="rounded-md border border-border/60 bg-background/40 p-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <div>{it.text}</div>
                                    <div className="text-xs text-foreground/60">{it.when}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
