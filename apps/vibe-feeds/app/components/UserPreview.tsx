import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "vibe-react";
import { Button } from "vibe-react";
import { Card, CardContent } from "vibe-react";
import { MessageCircle, Heart, UserPlus, MapPin, Calendar, LinkIcon } from "lucide-react";

type UserPreviewProps = {
    user: {
        name: string;
        handle: string;
        avatar: string;
        coverImage: string;
        bio: string;
        location: string;
        joinedDate: string;
        website: string;
        followers: number;
        following: number;
        posts: number;
    };
};

export function UserPreview({ user }: UserPreviewProps) {
    return (
        <Card className="w-80 h-fit overflow-hidden">
            <CardContent className="p-0">
                {/* Cover Image */}
                <div className="relative h-32 bg-gradient-to-r from-blue-400 to-purple-500">
                    <Image src={user.coverImage || "/placeholder.svg?width=320&height=128&query=cover"} alt="Cover" fill className="object-cover" />
                </div>

                {/* Profile Section */}
                <div className="p-4">
                    {/* Avatar */}
                    <div className="relative -mt-12 mb-4">
                        <Avatar className="h-20 w-20 border-4 border-background">
                            <AvatarImage src={user.avatar || "/placeholder.svg"} />
                            <AvatarFallback className="text-xl">{user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                    </div>

                    {/* User Info */}
                    <div className="space-y-2">
                        <div>
                            <h3 className="font-bold text-lg">{user.name}</h3>
                            <p className="text-muted-foreground">@{user.handle}</p>
                        </div>

                        <p className="text-sm">{user.bio}</p>

                        {/* Meta Info */}
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            {user.location && (
                                <div className="flex items-center gap-1">
                                    <MapPin className="h-4 w-4" />
                                    <span>{user.location}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                <span>Joined {user.joinedDate}</span>
                            </div>
                            {user.website && (
                                <div className="flex items-center gap-1">
                                    <LinkIcon className="h-4 w-4" />
                                    <a href={user.website} className="text-blue-500 hover:underline">
                                        {user.website.replace("https://", "")}
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* Stats */}
                        <div className="flex gap-4 text-sm">
                            <span>
                                <strong>{user.following}</strong> Following
                            </span>
                            <span>
                                <strong>{user.followers}</strong> Followers
                            </span>
                            <span>
                                <strong>{user.posts}</strong> Posts
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-2 mt-4">
                        <Button size="sm" className="text-xs">
                            <UserPlus className="h-3 w-3 mr-1" />
                            Follow
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs bg-transparent">
                            <MessageCircle className="h-3 w-3 mr-1" />
                            Message
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs bg-transparent">
                            <Heart className="h-3 w-3 mr-1" />
                            Donate
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
