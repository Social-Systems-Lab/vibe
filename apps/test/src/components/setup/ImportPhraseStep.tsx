import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea"; // Use Textarea for multi-word input
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { validateMnemonic } from "@/lib/crypto"; // Import validation helper

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
            if (!validateMnemonic(trimmedPhrase)) {
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
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl">Import Your Vibe</CardTitle>
                <CardDescription>Enter your 12 or 24-word Secret Recovery Phrase to restore your identities on this device.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="recovery-phrase">Secret Recovery Phrase</Label>
                        <Textarea
                            id="recovery-phrase"
                            value={phrase}
                            onChange={handlePhraseChange}
                            placeholder="Enter your 12 or 24 words separated by spaces..."
                            rows={4} // Adjust rows as needed
                            required
                            autoComplete="off"
                            spellCheck="false"
                        />
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <Button type="submit" className="w-full">
                        Verify Phrase
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
                <p>Ensure you enter the phrase correctly, including the order of the words.</p>
            </CardFooter>
        </Card>
    );
}
