import React from "react";
import { User, Smartphone } from "lucide-react";
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
                    <VibeLogo />
                </div>
                <CardTitle className="text-3xl font-bold">Set up Vibe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <button onClick={onCreateNew} className="w-full p-6 border rounded-xl hover:bg-accent transition-colors flex items-start gap-4 group">
                    <User className="w-12 h-12 text-primary" />
                    <div className="text-left flex-1">
                        <h3 className="text-xl font-semibold mb-2">I'm new to Vibe</h3>
                        <p className="text-sm text-muted-foreground">I don't have a seed phrase or any existing identities.</p>
                    </div>
                </button>

                <button onClick={onImportExisting} className="w-full p-6 border rounded-xl hover:bg-accent transition-colors flex items-start gap-4 group">
                    <Smartphone className="w-12 h-12 text-primary" />
                    <div className="text-left flex-1">
                        <h3 className="text-xl font-semibold mb-2">I have Vibe on another device</h3>
                        <p className="text-sm text-muted-foreground">I've created Vibe identities before and want to reuse them.</p>
                    </div>
                </button>
            </CardContent>
        </Card>
    );
}
