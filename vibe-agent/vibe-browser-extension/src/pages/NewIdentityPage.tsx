import React, { useState, useCallback, useEffect } from "react";
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { useVaultUnlock } from "@/contexts/VaultUnlockContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Loader2 } from "lucide-react";
// VibeLogo import removed, will use direct img tag if needed, or consistent icon
import {
    appStatusAtom,
    initializeAppStateAtom, // For re-triggering init on reset
    isLoadingIdentityAtom,
} from "../store/appAtoms";
import { newIdentityWizardPropsAtom, currentIdentityAtom, allIdentitiesAtom } from "../store/identityAtoms";

// Constants
const OFFICIAL_VIBE_CLOUD_URL = "https://vibe-cloud-cp.vibeapp.dev";
const OFFICIAL_VIBE_CLOUD_NAME = "Official Vibe Cloud (Recommended)";

interface CloudServiceOption {
    id: string;
    name: string;
    url: string;
    isDefault?: boolean;
}

// Define ChromeMessage type, consider moving to a shared types file
interface ChromeMessage {
    type: string;
    payload?: any;
    error?: { message?: string; [key: string]: any };
    [key: string]: any;
}

type WizardStep = "enterDetails" | "creating" | "creationComplete";

export const NewIdentityPage: React.FC = () => {
    const [currentStep, setCurrentStep] = useState<WizardStep>("enterDetails");
    const [identityName, setIdentityName] = useState("");
    const [picturePreview, setPicturePreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const [appStatus, setAppStatus] = useAtom(appStatusAtom);
    const [, setInitializeAppState] = useAtom(initializeAppStateAtom); // To trigger re-init
    const [props, setProps] = useAtom(newIdentityWizardPropsAtom);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_isLoading, setIsLoading] = useAtom(isLoadingIdentityAtom); // For setting loading state
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_currentId, setCurrentIdentity] = useAtom(currentIdentityAtom);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_allIds, setAllIdentities] = useAtom(allIdentitiesAtom);

    const [, setLocation] = useLocation();
    const { requestUnlockAndPerformAction } = useVaultUnlock();

    const identityIndex = props?.identityIndex ?? 0; // Default to 0 if props not set
    const isVaultInitiallyUnlocked = props?.isVaultInitiallyUnlocked ?? true; // Default based on typical flow
    const isFirstIdentitySetup = appStatus === "FIRST_IDENTITY_CREATION_REQUIRED" || (identityIndex === 0 && appStatus === "SETUP_NOT_COMPLETE");

    // Cloud configuration states
    const [configuredCloudServices, setConfiguredCloudServices] = useState<CloudServiceOption[]>([
        { id: "default", name: OFFICIAL_VIBE_CLOUD_NAME, url: OFFICIAL_VIBE_CLOUD_URL, isDefault: true },
    ]);
    const [selectedCloudServiceId, setSelectedCloudServiceId] = useState<string>("default");
    const [showCustomCloudForm, setShowCustomCloudForm] = useState(false);
    const [customCloudUrl, setCustomCloudUrl] = useState("");
    const [customClaimCode, setCustomClaimCode] = useState("");

    const selectedService = configuredCloudServices.find((s) => s.id === selectedCloudServiceId) || configuredCloudServices[0];

    useEffect(() => {
        // If props are not set and this page is accessed directly (e.g. from /setup/new-identity after phrase confirmation)
        // we might need to fetch next account index. For now, assume props are set by navigation logic.
        if (!props && (appStatus === "FIRST_IDENTITY_CREATION_REQUIRED" || appStatus === "SETUP_NOT_COMPLETE")) {
            // Attempt to get default props if not set, e.g. for first identity after vault setup
            const fetchDefaultProps = async () => {
                try {
                    const response = (await chrome.runtime.sendMessage({
                        type: "VIBE_AGENT_REQUEST",
                        action: "GET_NEXT_IDENTITY_INDEX",
                        requestId: crypto.randomUUID().toString(),
                    })) as ChromeMessage;
                    if (response?.type === "VIBE_AGENT_RESPONSE" && typeof response.payload?.identityIndex === "number") {
                        setProps({
                            identityIndex: response.payload.identityIndex,
                            isVaultInitiallyUnlocked: true, // Assume unlocked if at this stage
                        });
                    } else {
                        console.warn("Could not fetch default props for NewIdentityPage");
                    }
                } catch (e) {
                    console.error("Error fetching default props for NewIdentityPage", e);
                }
            };
            fetchDefaultProps();
        }
    }, [props, appStatus, setProps]);

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
        setShowCustomCloudForm(serviceId === "add_new_custom");
    };

    useEffect(() => {
        if (!showCustomCloudForm && selectedCloudServiceId !== "add_new_custom") {
            setCustomCloudUrl("");
            setCustomClaimCode("");
        }
    }, [showCustomCloudForm, selectedCloudServiceId]);

    const onSetupCompleteHandler = async (details: {
        identityIndex: number;
        identityName: string | null;
        identityPicture?: string | null;
        cloudUrl: string;
        claimCode?: string | null;
        password?: string; // Password from prompt if vault was locked
    }) => {
        // This function is called after the background script successfully finalizes the identity.
        console.log("NewIdentityPage: onSetupCompleteHandler called with:", details);
        setIsLoading(true); // Show loading while we refresh identity data
        try {
            // Message background to finalize (this is the core logic from original onSetupComplete)
            const response = (await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SETUP_NEW_IDENTITY_AND_FINALIZE", // Or a more general "FINALIZE_IDENTITY_SETUP"
                payload: {
                    identityIndexToUse: details.identityIndex,
                    identityName: details.identityName,
                    identityPicture: details.identityPicture,
                    cloudUrl: details.cloudUrl,
                    claimCode: details.claimCode,
                    password: details.password, // Critical for first identity or if vault was re-locked
                },
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage;

            if (response && response.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                console.log(`New identity "${details.identityName || "Unnamed"}" finalized!`);
                setAppStatus("INITIALIZED_UNLOCKED"); // Assume success means we are unlocked and ready
                // Clear props for this wizard as it's done
                setProps(null);
                // Navigating to dashboard should trigger data refresh there
                setLocation("/dashboard");
            } else {
                throw new Error(response?.error?.message || "Failed to finalize new identity via background.");
            }
        } catch (e: any) {
            console.error("Error in onSetupCompleteHandler (NewIdentityPage):", e);
            setError(e.message || "An unexpected error occurred during finalization.");
            setCurrentStep("enterDetails"); // Revert to details on error
            // Do not navigate away, let user see the error
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateIdentitySubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setIsCreating(true);
        setCurrentStep("creating");

        let finalCloudUrl = selectedService.url;
        let finalClaimCode: string | null = null;

        if (selectedCloudServiceId === "add_new_custom" || (showCustomCloudForm && customCloudUrl)) {
            if (!customCloudUrl) {
                setError("Custom Vibe Cloud URL is required.");
                setIsCreating(false);
                setCurrentStep("enterDetails");
                return;
            }
            try {
                new URL(customCloudUrl);
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
            if (selectedService.isDefault) finalClaimCode = null;
        }

        try {
            const identityDetailsToComplete = {
                identityIndex,
                identityName: identityName.trim() || null,
                identityPicture: picturePreview,
                cloudUrl: finalCloudUrl,
                claimCode: finalClaimCode,
            };

            // If vault is already unlocked, or if it's the very first identity setup (where password was just set for vault)
            // we might not need to prompt for password again.
            // However, SETUP_NEW_IDENTITY_AND_FINALIZE might still need the password for key derivation.
            // The useVaultUnlock hook handles this gracefully.

            await requestUnlockAndPerformAction(
                async (passwordFromPrompt?: string) => {
                    // This inner function is called by useVaultUnlock after password entry (if needed)
                    await onSetupCompleteHandler({
                        ...identityDetailsToComplete,
                        password: passwordFromPrompt, // Pass the password obtained from the prompt
                    });
                },
                {
                    title: "Finalize Identity Setup",
                    description: "Enter your vault password to encrypt and save your new identity.",
                }
            );
            // If requestUnlockAndPerformAction completes without throwing, onSetupCompleteHandler was called
            // and it will handle navigation or error display.
            // setCurrentStep("creationComplete"); // This is now handled by onSetupCompleteHandler's success path
        } catch (e: any) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (errorMessage !== "Operation cancelled by user.") {
                setError(errorMessage);
            }
            setCurrentStep("enterDetails");
        } finally {
            setIsCreating(false); // Ensure this is always reset
        }
    };

    const onCancelHandler = () => {
        setProps(null); // Clear any props associated with this wizard
        if (isFirstIdentitySetup) {
            // If cancelling first setup, it's a bit like resetting, go back to main setup or an error/info state.
            // For now, let's assume this means going back to the main setup wizard's start.
            setLocation("/setup");
        } else {
            // If cancelling adding a subsequent identity, go back to dashboard or settings
            setLocation("/dashboard"); // Or wherever the user came from
        }
    };

    const onResetVibeHandler = async () => {
        if (confirm("Are you sure you want to reset Vibe? This will clear your stored data.")) {
            try {
                await chrome.storage.local.clear();
                await chrome.storage.session.clear(); // Clear session storage too
                alert("Vibe has been reset. The extension will now re-initialize.");
                setProps(null);
                setAppStatus("LOADING"); // Trigger re-initialization
                setInitializeAppState(null); // Force re-evaluation by useAppInitializer
                setLocation("/"); // Navigate to root, initializer will pick correct route
            } catch (err) {
                console.error("Error resetting storage:", err);
                setError("Failed to reset Vibe. Please try again or reinstall the extension.");
            }
        }
    };

    const renderEnterDetailsStep = () => (
        // Removed p-6 from form, added to a wrapper div for the content of this step
        <div className="flex flex-col items-center justify-start h-full space-y-5 w-full">
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mt-2 mb-3" />
            <div className="space-y-1 text-center">
                <h1 className="text-2xl font-semibold">{isFirstIdentitySetup ? "Setup Your First Identity" : "Create New Identity"}</h1>
                <p className="text-sm text-muted-foreground max-w-xs">Personalize your new identity.</p>
            </div>

            <form onSubmit={handleCreateIdentitySubmit} className="w-full max-w-sm space-y-4 text-left">
                {/* Profile Section */}
                <div className="space-y-3">
                    <div className="flex flex-col items-center space-y-2">
                        <Avatar className="h-20 w-20">
                            <AvatarImage src={picturePreview ?? undefined} alt={identityName || "Identity Avatar"} />
                            <AvatarFallback>
                                <User className="h-10 w-10 text-muted-foreground" />
                            </AvatarFallback>
                        </Avatar>
                        <Input id="picture-upload-newid" type="file" accept="image/*" onChange={handlePictureChange} className="hidden" />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById("picture-upload-newid")?.click()}
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
                        <Label htmlFor="identity-name-newid">Display Name</Label>
                        <Input
                            id="identity-name-newid"
                            type="text"
                            value={identityName}
                            onChange={(e) => setIdentityName(e.target.value)}
                            placeholder="e.g., My Main Vibe"
                            autoComplete="nickname"
                            className="text-sm"
                        />
                    </div>
                </div>

                {/* Cloud Configuration Section */}
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor="cloud-service-select-newid">Vibe Cloud Provider</Label>
                        <select
                            id="cloud-service-select-newid"
                            value={selectedCloudServiceId}
                            onChange={(e) => handleSelectCloudService(e.target.value)}
                            className="w-full p-2 border rounded-md bg-background text-foreground text-sm focus:ring-ring focus:border-ring mt-1"
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
                                <Label htmlFor="custom-cloud-url-newid">Custom Vibe Cloud URL</Label>
                                <Input
                                    id="custom-cloud-url-newid"
                                    type="url"
                                    value={customCloudUrl}
                                    onChange={(e) => setCustomCloudUrl(e.target.value)}
                                    placeholder="https://your-custom-vibe.cloud"
                                    className="mt-1 text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="custom-claim-code-newid">Claim Code (Optional)</Label>
                                <Input
                                    id="custom-claim-code-newid"
                                    type="text"
                                    value={customClaimCode}
                                    onChange={(e) => setCustomClaimCode(e.target.value)}
                                    placeholder="Provided by your custom cloud admin"
                                    autoComplete="off"
                                    className="mt-1 text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Only needed if your custom Vibe Cloud instance requires it.</p>
                            </div>
                        </div>
                    )}
                </div>
                {error && <p className="text-red-500 text-sm text-center pt-1">{error}</p>}
                <Button
                    type="submit"
                    className="w-full bg-violet-500 hover:bg-violet-600 text-primary-foreground font-semibold py-3 text-base !mt-6" // Explicit primary colors and adjusted margin
                    disabled={isCreating}
                >
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
        </div>
    );

    const renderCreatingStep = () => (
        <div className="flex flex-col items-center justify-center h-full space-y-2">
            {" "}
            {/* Removed p-6 */}
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Creating identity...</p>
        </div>
    );

    const renderCreationCompleteStep = () => (
        <div className="flex flex-col items-center justify-center text-center space-y-4 h-full">
            {" "}
            {/* Removed p-6 */}
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mb-2" />
            <h3 className="text-2xl font-semibold">Identity Created!</h3>
            <p className="text-muted-foreground max-w-xs">Your new identity {identityName ? `"${identityName}"` : ""} has been successfully set up.</p>
            <Button onClick={() => setLocation("/dashboard")} className="w-full max-w-xs bg-violet-500 hover:bg-violet-600 text-primary-foreground">
                Done
            </Button>
        </div>
    );

    const renderFooterButtons = () => {
        if (currentStep === "enterDetails" && !isCreating) {
            if (isFirstIdentitySetup) {
                return (
                    <div className="pt-4 border-t border-border">
                        <Button onClick={onResetVibeHandler} variant="outline" className="w-full">
                            Reset Vibe & Start Over
                        </Button>
                    </div>
                );
            } else {
                return (
                    <div className="pt-4 border-t border-border">
                        <Button onClick={onCancelHandler} variant="outline" className="w-full">
                            Cancel
                        </Button>
                    </div>
                );
            }
        }
        return null;
    };

    // If props are not loaded yet (e.g. identityIndex is still default 0 but not first identity setup)
    // and it's not the first identity setup determined by appStatus, show loading or an error.
    // This check helps prevent rendering the form with potentially incorrect default identityIndex.
    if (!props && !isFirstIdentitySetup && appStatus !== "LOADING") {
        // This case indicates an issue, perhaps navigated here directly without necessary state.
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-4">
                <p className="text-red-500">Error: Missing required information to create a new identity.</p>
                <Button onClick={() => setLocation("/dashboard")} variant="link" className="mt-2">
                    Go to Dashboard
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-background text-foreground px-4 pt-8 sm:pt-12 ">
            <div className="flex-grow overflow-y-auto">
                {currentStep === "enterDetails" && renderEnterDetailsStep()}
                {currentStep === "creating" && renderCreatingStep()}
                {currentStep === "creationComplete" && renderCreationCompleteStep()}
            </div>
            {renderFooterButtons()}
        </div>
    );
};

export default NewIdentityPage;
