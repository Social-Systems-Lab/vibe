import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

const DEFAULT_VIBE_CLOUD_URL = "http://127.0.0.1:3001"; // Default for local testing

interface ConfigureCloudStepProps {
    onCloudConfigured: (url: string, claimCode: string) => void;
}

export function ConfigureCloudStep({ onCloudConfigured }: ConfigureCloudStepProps) {
    const [urlOption, setUrlOption] = useState<"default" | "custom">("default");
    const [customUrl, setCustomUrl] = useState("");
    const [claimCode, setClaimCode] = useState("");
    const [error, setError] = useState<string | null>(null);

    const effectiveUrl = urlOption === "default" ? DEFAULT_VIBE_CLOUD_URL : customUrl;

    const canProceed = !!claimCode && !!effectiveUrl; // Basic check: need claim code and a URL

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            setError(null);

            if (!claimCode) {
                setError("Please enter a claim code.");
                return;
            }

            let finalUrl = "";
            if (urlOption === "default") {
                finalUrl = DEFAULT_VIBE_CLOUD_URL;
            } else {
                if (!customUrl) {
                    setError("Please enter a custom Vibe Cloud URL.");
                    return;
                }
                // Basic URL validation (can be improved)
                try {
                    new URL(customUrl);
                    finalUrl = customUrl;
                } catch (_) {
                    setError("Invalid custom URL format.");
                    return;
                }
            }

            console.log("Cloud configured:", { url: finalUrl, claimCode });
            onCloudConfigured(finalUrl, claimCode);
        },
        [urlOption, customUrl, claimCode, onCloudConfigured]
    );

    // Effect to clear custom URL if switching back to default
    useEffect(() => {
        if (urlOption === "default") {
            setCustomUrl("");
        }
    }, [urlOption]);

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl">Connect to Vibe Cloud</CardTitle>
                <CardDescription>
                    Choose the Vibe Cloud server this identity will connect to for data storage and synchronization. Enter the claim code provided by your Vibe
                    Cloud instance.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* URL Selection */}
                    <div className="space-y-2">
                        <Label>Vibe Cloud Server</Label>
                        <RadioGroup value={urlOption} onValueChange={(value: "default" | "custom") => setUrlOption(value)}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="default" id="url-default" />
                                <Label htmlFor="url-default">Default (for local testing: {DEFAULT_VIBE_CLOUD_URL})</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="custom" id="url-custom" />
                                <Label htmlFor="url-custom">Custom URL</Label>
                            </div>
                        </RadioGroup>
                        {urlOption === "custom" && (
                            <Input
                                id="custom-url"
                                type="url"
                                placeholder="https://your-vibe-cloud.com"
                                value={customUrl}
                                onChange={(e) => setCustomUrl(e.target.value)}
                                required={urlOption === "custom"}
                                className="mt-2"
                            />
                        )}
                    </div>

                    {/* Claim Code Input */}
                    <div className="space-y-2">
                        <Label htmlFor="claim-code">Claim Code</Label>
                        <Input
                            id="claim-code"
                            type="text"
                            value={claimCode}
                            onChange={(e) => setClaimCode(e.target.value.trim())}
                            placeholder="e.g., ABC1-XYZ9"
                            required
                            autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">Obtain this code from your Vibe Cloud server instance.</p>
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <Button type="submit" className="w-full" disabled={!canProceed}>
                        Confirm Configuration & Finish Setup
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
                <p>This connects your local Vibe identity to its cloud counterpart.</p>
            </CardFooter>
        </Card>
    );
}
