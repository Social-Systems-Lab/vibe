import React, { useState, useCallback, useEffect } from "react";
import { useVaultUnlock } from "@/contexts/VaultUnlockContext"; // Added
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Loader2 } from "lucide-react";
import { VibeLogo } from "@/components/ui/VibeLogo"; // For completion step

// Constants from SetupIdentityStep
const OFFICIAL_VIBE_CLOUD_URL = "https://vibe-cloud-cp.vibeapp.dev";
const OFFICIAL_VIBE_CLOUD_NAME = "Official Vibe Cloud (Recommended)";

interface CloudServiceOption {
    id: string;
    name: string;
    url: string;
    isDefault?: boolean;
}

interface NewIdentitySetupWizardProps {
    accountIndex: number;
    isVaultInitiallyUnlocked: boolean;
    isFirstIdentitySetup: boolean; // Added: True if this is for the very first identity
    onSetupComplete: (details: {
        accountIndex: number;
        identityName: string | null;
        identityPicture?: string | null;
        cloudUrl: string;
        claimCode?: string | null;
        password?: string;
    }) => Promise<void>;
    onCancel: () => void; // Called when cancelling a subsequent identity add
    onResetVibe?: () => void; // Added: Called when resetting during first identity setup
}

type WizardStep = "enterDetails" | "creating" | "creationComplete";

