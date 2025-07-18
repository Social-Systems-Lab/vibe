"use client";

import { Globe, Users } from "lucide-react";
import { Link } from "waku/router/client";
import { useState, useEffect } from "react";

const feeds = [
    { name: "Discover", href: "/feeds/discover", icon: Globe },
    { name: "Following", href: "/feeds/following", icon: Users },
] as const;

export function LeftSidebar() {
    const [pathname, setPathname] = useState(typeof window !== "undefined" ? window.location.pathname : "");

    useEffect(() => {
        const onLocationChange = () => {
            setPathname(window.location.pathname);
        };
        // Listen for client-side navigation events
        const observer = new MutationObserver(() => {
            onLocationChange();
        });
        observer.observe(document, { childList: true, subtree: true });

        // Listen for popstate events (browser back/forward)
        window.addEventListener("popstate", onLocationChange);

        return () => {
            observer.disconnect();
            window.removeEventListener("popstate", onLocationChange);
        };
    }, []);

    return (
        <div className="hidden md:block space-y-8">
            <div className="space-y-4 fixed min-w-[200px] pt-[12px] pl-[30px]">
                <div className="flex items-center space-x-2 px-3">
                    <img src="/images/logo3.png" alt="Vibe" className="h-8 w-8" />
                    <span className="font-semibold text-lg">Feeds</span>
                </div>
                <div className="space-y-2 pt-4">
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
        </div>
    );
}
