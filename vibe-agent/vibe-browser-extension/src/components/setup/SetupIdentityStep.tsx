import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, PlusCircle } from "lucide-react"; // ChevronDown removed
// DropdownMenu imports removed

// This should be a globally accessible constant or fetched from a config
const OFFICIAL_VIBE_CLOUD_URL = "https://vibe-cloud-vp.vibeapp.dev"; // Official Vibe Cloud Provisioning Service
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
    }) => void;
}

export function SetupIdentityStep({ onIdentitySetup }: SetupIdentityStepProps) {
    const [identityName, setIdentityName] = useState("");
    const [picturePreview, setPicturePreview] = useState<string | null>(null);

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
        (e: React.FormEvent) => {
            e.preventDefault();
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

            onIdentitySetup({
                identityName: identityName.trim() || null,
                identityPicture: picturePreview,
                cloudUrl: finalCloudUrl,
                claimCode: finalClaimCode,
            });
        },
        [identityName, picturePreview, selectedService, onIdentitySetup, showCustomCloudForm, customCloudUrl, customClaimCode]
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
        <Card className="w-full max-w-lg">
            <CardHeader>
                <CardTitle className="text-2xl">Set Up Your Identity</CardTitle>
                <CardDescription>Personalize your Vibe identity and connect it to a Vibe Cloud service.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Identity Name and Picture */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium">Identity Profile (Optional)</h3>
                        <div className="flex flex-col items-center space-y-2">
                            <Avatar className="h-24 w-24 mb-2">
                                <AvatarImage src={picturePreview ?? undefined} alt={identityName || "Identity Avatar"} />
                                <AvatarFallback>
                                    <User className="h-12 w-12" />
                                </AvatarFallback>
                            </Avatar>
                            <Input id="picture-upload" type="file" accept="image/*" onChange={handlePictureChange} className="hidden" />
                            <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("picture-upload")?.click()}>
                                {picturePreview ? "Change Picture" : "Upload Picture"}
                            </Button>
                            {picturePreview && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setPicturePreview(null)}>
                                    Remove Picture
                                </Button>
                            )}
                        </div>
                        <div>
                            <Label htmlFor="identity-name">Display Name</Label>
                            <Input
                                id="identity-name"
                                type="text"
                                value={identityName}
                                onChange={(e) => setIdentityName(e.target.value)}
                                placeholder="e.g., My Main Vibe"
                                autoComplete="nickname"
                            />
                        </div>
                    </div>

                    <hr />

                    {/* Vibe Cloud Configuration */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium">Connect to Vibe Cloud</h3>
                        <div>
                            <Label htmlFor="cloud-service-select">Vibe Cloud Provider</Label>
                            <select
                                id="cloud-service-select"
                                value={selectedCloudServiceId}
                                onChange={(e) => handleSelectCloudService(e.target.value)}
                                className="w-full p-2 border rounded-md bg-background text-foreground"
                            >
                                {configuredCloudServices.map((service) => (
                                    <option key={service.id} value={service.id}>
                                        {service.name}
                                    </option>
                                ))}
                                <option value="add_new_custom">+ Add Custom Vibe Cloud</option>
                            </select>
                        </div>

                        {/* Simplified conditional rendering for custom form based on selectedCloudServiceId */}
                        {(selectedCloudServiceId === "add_new_custom" || showCustomCloudForm) && (
                            <div className="space-y-4 p-4 border rounded-md">
                                <h4 className="text-md font-medium">Add Custom Vibe Cloud</h4>
                                <div>
                                    <Label htmlFor="custom-cloud-url">Custom Vibe Cloud URL</Label>
                                    <Input
                                        id="custom-cloud-url"
                                        type="url"
                                        value={customCloudUrl}
                                        onChange={(e) => {
                                            setCustomCloudUrl(e.target.value);
                                            setFormError(null);
                                        }}
                                        placeholder="https://your-custom-vibe.cloud"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="custom-claim-code">Claim Code (Optional)</Label>
                                    <Input
                                        id="custom-claim-code"
                                        type="text"
                                        value={customClaimCode}
                                        onChange={(e) => setCustomClaimCode(e.target.value)}
                                        placeholder="Provided by your custom cloud admin"
                                        autoComplete="off"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Only needed if your custom Vibe Cloud instance requires it.</p>
                                </div>
                                {/* <Button type="button" onClick={handleAddCustomCloud} variant="outline" size="sm">
                                    Test & Add Service
                                </Button> */}
                                {/* The "Test & Add" button is removed for now, submission will handle it */}
                            </div>
                        )}
                    </div>

                    {formError && <p className="text-sm text-red-600 text-center">{formError}</p>}

                    <Button type="submit" className="w-full !mt-8">
                        Finalize Setup
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
