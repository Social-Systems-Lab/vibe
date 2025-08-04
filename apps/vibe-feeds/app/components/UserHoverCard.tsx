import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "vibe-react";
import { Button } from "vibe-react";
import { Card, CardContent } from "vibe-react";
import { UserPlus, MapPin, MessageCircle, Wallet } from "lucide-react";

type UserHoverCardProps = {
    user: {
        name: string;
        handle: string;
        avatar: string;
        coverImage: string;
        bio: string;
        location: string;
        followers: number;
        following: number;
        posts: number;
    };
};

export function UserHoverCard({ user }: UserHoverCardProps) {
    return (
        <div className="overflow-hidden">
            {/* Cover Image */}
            <div className="relative h-20 bg-gradient-to-r from-blue-400 to-purple-500">
                <Image src={user.coverImage || "/placeholder.svg?width=288&height=80&query=cover"} alt="Cover" fill className="object-cover" />
            </div>

            {/* Profile Section */}
            <div className="p-3">
                {/* Avatar */}
                <div className="relative -mt-8 mb-2">
                    <Avatar className="h-12 w-12 border-2 border-background">
                        <AvatarImage src={user.avatar || "/placeholder.svg"} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                </div>

                {/* User Info */}
                <div className="space-y-1 mb-3">
                    <div>
                        <h4 className="font-bold text-sm">{user.name}</h4>
                        <p className="text-muted-foreground text-xs">@{user.handle}</p>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">{user.bio}</p>

                    {/* Location */}
                    {user.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span>{user.location}</span>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="flex gap-3 text-xs">
                        <span>
                            <strong>{user.following}</strong> Following
                        </span>
                        <span>
                            <strong>{user.followers}</strong> Followers
                        </span>
                    </div>
                </div>

                {/* Action Buttons - More Compact */}
                <div className="grid grid-cols-3 gap-1">
                    <Button size="sm" className="text-xs h-7 px-2">
                        <UserPlus className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 px-2 bg-transparent">
                        <MessageCircle className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 px-2 bg-transparent">
                        <Wallet className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
