import React, { useState, useCallback } from "react";
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardDescription } from "@/components/ui/card"; // Only CardDescription is used from card
import { VibeLogo } from "@/components/ui/VibeLogo";
import {
    lastActiveDidHintAtom,
    isUnlockingAtom,
    unlockErrorAtom,
    appStatusAtom,
    // initializeAppStateAtom // Not directly set here, but could be if UNLOCK_VAULT returns a new state code
} from "../store/appAtoms";
import { allIdentitiesAtom } from "@/store/identityAtoms";
// Import for identity data loading if unlock is successful and we need to trigger it
// import { loadIdentityDataAtom } from "../store/identityAtoms"; // Example, might be a function atom

// Define ChromeMessage type, consider moving to a shared types file
interface ChromeMessage {
    type: string;
    payload?: any;
    error?: { message?: string; [key: string]: any };
    [key: string]: any;
}

export const UnlockPage: React.FC = () => {
    const [password, setPassword] = useState("");
    const [lastActiveDidHint] = useAtom(lastActiveDidHintAtom);
    const [isUnlocking, setIsUnlocking] = useAtom(isUnlockingAtom);
    const [unlockError, setUnlockError] = useAtom(unlockErrorAtom);
    const [, setAppStatus] = useAtom(appStatusAtom);
    // const [, setInitializeAppState] = useAtom(initializeAppStateAtom); // If needed
    const [, setLocation] = useLocation();
    const [allIdentities, setAllIdentities] = useAtom(allIdentitiesAtom);
    // const loadIdentities = useAtomCallback(loadIdentityDataAtom); // Example if using a function atom

    const handleUnlockSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!password || isUnlocking) return;

            setIsUnlocking(true);
            setUnlockError(null);

            try {
                const response = (await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "UNLOCK_VAULT",
                    payload: { password },
                    requestId: crypto.randomUUID().toString(),
                })) as ChromeMessage;

                if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                    setAppStatus("INITIALIZED_UNLOCKED"); // Update app status
                    // The useAppInitializer or a storage listener should ideally pick up the state change
                    // and redirect. Or, we can explicitly navigate.
                    // For now, let's assume useAppInitializer's storage listener will re-init and navigate,
                    // or DashboardPage will load data.
                    // If direct navigation is preferred:
                    setLocation("/");
                    // Optionally, trigger identity loading here if not handled by dashboard/initializer
                    // await loadIdentities();
                } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                    setUnlockError(response.error?.message || "Failed to unlock vault.");
                } else {
                    setUnlockError("Unexpected response from unlock operation.");
                }
            } catch (error: any) {
                console.error("Error during unlock submission:", error);
                setUnlockError(error.message || "An error occurred during unlock.");
            } finally {
                setIsUnlocking(false);
            }
        },
        [password, isUnlocking, setIsUnlocking, setUnlockError, setAppStatus, setLocation]
    );

    const handleResetVibe = async () => {
        if (confirm("Are you sure you want to reset Vibe? This will clear your stored data.")) {
            try {
                // Get all known identity DIDs to pass to the nuke function
                const didsToNuke = allIdentities.map((id) => id.did).filter((did) => !!did) as string[];
                console.log("SettingsPage: DIDs to nuke:", didsToNuke);

                // Instruct the background script to delete all PouchDB user databases
                await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "NUKE_ALL_USER_DATABASES",
                    payload: { userDids: didsToNuke }, // Pass the DIDs
                    requestId: crypto.randomUUID().toString(),
                });

                await chrome.storage.local.clear();
                await chrome.storage.session.clear(); // Clear session storage too
                // User databases are now requested to be nuked by the background script.

                alert("Vibe has been reset. The extension will now re-initialize.");
                setAppStatus("LOADING"); // Trigger re-initialization
                setLocation("/setup"); // Navigate to root, initializer will pick correct route
            } catch (err) {
                console.error("Error resetting storage:", err);
            }
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-background text-foreground">
            <div className="w-full max-w-sm">
                <div className="text-center flex flex-col items-center mb-8 mt-8">
                    <div className="mx-auto mb-4">
                        <VibeLogo className="h-12 w-auto" />
                    </div>
                    <div className="text-2xl font-semibold">Welcome Back!</div>
                    {lastActiveDidHint ? (
                        <CardDescription className="mt-1">
                            Unlock to access your Vibe Identity
                            {lastActiveDidHint !== "unknown" && ` (...${lastActiveDidHint.slice(-6)})`}.
                        </CardDescription>
                    ) : (
                        <CardDescription className="mt-1">Unlock your Vibe Vault to continue.</CardDescription>
                    )}
                </div>
                <div>
                    <form onSubmit={handleUnlockSubmit} className="space-y-4">
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
                                className="bg-input border-border placeholder:text-muted-foreground/70"
                            />
                        </div>
                        {unlockError && <p className="text-sm text-red-500 px-1">{unlockError}</p>}
                        <Button type="submit" className="w-full" disabled={isUnlocking || !password}>
                            {isUnlocking ? "Unlocking..." : "Unlock"}
                        </Button>
                        <Button onClick={handleResetVibe} variant="outline" className="w-full">
                            Reset Vibe
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Export default for lazy loading with React.lazy if needed in the future
export default UnlockPage;
