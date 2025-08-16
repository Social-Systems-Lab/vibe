"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Grid, Database, HardDrive, Wallet, MessagesSquare, BadgeCheck, Wrench } from "lucide-react";

type Item = {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    match: (pathname: string) => boolean;
};

const items: Item[] = [
    { href: "/profile", label: "Profile", icon: User, match: (p) => p.startsWith("/profile") },
    { href: "/apps", label: "Apps", icon: Grid, match: (p) => p.startsWith("/apps") },
    { href: "/database", label: "Database", icon: Database, match: (p) => p.startsWith("/database") },
    { href: "/storage", label: "Storage", icon: HardDrive, match: (p) => p.startsWith("/storage") },
    { href: "/wallet", label: "Wallet", icon: Wallet, match: (p) => p.startsWith("/wallet") },
    { href: "/messages", label: "Messages", icon: MessagesSquare, match: (p) => p.startsWith("/messages") },
    { href: "/certificates", label: "Certificates", icon: BadgeCheck, match: (p) => p.startsWith("/certificates") },
    { href: "/development", label: "Development", icon: Wrench, match: (p) => p.startsWith("/development") },
];

export default function ConsoleNav() {
    const pathname = usePathname() || "";

    return (
        <nav className="flex flex-col gap-2 h-full bg-[#fbfbfb]">
            <div className="p-3">
                {items.map((it) => {
                    const active = it.match(pathname);
                    const Icon = it.icon;
                    return (
                        <Link
                            key={it.href}
                            href={it.href}
                            className={[
                                "inline-flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-[1.15rem] transition",
                                active ? "font-semibold text-foreground" : "hover:bg-[#ffac742d] text-foreground/90",
                            ].join(" ")}
                            // #ffac747d
                            // #88909f4d
                            aria-current={active ? "page" : undefined}
                        >
                            <Icon size={20} className={active ? "text-foreground" : "text-foreground/80"} />
                            <span className="truncate">{it.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
