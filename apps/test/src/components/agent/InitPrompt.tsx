import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { AppManifest } from "../../vibe/types"; // Import AppManifest type

interface InitPromptProps {
    isOpen: boolean;
    manifest: AppManifest | null;
    onClick: () => void; // Called when the user clicks the prompt
}

export function InitPrompt({ isOpen, manifest, onClick }: InitPromptProps) {
    if (!isOpen || !manifest) {
        return null;
    }

    // Basic styling for top-right corner, adjust as needed
    const promptStyle: React.CSSProperties = {
        position: "fixed",
        top: "70px", // Position below typical header/IdentityPanel height
        right: "20px",
        zIndex: 100, // Ensure it's above other content
        maxWidth: "300px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    };

    return (
        <Card style={promptStyle} className="bg-background border-border animate-in fade-in slide-in-from-top-5 duration-300">
            <CardContent className="p-4 flex items-center gap-3 cursor-pointer" onClick={onClick}>
                <Avatar className="h-8 w-8">
                    {/* Use app picture if available, otherwise fallback */}
                    {manifest.pictureUrl ? <AvatarImage src={manifest.pictureUrl} alt={manifest.name} /> : null}
                    <AvatarFallback>{manifest.name.substring(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-sm">
                    <p className="font-medium">{manifest.name}</p>
                    <p className="text-muted-foreground text-xs">wants access to your Vibe data</p>
                </div>
                {/* Optional: Add a small arrow or chevron */}
                {/* <ChevronRightIcon className="h-4 w-4 text-muted-foreground" /> */}
            </CardContent>
            {/* No explicit buttons needed, the whole card is clickable */}
        </Card>
    );
}

// Helper Icon (if needed, or use one from lucide-react)
// function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
//   return (
//     <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <path d="m9 18 6-6-6-6" />
//     </svg>
//   )
// }
