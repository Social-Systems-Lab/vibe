import React from "react";
import { ChevronRight } from "lucide-react";
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
                <button
                    onClick={onCreateNew}
                    className="w-full p-4 border rounded-lg hover:bg-accent transition-colors flex items-center justify-between group"
                >
                    <div className="text-left">
                        <h3 className="font-medium mb-1">Create New Vibe</h3>
                        <p className="text-sm text-muted-foreground">
                            If this is your first time, start here. Starts the setup wizard for a completely new set of identities.
                        </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>

                <button
                    onClick={onImportExisting}
                    className="w-full p-4 border rounded-lg hover:bg-accent transition-colors flex items-center justify-between group"
                >
                    <div className="text-left">
                        <h3 className="font-medium mb-1">I already have a Vibe</h3>
                        <p className="text-sm text-muted-foreground">
                            If you already have Vibe on another device, import or link it here. Restore your identities using a Secret Recovery Phrase or device
                            sync.
                        </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground text-center">
                <p>Your Vibe stores your keys locally and connects securely to your chosen Vibe Cloud.</p>
            </CardFooter>
        </Card>
    );
}
