import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
// Removed Card components
import { AlertCircle, Copy } from "lucide-react";

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
        <div className="flex flex-col items-center justify-start h-full space-y-5 w-full">
            {" "}
            {/* Removed p-6 */}
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mt-2 mb-3" /> {/* Adjusted margin */}
            <div className="space-y-1 text-center">
                {" "}
                {/* Ensured text-center */}
                <h1 className="text-2xl font-semibold">Your Secret Recovery Phrase</h1>
                <p className="text-sm text-muted-foreground max-w-md">
                    This {words.length}-word phrase is the **master key** to your entire Vibe. Store it securely offline.{" "}
                    <strong className="text-destructive">It will not be shown again.</strong>
                </p>
            </div>
            {/* Warning Box */}
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive flex items-start space-x-2 max-w-md text-left">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                    <p className="font-semibold">Never share this phrase with anyone!</p>
                    <p>Anyone with this phrase can take control of your Vibe identities forever.</p>
                    <p className="mt-1">Store it in a password manager, vault, or write it down physically in multiple secure locations.</p>
                </div>
            </div>
            {/* Phrase Display */}
            <div className="grid grid-cols-3 gap-x-3 gap-y-2 p-4 border rounded-md bg-muted/50 font-mono text-sm max-w-md w-full">
                {words.map((word, index) => (
                    <div key={index} className="flex items-center">
                        <span className="text-muted-foreground w-6 mr-1 select-none">{index + 1}.</span>
                        <span>{word}</span>
                    </div>
                ))}
            </div>
            {/* Copy Button */}
            <Button onClick={handleCopy} variant="outline" className="w-full max-w-md">
                <Copy className="mr-2 h-4 w-4" />
                {copySuccess ? "Copied!" : "Copy Phrase"}
            </Button>
            {/* Form for confirmation and continue */}
            <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 pt-2">
                <div className="flex items-center space-x-2 justify-center">
                    <Checkbox
                        id="confirm-backup"
                        checked={hasConfirmedBackup}
                        onCheckedChange={(checked) => setHasConfirmedBackup(Boolean(checked))}
                        className="form-checkbox h-4 w-4 text-violet-500 border-gray-300 rounded focus:ring-violet-400"
                    />
                    <Label htmlFor="confirm-backup" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        I have securely backed up my Secret Recovery Phrase.
                    </Label>
                </div>

                <Button
                    type="submit"
                    className="w-full bg-violet-500 hover:bg-violet-600 text-primary-foreground font-semibold py-3 text-base"
                    disabled={!hasConfirmedBackup}
                >
                    Recovery Phrase Saved, Continue
                </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center max-w-md pt-1">Vibe cannot recover this phrase for you if you lose it.</p>
        </div>
    );
}
