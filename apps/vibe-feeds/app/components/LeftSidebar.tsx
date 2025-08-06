"use client";

import { Globe, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const feeds = [
    { name: "Discover", href: "/feeds/discover", icon: Globe },
    { name: "Following", href: "/feeds/following", icon: Users },
] as const;

export function LeftSidebar() {
    const pathname = usePathname();

    return (
        <div className="invisible md:visible">
            <div className="fixed min-w-[200px] pt-[12px] pl-[30px]">
                <div className="space-y-2 pl-[2px]">
                    {feeds.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
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
