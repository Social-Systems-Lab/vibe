"use client";

import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";

type MessageDoc = {
    _id?: string;
    id?: string;
    from?: string;
    to?: string;
    channel?: string;
    status?: string; // e.g., sent, delivered, failed
    createdAt?: string;
    updatedAt?: string;
    body?: any;
};

export default function MessagesPage() {
    const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
    const [token, setToken] = useState<string | null>(null);
    const [messages, setMessages] = useState<MessageDoc[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

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

    const loadMessages = async () => {
        if (!token) {
            setError("No API token. Ensure you are signed in.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // Placeholder: read from a 'messages' namespace if present
            const res = await fetch(`${apiBase}/data/messages/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error || `Failed to list messages (${res.status})`);
            }
            const data = await res.json();
            setMessages(Array.isArray(data?.docs) ? (data.docs as MessageDoc[]) : []);
        } catch (e: any) {
            setError(e?.message || "Failed to list messages");
            setMessages(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="w-full">
            <section className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-heading">Messages</h1>
                    <div className="text-xs text-foreground/60">Encrypted channels and delivery details coming soon</div>
                </div>

                {error && <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm mb-3">{error}</div>}

                <div className="flex items-center gap-2 mb-4">
                    <button
                        onClick={loadMessages}
                        disabled={loading || !token}
                        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                        {loading ? "Loading…" : "Load messages"}
                    </button>
                    {!token && <span className="text-xs text-foreground/60">Waiting for API token…</span>}
                </div>

                <div className="rounded-lg border border-border/60 bg-background/40 p-2 backdrop-blur">
                    {!messages && <div className="text-sm text-foreground/60">No data yet. Click “Load messages”.</div>}
                    {messages && messages.length === 0 && <div className="text-sm text-foreground/60">No messages found.</div>}
                    {messages && messages.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-foreground/70">
                                    <tr>
                                        <th className="py-2 pr-3">ID</th>
                                        <th className="py-2 pr-3">Channel</th>
                                        <th className="py-2 pr-3">From</th>
                                        <th className="py-2 pr-3">To</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2 pr-3">Created</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {messages.map((m) => (
                                        <tr key={m._id || m.id}>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{m._id || m.id || "-"}</code>
                                            </td>
                                            <td className="py-2 pr-3">{m.channel || "-"}</td>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{m.from || "-"}</code>
                                            </td>
                                            <td className="py-2 pr-3">
                                                <code className="text-xs">{m.to || "-"}</code>
                                            </td>
                                            <td className="py-2 pr-3">{m.status || "-"}</td>
                                            <td className="py-2 pr-3">{m.createdAt || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
