import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
// Removed Card components

const DEFAULT_VIBE_CLOUD_URL = "https://vibe-cloud-vp.vibeapp.dev"; // This might need to be updated if it's just for local testing

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
        <div className="flex flex-col items-center justify-start h-full space-y-5 w-full">
            {" "}
            {/* Removed p-6, adjusted space-y */}
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mt-2 mb-3" /> {/* Adjusted margin */}
            <div className="space-y-1 text-center">
                {" "}
                {/* Ensured text-center */}
                <h1 className="text-2xl font-semibold">Connect to Vibe Cloud</h1>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Choose the Vibe Cloud server for data storage and sync. Enter the claim code from your Vibe Cloud instance.
                </p>
            </div>
            <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 text-left">
                {/* URL Selection */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Vibe Cloud Server</Label>
                    <RadioGroup value={urlOption} onValueChange={(value: "default" | "custom") => setUrlOption(value)} className="space-y-1">
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="default" id="url-default" />
                            <Label htmlFor="url-default" className="text-sm font-normal">
                                Default ({DEFAULT_VIBE_CLOUD_URL})
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="custom" id="url-custom" />
                            <Label htmlFor="url-custom" className="text-sm font-normal">
                                Custom URL
                            </Label>
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
                            className="mt-2 text-sm"
                        />
                    )}
                </div>

                {/* Claim Code Input */}
                <div className="space-y-1">
                    <Label htmlFor="claim-code" className="text-sm font-medium">
                        Claim Code
                    </Label>
                    <Input
                        id="claim-code"
                        type="text"
                        value={claimCode}
                        onChange={(e) => setClaimCode(e.target.value.trim())}
                        placeholder="e.g., ABC1-XYZ9"
                        required
                        autoComplete="off"
                        className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground pt-1">Obtain this code from your Vibe Cloud server instance.</p>
                </div>

                {error && <p className="text-sm text-red-600 pt-1">{error}</p>}

                <Button
                    type="submit"
                    className="w-full bg-violet-500 hover:bg-violet-600 text-primary-foreground font-semibold py-3 text-base" // Added primary styles
                    disabled={!canProceed}
                >
                    Confirm Configuration & Finish Setup
                </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center max-w-sm pt-1">This connects your local Vibe identity to its cloud counterpart.</p>{" "}
            {/* Adjusted pt */}
        </div>
    );
}
