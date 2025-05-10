import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Assuming shadcn/ui avatar
import { User } from "lucide-react"; // Default icon

interface NameIdentityStepProps {
    onIdentityNamed: (name: string | null, picture?: string | null) => void; // Pass name (null if skipped) and optional picture data URL
}

export function NameIdentityStep({ onIdentityNamed }: NameIdentityStepProps) {
    const [name, setName] = useState("");
    const [picturePreview, setPicturePreview] = useState<string | null>(null);
    // TODO: Add state for actual picture file/data if implementing upload

    const handleSkip = useCallback(() => {
        onIdentityNamed(null, null); // Pass nulls if skipped
    }, [onIdentityNamed]);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            // Pass the entered name (or null if empty) and picture data
            onIdentityNamed(name.trim() || null, picturePreview);
        },
        [name, picturePreview, onIdentityNamed]
    );

    // Placeholder for file input handling
    const handlePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            // Basic validation (e.g., file type, size) could go here
            const reader = new FileReader();
            reader.onloadend = () => {
                setPicturePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
            console.log("Picture selected:", file.name);
            // TODO: Handle potential errors during file reading
        }
    };

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl">Profile Your First Identity</CardTitle>
                <CardDescription>
                    Give your first identity a recognizable name and optionally add a picture. This helps you identify it later. (Optional)
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Picture Upload Placeholder */}
                    <div className="flex flex-col items-center space-y-2">
                        <Avatar className="h-20 w-20 mb-2">
                            <AvatarImage src={picturePreview ?? undefined} alt={name || "Identity Avatar"} />
                            <AvatarFallback>
                                <User className="h-10 w-10" />
                            </AvatarFallback>
                        </Avatar>
                        <Input id="picture-upload" type="file" accept="image/*" onChange={handlePictureChange} className="hidden" />
                        <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("picture-upload")?.click()}>
                            {picturePreview ? "Change Picture" : "Upload Picture"}
                        </Button>
                        {picturePreview && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setPicturePreview(null)}>
                                Remove Picture
                            </Button>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="identity-name">Display Name (Optional)</Label>
                        <Input
                            id="identity-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Personal, Main"
                            autoComplete="nickname"
                        />
                    </div>

                    <Button type="submit" className="w-full">
                        Save Profile & Continue
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="flex justify-center">
                <Button variant="link" onClick={handleSkip}>
                    Skip for now
                </Button>
            </CardFooter>
        </Card>
    );
}
