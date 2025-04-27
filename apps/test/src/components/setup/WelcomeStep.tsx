import React from "react";
import { Button } from "@/components/ui/button"; // Assuming shadcn/ui button is available
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { VibeLogo } from "@/components/ui/VibeLogo"; // Assuming a Logo component exists

interface WelcomeStepProps {
    onCreateNew: () => void;
    onImportExisting: () => void;
}

export function WelcomeStep({ onCreateNew, onImportExisting }: WelcomeStepProps) {
    return (
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <div className="mx-auto mb-4 h-16 w-16">
                    {" "}
                    {/* Adjust size as needed */}
                    <VibeLogo />
                </div>
                <CardTitle className="text-2xl">Set up your Vibe</CardTitle>
                <CardDescription>Manage your digital identity securely and seamlessly across the web.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={onCreateNew} className="w-full" size="lg">
                    Create New Vibe
                </Button>
                <Button onClick={onImportExisting} className="w-full" variant="outline" size="lg">
                    I already have a Vibe
                </Button>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground text-center">
                <p>Your Vibe stores your keys locally and connects securely to your chosen Vibe Cloud.</p>
            </CardFooter>
        </Card>
    );
}
