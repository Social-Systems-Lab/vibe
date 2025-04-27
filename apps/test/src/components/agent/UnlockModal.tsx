import React, { useState, useCallback, useEffect } from "react"; // Added useEffect
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VibeLogo } from "@/components/ui/VibeLogo";

interface UnlockModalProps {
    isOpen: boolean;
    onUnlock: (password: string) => Promise<void>; // Returns promise to handle async unlock and potential errors
    // onCancel: () => void; // Optional: If cancellation is allowed
}

export function UnlockModal({ isOpen, onUnlock }: UnlockModalProps) {
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleUnlockAttempt = useCallback(async () => {
        if (!password) {
            setError("Please enter your password.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await onUnlock(password);
            // Success! Modal will be closed by the parent component by setting isOpen=false
            setPassword(""); // Clear password field on success
        } catch (err) {
            console.error("Unlock failed:", err);
            setError(err instanceof Error ? err.message : "An unknown error occurred during unlock.");
        } finally {
            setIsLoading(false);
        }
    }, [password, onUnlock]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleUnlockAttempt();
    };

    // Reset state when modal is closed/opened
    useEffect(() => {
        if (!isOpen) {
            setPassword("");
            setError(null);
            setIsLoading(false);
        }
    }, [isOpen]);

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                // Prevent closing via overlay click or escape key if desired,
                // but typically unlocking should be mandatory if shown.
                // If !open, it means user tried to close it - decide if allowed.
                // For now, let it close, parent logic should re-trigger if needed.
                if (!open) {
                    console.log("Unlock modal closed by user interaction (overlay/escape).");
                    // onCancel?.(); // Call cancel handler if provided
                }
            }}
        >
            <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                {" "}
                {/* Prevent closing */}
                <DialogHeader className="text-center">
                    <div className="mx-auto mb-4 h-12 w-12">
                        <VibeLogo />
                    </div>
                    <DialogTitle>Unlock Vibe</DialogTitle>
                    <DialogDescription>Enter your device password to unlock your Vibe identities.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleFormSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="unlock-password">Password</Label>
                            <Input id="unlock-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
                        </div>
                        {error && <p className="text-sm text-red-600">{error}</p>}
                    </div>
                    <DialogFooter>
                        {/* Add Cancel button if needed */}
                        {/* <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>Cancel</Button> */}
                        <Button type="submit" disabled={isLoading || !password}>
                            {isLoading ? "Unlocking..." : "Unlock"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
