import React from "react";
import { Button } from "@/components/ui/button";
// Removed Card components
// Removed VibeLogo import, will use direct img tag
import { CheckCircle2 } from "lucide-react"; // Using a check icon for completion

interface SetupCompleteStepProps {
    identityName?: string;
    onStartUsingVibe: () => void;
}

export const SetupCompleteStep: React.FC<SetupCompleteStepProps> = ({ identityName, onStartUsingVibe }) => {
    return (
        <div className="flex flex-col items-center justify-center h-full p-6 space-y-6 text-center">
            {/* Using a CheckCircle icon instead of logo for completion visual cue */}
            <CheckCircle2 className="w-20 h-20 text-green-500 mb-2" />

            <div className="space-y-2">
                <h1 className="text-3xl font-semibold">Setup Complete!</h1>
                <p className="text-md text-muted-foreground max-w-sm">
                    Your Vibe Browser Extension is now set up and ready to use.
                    {identityName && <span className="block mt-1">Welcome, {identityName}!</span>}
                </p>
            </div>

            <p className="text-sm text-muted-foreground max-w-sm">
                You can now manage your digital identity and interact with Vibe-enabled applications securely.
            </p>

            <div className="w-full max-w-xs pt-4">
                <Button onClick={onStartUsingVibe} className="w-full py-3 text-base">
                    Start Using Vibe
                </Button>
            </div>
        </div>
    );
};
