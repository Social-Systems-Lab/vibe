"use client";

import { Home, Users, Tv, Bookmark, Book, Code, Lightbulb, ChevronDown } from "lucide-react";

const mainNav = [
    { name: "Home", icon: Home, active: true },
    { name: "Collaborate", icon: Users },
    { name: "Shows", icon: Tv },
    { name: "Subscriptions", icon: Bookmark },
    { name: "Bookmarks", icon: Book },
];

const categories = [
    { name: "Dev Resources", icon: Code, active: true },
    { name: "Project Ideas", icon: Lightbulb },
];

export function LeftSidebar() {
    return (
        <aside className="hidden md:block p-4 space-y-8">
            <nav className="space-y-2">
                {mainNav.map((item) => (
                    <a
                        key={item.name}
                        href="#"
                        className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium ${
                            item.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                    >
                        <item.icon className="h-5 w-5" />
                        <span>{item.name}</span>
                    </a>
                ))}
            </nav>
            <div>
                <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</h3>
                <div className="mt-2 space-y-2">
                    {categories.map((item) => (
                        <a
                            key={item.name}
                            href="#"
                            className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium ${
                                item.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            }`}
                        >
                            <item.icon className="h-5 w-5" />
                            <span>{item.name}</span>
                        </a>
                    ))}
                </div>
            </div>
        </aside>
    );
}
