import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { AlertCircle, Copy } from "lucide-react"; // Icons for warning and copy

interface ShowPhraseStepProps {
    mnemonic: string;
    onPhraseConfirmed: () => void;
}

export function ShowPhraseStep({ mnemonic, onPhraseConfirmed }: ShowPhraseStepProps) {
    const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    const words = mnemonic.split(" ");

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(mnemonic);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000); // Reset after 2 seconds
        } catch (err) {
            console.error("Failed to copy mnemonic:", err);
            // TODO: Show error message to user?
        }
    }, [mnemonic]);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (hasConfirmedBackup) {
                onPhraseConfirmed();
            }
        },
        [hasConfirmedBackup, onPhraseConfirmed]
    );

    return (
        <Card className="w-full max-w-lg">
            {" "}
            {/* Increased max-width slightly */}
            <CardHeader>
                <CardTitle className="text-2xl">Your Secret Recovery Phrase</CardTitle>
                <CardDescription>
                    This 12/24-word phrase is the **master key** to your entire Vibe. Store it securely offline. **It will not be shown again.**
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Warning Box */}
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-md text-destructive flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-semibold">Never share this phrase with anyone!</p>
                        <p>Anyone with this phrase can take control of your Vibe identities forever.</p>
                        <p className="mt-1">Store it in a password manager, vault, or write it down physically in multiple secure locations.</p>
                    </div>
                </div>

                {/* Phrase Display */}
                <div className="grid grid-cols-3 gap-2 p-4 border rounded-md bg-muted/50 font-mono text-sm">
                    {words.map((word, index) => (
                        <div key={index} className="flex items-center">
                            <span className="text-muted-foreground w-6 mr-1">{index + 1}.</span>
                            <span>{word}</span>
                        </div>
                    ))}
                </div>

                {/* Copy Button */}
                <Button onClick={handleCopy} variant="outline" className="w-full">
                    <Copy className="mr-2 h-4 w-4" />
                    {copySuccess ? "Copied!" : "Copy Phrase"}
                </Button>

                {/* Confirmation Checkbox */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex items-center space-x-2 pt-4">
                        <Checkbox
                            id="confirm-backup"
                            checked={hasConfirmedBackup}
                            onCheckedChange={(checked) => setHasConfirmedBackup(Boolean(checked))} // Handle CheckedState
                        />
                        <Label htmlFor="confirm-backup" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            I have securely backed up my Secret Recovery Phrase.
                        </Label>
                    </div>

                    {/* Continue Button */}
                    <Button type="submit" className="w-full" disabled={!hasConfirmedBackup}>
                        Recovery Phrase Saved, Continue
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
                <p>Vibe cannot recover this phrase for you if you lose it.</p>
            </CardFooter>
        </Card>
    );
}
