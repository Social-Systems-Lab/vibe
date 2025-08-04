"use client";

import { Avatar, AvatarFallback, AvatarImage, Button } from "vibe-react";
import { UserPreview } from "./UserPreview";
import { useSelectedUser } from "../context/SelectedUserContext";

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
    const { selectedUser } = useSelectedUser();

    return <aside className="flex flex-col pt-20 space-y-8 p-4 pl-0 pr-2">{selectedUser && <UserPreview user={selectedUser} />}</aside>;
}
