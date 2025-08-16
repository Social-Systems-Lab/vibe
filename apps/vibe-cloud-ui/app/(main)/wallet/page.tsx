"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";

type BearerUser = {
    did: string;
    instanceId: string;
    displayName?: string;
    pictureUrl?: string;
};

export default function WalletPage() {
    const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<BearerUser | null>(null);
    const [encryptedKey, setEncryptedKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Helpers
    const copy = async (text?: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {}
    };

    // Acquire API token via cookie-auth
    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch(`${apiBase}/hub/api-token`, { credentials: "include" });
                if (!res.ok) throw new Error(`Token fetch failed (${res.status})`);
                const data = await res.json();
                setToken(data.token);
            } catch (e: any) {
                setError(e?.message || "Failed to get API token");
            }
        };
        run();
    }, [apiBase]);

    // Load user + encrypted key (Bearer)
    useEffect(() => {
        const run = async () => {
            if (!token) return;
            try {
                const [uRes, kRes] = await Promise.all([
                    fetch(`${apiBase}/users/me`, { headers: { Authorization: `Bearer ${token}` } }),
                    fetch(`${apiBase}/users/me/encrypted-key`, { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                if (!uRes.ok) throw new Error(`Failed to load user (${uRes.status})`);
                if (!kRes.ok) throw new Error(`Failed to load encrypted key (${kRes.status})`);
                const uData = await uRes.json();
                const kData = await kRes.json();
                setUser(uData.user as BearerUser);
                setEncryptedKey(kData.encryptedPrivateKey || null);
            } catch (e: any) {
                setError(e?.message || "Failed to load wallet data");
            }
        };
        run();
    }, [apiBase, token]);

    const maskedKey = encryptedKey && encryptedKey.length > 16 ? `${encryptedKey.slice(0, 8)}…${encryptedKey.slice(-8)}` : encryptedKey || "-";

    return (
        <main className="w-full">
            <section className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
                <h1 className="text-2xl font-heading mb-4">Wallet</h1>

                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                <div className="rounded-lg border border-border/60 bg-background/40 p-4 backdrop-blur">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">DID</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{user?.did || "-"}</div>
                                <button
                                    onClick={() => copy(user?.did)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        <div className="rounded-md border border-border/60 bg-background p-3">
                            <div className="text-xs text-foreground/60 mb-1">Instance ID</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{user?.instanceId || "-"}</div>
                                <button
                                    onClick={() => copy(user?.instanceId)}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        <div className="rounded-md border border-border/60 bg-background p-3 md:col-span-2">
                            <div className="text-xs text-foreground/60 mb-1">Encrypted private key</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{maskedKey}</div>
                                <button
                                    onClick={() => copy(encryptedKey || undefined)}
                                    disabled={!encryptedKey}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition disabled:opacity-50"
                                >
                                    Copy full
                                </button>
                            </div>
                            <div className="mt-2 text-[11px] text-foreground/60">
                                Keep this secure. You control export/import and rotation. Editing and rotation flows are coming soon.
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
