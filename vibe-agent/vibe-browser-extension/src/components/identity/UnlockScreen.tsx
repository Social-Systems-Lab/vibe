import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { VibeLogo } from "@/components/ui/VibeLogo"; // Assuming you have a logo component

interface UnlockScreenProps {
    lastActiveDidHint?: string; // Optional: To show a hint like "for ...xxxx"
    onUnlock: (password: string) => Promise<void>; // Parent handles calling background.ts
    isUnlocking: boolean;
    unlockError: string | null;
}

export const UnlockScreen: React.FC<UnlockScreenProps> = ({ lastActiveDidHint, onUnlock, isUnlocking, unlockError }) => {
    const [password, setPassword] = useState("");

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!password || isUnlocking) return;
            await onUnlock(password);
            // Parent (App.tsx) will handle UI transition on successful unlock via listeners
        },
        [password, isUnlocking, onUnlock]
    );

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4">
                        <VibeLogo className="h-12 w-auto" />
                    </div>
                    <CardTitle className="text-2xl">Welcome Back!</CardTitle>
                    {lastActiveDidHint && (
                        <CardDescription>
                            Unlock to access your Vibe Identity
                            {lastActiveDidHint !== "unknown" && ` (...${lastActiveDidHint.slice(-6)})`}.
                        </CardDescription>
                    )}
                    {!lastActiveDidHint && <CardDescription>Unlock your Vibe Vault to continue.</CardDescription>}
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your vault password"
                                required
                                autoFocus
                            />
                        </div>
                        {unlockError && <p className="text-sm text-red-500">{unlockError}</p>}
                        <Button type="submit" className="w-full" disabled={isUnlocking || !password}>
                            {isUnlocking ? "Unlocking..." : "Unlock"}
                        </Button>
                    </form>
                </CardContent>
                {/* Optional: Add a footer for links like "Forgot password?" or "Import existing seed?" if applicable */}
                {/* <CardFooter>
                    <p className="text-xs text-muted-foreground">...</p>
                </CardFooter> */}
            </Card>
        </div>
    );
};
