"use client";
"use client";

import { Globe, Users } from "lucide-react";
import { Link } from "waku/router/client";

const feeds = [
    { name: "Discover", href: "/feeds/discover", icon: Globe },
    { name: "Following", href: "/feeds/following", icon: Users },
] as const;

export function LeftSidebar() {
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";

    return (
        <aside className="hidden md:block p-4 space-y-8">
            <div>
                <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Feeds</h3>
                <div className="mt-2 space-y-2">
                    {feeds.map((item) => (
                        <Link
                            key={item.name}
                            to={item.href}
                            className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium ${
                                pathname === item.href ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            }`}
                        >
                            <item.icon className="h-5 w-5" />
                            <span>{item.name}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </aside>
    );
}