export const NewIdentitySetupWizard: React.FC<NewIdentitySetupWizardProps> = ({
    accountIndex,
    isVaultInitiallyUnlocked,
    isFirstIdentitySetup,
    onSetupComplete,
    onCancel,
    onResetVibe,
}) => {
    const [currentStep, setCurrentStep] = useState<WizardStep>("enterDetails");

    // Form field states
    const [identityName, setIdentityName] = useState("");
    const [picturePreview, setPicturePreview] = useState<string | null>(null);
    // const [vaultPassword, setVaultPassword] = useState(""); // Removed

    const { requestUnlockAndPerformAction } = useVaultUnlock(); // Added

    // Cloud configuration states (from SetupIdentityStep)
    const [configuredCloudServices, setConfiguredCloudServices] = useState<CloudServiceOption[]>([
        { id: "default", name: OFFICIAL_VIBE_CLOUD_NAME, url: OFFICIAL_VIBE_CLOUD_URL, isDefault: true },
    ]);
    const [selectedCloudServiceId, setSelectedCloudServiceId] = useState<string>("default");
    const [showCustomCloudForm, setShowCustomCloudForm] = useState(false);
    const [customCloudUrl, setCustomCloudUrl] = useState("");
    const [customClaimCode, setCustomClaimCode] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const selectedService = configuredCloudServices.find((s) => s.id === selectedCloudServiceId) || configuredCloudServices[0];

    const handlePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setPicturePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSelectCloudService = (serviceId: string) => {
        setSelectedCloudServiceId(serviceId);
        if (serviceId !== "add_new_custom") {
            setShowCustomCloudForm(false);
        } else {
            setShowCustomCloudForm(true);
        }
    };

    // Reset custom cloud form fields if user navigates away from adding new custom cloud
    useEffect(() => {
        if (!showCustomCloudForm && selectedCloudServiceId !== "add_new_custom") {
            setCustomCloudUrl("");
            setCustomClaimCode("");
        }
    }, [showCustomCloudForm, selectedCloudServiceId]);

    const handleCreateIdentitySubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        // Removed direct password check here, will be handled by requestUnlockAndPerformAction

        setIsCreating(true);
        setCurrentStep("creating");

        let finalCloudUrl = selectedService.url;
        let finalClaimCode: string | null = null;

        if (selectedCloudServiceId === "add_new_custom" || (showCustomCloudForm && customCloudUrl)) {
            if (!customCloudUrl) {
                setError("Custom Vibe Cloud URL is required if adding a new one.");
                setIsCreating(false);
                setCurrentStep("enterDetails");
                return;
            }
            try {
                new URL(customCloudUrl); // Validate URL
            } catch (_) {
                setError("Invalid Custom Vibe Cloud URL format.");
                setIsCreating(false);
                setCurrentStep("enterDetails");
                return;
            }
            finalCloudUrl = customCloudUrl;
            finalClaimCode = customClaimCode.trim() || null;
        } else {
            finalCloudUrl = selectedService.url;
            finalClaimCode = selectedService.id.startsWith("custom-") ? customClaimCode.trim() || null : null;
            if (selectedService.isDefault) {
                finalClaimCode = null;
            }
        }

        try {
            const createIdentityAction = async (passwordFromPrompt?: string) => {
                await onSetupComplete({
                    accountIndex,
                    identityName: identityName.trim() || null,
                    identityPicture: picturePreview,
                    cloudUrl: finalCloudUrl,
                    claimCode: finalClaimCode,
                    password: passwordFromPrompt, // Use password from prompt
                });
            };

            await requestUnlockAndPerformAction(createIdentityAction, {
                title: "Create New Identity",
                description: "Enter your vault password to encrypt and save your new identity.",
            });

            setCurrentStep("creationComplete");
        } catch (e: any) {
            // This catch block will handle errors from requestUnlockAndPerformAction (e.g., user cancellation)
            // or errors from createIdentityAction if they weren't handled by the modal for retry.
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (errorMessage !== "Operation cancelled by user.") {
                // Don't show "cancelled" as a form error
                setError(errorMessage);
            }
            setCurrentStep("enterDetails"); // Revert to details step on error or cancellation
        } finally {
            setIsCreating(false);
        }
    };

    const handleCloseTab = () => {
        // Try to message background to close, fallback to window.close()
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ type: "CLOSE_SETUP_TAB" }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) {
                    window.close(); // Fallback if messaging fails or not handled
                }
                // If response.success, tab should be closed by background
            });
        } else {
            window.close();
        }
    };

    const renderEnterDetailsStep = () => (
        <form onSubmit={handleCreateIdentitySubmit} className="p-6 space-y-6">
            {/* Identity Profile Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium">Create New Identity</h3>
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
            {/* Vibe Cloud Configuration Section */}
            <div className="space-y-4">
                <div>
                    <Label htmlFor="cloud-service-select">Vibe Cloud Provider</Label>
                    <select
                        id="cloud-service-select"
                        value={selectedCloudServiceId}
                        onChange={(e) => handleSelectCloudService(e.target.value)}
                        className="w-full p-2 border rounded-md bg-background text-foreground mt-1"
                    >
                        {configuredCloudServices.map((service) => (
                            <option key={service.id} value={service.id}>
                                {service.name}
                            </option>
                        ))}
                        <option value="add_new_custom">+ Add Custom Vibe Cloud</option>
                    </select>
                </div>

                {(selectedCloudServiceId === "add_new_custom" || showCustomCloudForm) && (
                    <div className="space-y-4 p-4 border rounded-md mt-2">
                        <h4 className="text-md font-medium">Add Custom Vibe Cloud</h4>
                        <div>
                            <Label htmlFor="custom-cloud-url">Custom Vibe Cloud URL</Label>
                            <Input
                                id="custom-cloud-url"
                                type="url"
                                value={customCloudUrl}
                                onChange={(e) => setCustomCloudUrl(e.target.value)}
                                placeholder="https://your-custom-vibe.cloud"
                                className="mt-1"
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
                                className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Only needed if your custom Vibe Cloud instance requires it.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Vault Password Section - Conditional - REMOVED */}

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <Button type="submit" className="w-full !mt-8" disabled={isCreating}>
                {isCreating ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                    </>
                ) : (
                    "Create Identity"
                )}
            </Button>
        </form>
    );

    const renderCreatingStep = () => (
        <div className="p-6 text-center flex flex-col items-center justify-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Creating identity...</p>
        </div>
    );

    const renderCreationCompleteStep = () => (
        <div className="p-6 flex flex-col items-center text-center space-y-4">
            <VibeLogo width={60} height={60} />
            <h3 className="text-2xl font-semibold">Identity Created!</h3>
            <p className="text-muted-foreground">Your new identity {identityName ? `"${identityName}"` : ""} has been successfully set up.</p>
            <Button onClick={handleCloseTab} className="w-full max-w-xs">
                Done
            </Button>
        </div>
    );

    const renderFooterButtons = () => {
        if (currentStep === "enterDetails" && !isCreating) {
            if (isFirstIdentitySetup) {
                return (
                    <div className="p-4 border-t border-border">
                        <Button onClick={onResetVibe} variant="outline" className="w-full">
                            Reset Vibe & Start Over
                        </Button>
                    </div>
                );
            } else {
                return (
                    <div className="p-4 border-t border-border">
                        <Button onClick={onCancel} variant="outline" className="w-full">
                            Cancel
                        </Button>
                    </div>
                );
            }
        }
        return null;
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-grow p-2 overflow-y-auto">
                {currentStep === "enterDetails" && renderEnterDetailsStep()}
                {currentStep === "creating" && renderCreatingStep()}
                {currentStep === "creationComplete" && renderCreationCompleteStep()}
            </div>
            {renderFooterButtons()}
        </div>
    );
};
