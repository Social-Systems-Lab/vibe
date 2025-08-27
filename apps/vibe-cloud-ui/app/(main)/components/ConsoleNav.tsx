"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Grid, Database, HardDrive, Wallet, MessagesSquare, BadgeCheck, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { appManifest } from "../../lib/manifest";

export type ConsoleNavItem = {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    match: (pathname: string) => boolean;
};

export const consoleNavItems: ConsoleNavItem[] = [
    { href: "/profile", label: "Profile", icon: User, match: (p) => p.startsWith("/profile") },
    { href: "/apps", label: "Apps", icon: Grid, match: (p) => p.startsWith("/apps") },
    // { href: "/database", label: "Database", icon: Database, match: (p) => p.startsWith("/database") },
    { href: "/storage", label: "Storage", icon: HardDrive, match: (p) => p.startsWith("/storage") },
    // { href: "/wallet", label: "Wallet", icon: Wallet, match: (p) => p.startsWith("/wallet") },
    // { href: "/messages", label: "Messages", icon: MessagesSquare, match: (p) => p.startsWith("/messages") },
    // { href: "/certificates", label: "Certificates", icon: BadgeCheck, match: (p) => p.startsWith("/certificates") },
    // { href: "/development", label: "Development", icon: Wrench, match: (p) => p.startsWith("/development") },
];

export default function ConsoleNav() {
    const pathname = usePathname() || "";
    const apiBase = (appManifest.apiUrl || "").replace(/\/$/, "");
    const [token, setToken] = useState<string | null>(null);
    const [usage, setUsage] = useState<{ used_bytes: number; reserved_bytes: number; limit_bytes: number; burst_bytes: number; percent: number; tier?: string } | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);

    useEffect(() => {
        const getToken = async () => {
            try {
                const res = await fetch(`${apiBase}/hub/api-token`, { credentials: "include" });
                if (!res.ok) return;
                const data = await res.json();
                setToken(data.token);
            } catch {
                // ignore for nav
            }
        };
        getToken();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const loadUsage = async () => {
            if (!token) return;
            setUsageLoading(true);
            try {
                const res = await fetch(`${apiBase}/storage/usage`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                setUsage(data);
            } finally {
                setUsageLoading(false);
            }
        };
        loadUsage();
    }, [token, apiBase]);

    const formatBytes = (n?: number) => {
        if (typeof n !== "number") return "-";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let i = 0;
        let val = n;
        while (val >= 1024 && i < units.length - 1) {
            val /= 1024;
            i++;
        }
        return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    };

    return (
        <nav className="flex flex-col gap-2 h-full">
            <div className="p-3 py-0 space-y-1 flex-1">
                {consoleNavItems.map((it) => {
                    const active = it.match(pathname);
                    const Icon = it.icon;
                    return (
                        <Link
                            key={it.href}
                            href={it.href}
                            className={[
                                "inline-flex w-full items-center gap-3 rounded-md px-3 py-2 transition text-sm font-medium",
                                active ? "text-[#6d1da5] bg-gradient-to-r from-purple-50 to-blue-50" : "hover:bg-gray-50 text-foreground/90",
                            ].join(" ")}
                            // #ffac747d
                            // #88909f4d
                            aria-current={active ? "page" : undefined}
                        >
                            <Icon size={20} className={active ? "" : "text-foreground/80"} />
                            <span className="truncate">{it.label}</span>
                        </Link>
                    );
                })}
            </div>
            <div className="mt-auto px-4 pb-5">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground/60">Storage</span>
                    <span className="text-[11px] text-foreground/50">
                        {usageLoading ? "…" : usage ? `${formatBytes(usage.used_bytes)} / ${formatBytes(usage.limit_bytes)}` : "—"}
                    </span>
                </div>
                <div className="w-full h-2 rounded bg-gray-100 overflow-hidden">
                    <div
                        className="h-2 bg-primary transition-all"
                        style={{ width: `${Math.min(100, usage?.percent ?? 0)}%` }}
                    />
                </div>
            </div>
        </nav>
    );
}
