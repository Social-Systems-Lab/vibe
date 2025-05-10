import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { VibeLogo } from "@/components/ui/VibeLogo";

interface SetupCompleteStepProps {
    identityName?: string;
    onStartUsingVibe: () => void;
}

export const SetupCompleteStep: React.FC<SetupCompleteStepProps> = ({ identityName, onStartUsingVibe }) => {
    return (
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <div className="mx-auto mb-4">
                    <VibeLogo width={60} height={60} />
                </div>
                <CardTitle className="text-2xl">Setup Complete!</CardTitle>
                <CardDescription>
                    Your Vibe Browser Extension is now set up and ready to use.
                    {identityName && ` Welcome, ${identityName}!`}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                    You can now manage your digital identity and interact with Vibe-enabled applications securely.
                </p>
            </CardContent>
            <CardFooter>
                <Button onClick={onStartUsingVibe} className="w-full">
                    Start Using Vibe
                </Button>
            </CardFooter>
        </Card>
    );
};
