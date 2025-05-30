import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Removed Card components
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, PlusCircle, Loader2 } from "lucide-react";

// This should be a globally accessible constant or fetched from a config
const OFFICIAL_VIBE_CLOUD_URL = "https://vibe-cloud-cp.vibeapp.dev"; // Official Vibe Cloud Provisioning Service
const OFFICIAL_VIBE_CLOUD_NAME = "Official Vibe Cloud (Recommended)";

interface CloudServiceOption {
    id: string;
    name: string;
    url: string;
    isDefault?: boolean;
}

interface SetupIdentityStepProps {
    onIdentitySetup: (details: {
        identityName: string | null;
        identityPicture: string | null;
        cloudUrl: string;
        claimCode: string | null; // Claim code is optional now
    }) => Promise<void>; // Changed to Promise<void> to allow awaiting
}

export function SetupIdentityStep({ onIdentitySetup }: SetupIdentityStepProps) {
    const [identityName, setIdentityName] = useState("");
    const [picturePreview, setPicturePreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false); // Added loading state

    // Cloud configuration state
    const [configuredCloudServices, setConfiguredCloudServices] = useState<CloudServiceOption[]>([
        { id: "default", name: OFFICIAL_VIBE_CLOUD_NAME, url: OFFICIAL_VIBE_CLOUD_URL, isDefault: true },
    ]);
    const [selectedCloudServiceId, setSelectedCloudServiceId] = useState<string>("default");
    const [showCustomCloudForm, setShowCustomCloudForm] = useState(false);
    const [customCloudUrl, setCustomCloudUrl] = useState("");
    const [customClaimCode, setCustomClaimCode] = useState("");
    const [formError, setFormError] = useState<string | null>(null);

    const selectedService = configuredCloudServices.find((s) => s.id === selectedCloudServiceId) || configuredCloudServices[0];

    const handlePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setPicturePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleAddCustomCloud = () => {
        if (!customCloudUrl) {
            setFormError("Custom Vibe Cloud URL is required.");
            return;
        }
        try {
            new URL(customCloudUrl); // Basic validation
        } catch (_) {
            setFormError("Invalid Custom Vibe Cloud URL format.");
            return;
        }

        const newServiceId = `custom-${Date.now()}`;
        const newService: CloudServiceOption = {
            id: newServiceId,
            name: customCloudUrl, // Or derive a name
            url: customCloudUrl,
        };
        setConfiguredCloudServices((prev) => [...prev, newService]);
        setSelectedCloudServiceId(newServiceId);
        setShowCustomCloudForm(false);
        setCustomCloudUrl("");
        // Keep customClaimCode as it's for the newly added service
        setFormError(null);
    };

    const handleSelectCloudService = (serviceId: string) => {
        setSelectedCloudServiceId(serviceId);
        if (serviceId !== "add_new_custom") {
            setShowCustomCloudForm(false);
        } else {
            setShowCustomCloudForm(true);
        }
    };

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (isLoading) return; // Prevent multiple submissions

            setIsLoading(true);
            setFormError(null);

            let finalCloudUrl = selectedService.url;
            let finalClaimCode: string | null = null;

            if (selectedService.id.startsWith("custom-")) {
                // If a saved custom service is selected
                finalCloudUrl = selectedService.url;
                // If we decide custom saved services also need claim codes each time:
                // finalClaimCode = customClaimCode; // This implies claim code is re-entered or stored with service
                // For now, assume claim code is mainly for *adding* a new custom service
                // or if the selected custom service inherently requires one for this operation.
                // The current design has customClaimCode tied to the "add new" form.
                // If a custom service is selected from the list, it might not need a new claim code.
                // This part needs refinement based on how claim codes work with *saved* custom services.
                // For simplicity now, let's assume if a custom service is selected, we might need its claim code.
                // This is tricky: if they selected a *previously added* custom cloud, where is its claim code?
                // For now, let's assume the claim code field is only for *newly added* custom clouds.
                if (showCustomCloudForm && customCloudUrl === finalCloudUrl) {
                    // If they are in the process of adding the one they are submitting
                    finalClaimCode = customClaimCode.trim() || null;
                }
            } else if (selectedService.isDefault) {
                finalCloudUrl = OFFICIAL_VIBE_CLOUD_URL; // Ensure it's the official one
                finalClaimCode = null; // No claim code for default official service
            }

            // If they were in the "add new custom" form and hit submit directly
            if (showCustomCloudForm) {
                if (!customCloudUrl) {
                    setFormError("Custom Vibe Cloud URL is required if adding a new one.");
                    return;
                }
                try {
                    new URL(customCloudUrl);
                } catch (_) {
                    setFormError("Invalid Custom URL.");
                    return;
                }
                finalCloudUrl = customCloudUrl;
                finalClaimCode = customClaimCode.trim() || null;
            }

            try {
                await onIdentitySetup({
                    // Added await here
                    identityName: identityName.trim() || null,
                    identityPicture: picturePreview,
                    cloudUrl: finalCloudUrl,
                    claimCode: finalClaimCode,
                });
            } catch (error) {
                // Error should be handled by SetupWizard, but good to catch here too if needed
                console.error("Error during onIdentitySetup call in SetupIdentityStep:", error);
                setFormError(error instanceof Error ? error.message : "An unexpected error occurred during finalization.");
            } finally {
                setIsLoading(false);
            }
        },
        [identityName, picturePreview, selectedService, onIdentitySetup, showCustomCloudForm, customCloudUrl, customClaimCode, isLoading]
    );

    // Reset form if user navigates away from adding new custom cloud
    useEffect(() => {
        if (!showCustomCloudForm) {
            setCustomCloudUrl("");
            setCustomClaimCode("");
            setFormError(null);
        }
    }, [showCustomCloudForm]);

    return (
        <div className="flex flex-col items-center justify-start h-full space-y-5 w-full">
            {" "}
            {/* Removed p-6, adjusted space-y */}
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mt-2 mb-3" /> {/* Adjusted margin */}
            <div className="space-y-1 text-center">
                {" "}
                {/* Ensured text-center */}
                <h1 className="text-2xl font-semibold">Set Up Your Identity</h1>
                <p className="text-sm text-muted-foreground max-w-md">Personalize your Vibe identity and connect it to a Vibe Cloud service.</p>
            </div>
            <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-6 text-left">
                {/* Identity Name and Picture */}
                <div className="space-y-3 p-4 border border-border rounded-lg">
                    <h3 className="text-lg font-medium text-center mb-3">Identity Profile (Optional)</h3>
                    <div className="flex flex-col items-center space-y-2">
                        <Avatar className="h-20 w-20">
                            <AvatarImage src={picturePreview ?? undefined} alt={identityName || "Identity Avatar"} />
                            <AvatarFallback>
                                <User className="h-10 w-10 text-muted-foreground" />
                            </AvatarFallback>
                        </Avatar>
                        <Input id="picture-upload-setup" type="file" accept="image/*" onChange={handlePictureChange} className="hidden" />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById("picture-upload-setup")?.click()}
                            className="w-auto"
                        >
                            {picturePreview ? "Change Picture" : "Upload Picture"}
                        </Button>
                        {picturePreview && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setPicturePreview(null)} className="text-xs text-muted-foreground">
                                Remove Picture
                            </Button>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="identity-name-setup" className="text-sm font-medium">
                            Display Name
                        </Label>
                        <Input
                            id="identity-name-setup"
                            type="text"
                            value={identityName}
                            onChange={(e) => setIdentityName(e.target.value)}
                            placeholder="e.g., My Main Vibe"
                            autoComplete="nickname"
                            className="text-sm"
                        />
                    </div>
                </div>

                {/* Vibe Cloud Configuration */}
                <div className="space-y-3 p-4 border border-border rounded-lg">
                    <h3 className="text-lg font-medium text-center mb-3">Connect to Vibe Cloud</h3>
                    <div className="space-y-1">
                        <Label htmlFor="cloud-service-select-setup" className="text-sm font-medium">
                            Vibe Cloud Provider
                        </Label>
                        <select
                            id="cloud-service-select-setup"
                            value={selectedCloudServiceId}
                            onChange={(e) => handleSelectCloudService(e.target.value)}
                            className="w-full p-2 border rounded-md bg-background text-foreground text-sm focus:ring-ring focus:border-ring"
                        >
                            {configuredCloudServices.map((service) => (
                                <option key={service.id} value={service.id}>
                                    {service.name}
                                </option>
                            ))}
                            <option value="add_new_custom" className="font-medium text-violet-600">
                                + Add Custom Vibe Cloud
                            </option>
                        </select>
                    </div>

                    {(selectedCloudServiceId === "add_new_custom" || showCustomCloudForm) && (
                        <div className="space-y-3 p-3 border border-dashed rounded-md mt-2">
                            <h4 className="text-md font-medium text-center">Add New Custom Cloud</h4>
                            <div className="space-y-1">
                                <Label htmlFor="custom-cloud-url-setup" className="text-sm font-medium">
                                    Custom Vibe Cloud URL
                                </Label>
                                <Input
                                    id="custom-cloud-url-setup"
                                    type="url"
                                    value={customCloudUrl}
                                    onChange={(e) => {
                                        setCustomCloudUrl(e.target.value);
                                        setFormError(null);
                                    }}
                                    placeholder="https://your-custom-vibe.cloud"
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="custom-claim-code-setup" className="text-sm font-medium">
                                    Claim Code (Optional)
                                </Label>
                                <Input
                                    id="custom-claim-code-setup"
                                    type="text"
                                    value={customClaimCode}
                                    onChange={(e) => setCustomClaimCode(e.target.value)}
                                    placeholder="Provided by your custom cloud admin"
                                    autoComplete="off"
                                    className="text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Only needed if your custom Vibe Cloud instance requires it.</p>
                            </div>
                        </div>
                    )}
                </div>

                {formError && <p className="text-sm text-red-600 text-center pt-1">{formError}</p>}

                <Button
                    type="submit"
                    className="w-full bg-violet-500 hover:bg-violet-600 text-primary-foreground font-semibold py-3 text-base !mt-8" // Added primary styles
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        "Continue"
                    )}
                </Button>
            </form>
        </div>
    );
}
