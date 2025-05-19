import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
// Removed Card components
import { validateMnemonic } from "@/lib/crypto";

interface ImportPhraseStepProps {
    onPhraseVerified: (mnemonic: string) => void;
}

export function ImportPhraseStep({ onPhraseVerified }: ImportPhraseStepProps) {
    const [phrase, setPhrase] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handlePhraseChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        // Normalize whitespace and handle potential extra spaces
        const normalizedPhrase = event.target.value.replace(/\s+/g, " ").trim();
        setPhrase(normalizedPhrase);
        setError(null); // Clear error on input change
    };

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            setError(null);
            const trimmedPhrase = phrase.trim();

            if (!trimmedPhrase) {
                setError("Please enter your Secret Recovery Phrase.");
                return;
            }

            // Validate the mnemonic
            console.log(`[ImportPhraseStep] Attempting to validate mnemonic: "${trimmedPhrase}"`);
            console.log(`[ImportPhraseStep] Mnemonic length (words): ${trimmedPhrase.split(" ").length}`);
            const isValid = validateMnemonic(trimmedPhrase);
            console.log(`[ImportPhraseStep] validateMnemonic result: ${isValid}`);

            if (!isValid) {
                setError("Invalid Secret Recovery Phrase. Please check the words and try again.");
                return;
            }

            // Phrase is valid, pass it back to the wizard
            console.log("Recovery phrase verified.");
            onPhraseVerified(trimmedPhrase);
        },
        [phrase, onPhraseVerified]
    );

    return (
        <div className="flex flex-col items-center justify-start h-full space-y-5 w-full">
            {" "}
            {/* Removed p-6, adjusted space-y */}
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mt-2 mb-3" /> {/* Adjusted margin */}
            <div className="space-y-1 text-center">
                {" "}
                {/* Ensured text-center */}
                <h1 className="text-2xl font-semibold">Import Your Vibe</h1>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Enter your 12 or 24-word Secret Recovery Phrase to restore your identities on this device.
                </p>
            </div>
            <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 text-left">
                <div className="space-y-1">
                    <Label htmlFor="recovery-phrase" className="text-sm font-medium">
                        Secret Recovery Phrase
                    </Label>
                    <Textarea
                        id="recovery-phrase"
                        value={phrase}
                        onChange={handlePhraseChange}
                        placeholder="Enter your 12 or 24 words separated by spaces..."
                        rows={4}
                        required
                        autoComplete="off"
                        spellCheck="false"
                        className="text-sm"
                    />
                </div>

                {error && <p className="text-sm text-red-600 pt-1">{error}</p>}

                <Button type="submit" className="w-full bg-violet-500 hover:bg-violet-600 text-primary-foreground font-semibold py-3 text-base">
                    {" "}
                    {/* Added primary styles */}
                    Verify Phrase
                </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center max-w-sm pt-1">
                Ensure you enter the phrase correctly, including the order of the words.
            </p>{" "}
            {/* Adjusted pt */}
        </div>
    );
}
