"use client";

import React, { useEffect, useState } from "react";

type ConsentEntry = {
    clientId: string;
    origin: string;
    manifest?: {
        appName?: string;
        appDescription?: string;
        appTagline?: string;
        appLogoUrl?: string;
        appLogotypeUrl?: string;
        appShowcaseUrl?: string;
        backgroundImageUrl?: string;
        backgroundColor?: string;
        buttonColor?: string;
        themeColor?: string;
    };
    addedAt?: string;
};

export default function AppGridPage() {
    const [consents, setConsents] = useState<ConsentEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchConsents = async () => {
            try {
                // Important: Use same-origin credentials through the API proxy
                const res = await fetch("/auth/me/consents", { credentials: "include" });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({} as any));
                    throw new Error(data?.error || `Failed to load consents (${res.status})`);
                }
                const data = await res.json();
                setConsents(data.consents || []);
                // Notify host the grid is ready
                try {
                    window.parent?.postMessage({ type: "appGridReady" }, "*");
                } catch {}
            } catch (e: any) {
                setError(e.message || "Failed to load");
            }
        };
        fetchConsents();
    }, []);

    const openApp = (c: ConsentEntry) => {
        const url = c.manifest?.appShowcaseUrl || c.manifest?.appLogoUrl || c.origin;
        try {
            window.open(url, "_blank", "noopener,noreferrer");
        } catch {}
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "transparent",
                padding: 16,
                boxSizing: "border-box",
                fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
                color: "var(--foreground, #111)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                }}
            >
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Your Apps</h2>
            </div>

            {error && (
                <div
                    style={{
                        padding: 12,
                        border: "1px solid #fca5a5",
                        background: "#fee2e2",
                        color: "#991b1b",
                        borderRadius: 8,
                        marginBottom: 12,
                    }}
                >
                    {error}
                </div>
            )}

            {!consents && !error && <div style={{ padding: 8, opacity: 0.7 }}>Loading...</div>}

            {consents && consents.length === 0 && <div style={{ padding: 8, opacity: 0.7 }}>No apps yet. Approve consent in an app to see it here.</div>}

            {consents && consents.length > 0 && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                        gap: 12,
                    }}
                >
                    {consents.map((c) => {
                        const title = c.manifest?.appName || new URL(c.origin).hostname.replace(/^www\./, "");
                        const icon = c.manifest?.appLogoUrl || c.manifest?.appLogotypeUrl;
                        const bg = c.manifest?.backgroundColor || "white";
                        const border = "1px solid rgba(0,0,0,0.08)";

                        return (
                            <button
                                key={`${c.clientId}:${c.origin}`}
                                onClick={() => openApp(c)}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 10,
                                    padding: 16,
                                    background: bg,
                                    border,
                                    borderRadius: 12,
                                    cursor: "pointer",
                                    transition: "box-shadow 120ms ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.08)")}
                                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                                title={title}
                            >
                                <div
                                    style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: 12,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background: "rgba(0,0,0,0.04)",
                                        overflow: "hidden",
                                    }}
                                >
                                    {icon ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={icon} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    ) : (
                                        <span style={{ fontSize: 28 }}>🟦</span>
                                    )}
                                </div>
                                <div
                                    style={{
                                        fontSize: 14,
                                        fontWeight: 600,
                                        textAlign: "center",
                                        lineHeight: 1.2,
                                        color: "inherit",
                                    }}
                                >
                                    {title}
                                </div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        opacity: 0.7,
                                        textAlign: "center",
                                    }}
                                >
                                    {new URL(c.origin).hostname}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
