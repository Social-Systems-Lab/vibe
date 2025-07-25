"use client";

import { Avatar, AvatarFallback, AvatarImage, Button } from "vibe-react";

const topCommunities = [
    { name: "Introductions", icon: "👋" },
    { name: "What's New On Sh...", icon: "✨" },
    { name: "HackerNews", icon: "HN" },
    { name: "Porfolios", icon: "💼" },
    { name: "React.JS", icon: "⚛️" },
];

const suggestedPeople = [
    { name: "Florin Pop", handle: "@florinpop17", avatar: "" },
    { name: "Patrick Loeber", handle: "@patrickloeber", avatar: "" },
    { name: "Favor", handle: "@theyonuoha", avatar: "" },
    { name: "Chris Bongers", handle: "@dailydevtips", avatar: "" },
    { name: "Alvaro Saburido", handle: "@alvarosaburido", avatar: "" },
];

const trendingShows = [
    { name: "Why this is the Time to Build Showcase", author: "Rong", date: "12 Mar", category: "Showwcase" },
    { name: "TryShape - Give your Creativity a Shape", author: "Scott Spence", date: "12 Mar", category: "Workflow" },
    { name: "Introducing the Theming System", author: "Tapas Adhikary", date: "12 Mar", category: "Coding" },
];

export function RightSidebar() {
    return (
        <aside className="hidden lg:block p-4 space-y-8">
            <div className="bg-background p-4 rounded-lg border border-border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">Top Communities</h3>
                    <a href="#" className="text-sm text-blue-500">
                        See All
                    </a>
                </div>
                <div className="space-y-3">
                    {topCommunities.map((item) => (
                        <div key={item.name} className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gray-200 rounded-md flex items-center justify-center text-sm">{item.icon}</div>
                            <span className="font-medium">{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-background p-4 rounded-lg border border-border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">Suggested People</h3>
                    <a href="#" className="text-sm text-blue-500">
                        See All
                    </a>
                </div>
                <div className="space-y-4">
                    {suggestedPeople.map((person) => (
                        <div key={person.name} className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <Avatar>
                                    <AvatarImage src={person.avatar} />
                                    <AvatarFallback>{person.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold">{person.name}</p>
                                    <p className="text-sm text-gray-500">{person.handle}</p>
                                </div>
                            </div>
                            <Button size="sm" variant="outline">
                                Follow
                            </Button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-background p-4 rounded-lg border border-border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">Trending Shows</h3>
                </div>
                <div className="space-y-4">
                    {trendingShows.map((show) => (
                        <div key={show.name}>
                            <p className="font-semibold">{show.name}</p>
                            <p className="text-sm text-gray-500">
                                {show.author} · {show.date} · {show.category}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}
