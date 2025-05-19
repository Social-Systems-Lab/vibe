import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Removed Card components
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "lucide-react";

interface NameIdentityStepProps {
    onIdentityNamed: (name: string | null, picture?: string | null) => void;
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
        <div className="flex flex-col items-center justify-start h-full p-6 space-y-6 text-center">
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mb-2" />

            <div className="space-y-1">
                <h1 className="text-2xl font-semibold">Profile Your First Identity</h1>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Give your first identity a recognizable name and optionally add a picture. This helps you identify it later. (Optional)
                </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 text-left">
                <div className="flex flex-col items-center space-y-3 pt-2">
                    <Avatar className="h-24 w-24">
                        {" "}
                        {/* Slightly larger Avatar */}
                        <AvatarImage src={picturePreview ?? undefined} alt={name || "Identity Avatar"} />
                        <AvatarFallback>
                            <User className="h-12 w-12 text-muted-foreground" />
                        </AvatarFallback>
                    </Avatar>
                    <Input id="picture-upload" type="file" accept="image/*" onChange={handlePictureChange} className="hidden" />
                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("picture-upload")?.click()} className="w-auto">
                        {picturePreview ? "Change Picture" : "Upload Picture"}
                    </Button>
                    {picturePreview && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPicturePreview(null)} className="text-xs text-muted-foreground">
                            Remove Picture
                        </Button>
                    )}
                </div>

                <div className="space-y-1">
                    <Label htmlFor="identity-name" className="text-sm font-medium">
                        Display Name (Optional)
                    </Label>
                    <Input
                        id="identity-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Personal, Main Work"
                        autoComplete="nickname"
                        className="text-sm"
                    />
                </div>

                <Button type="submit" className="w-full py-3 text-base">
                    Save Profile & Continue
                </Button>
            </form>

            <Button variant="link" onClick={handleSkip} className="text-sm text-muted-foreground hover:text-violet-500">
                Skip for now
            </Button>
        </div>
    );
}
