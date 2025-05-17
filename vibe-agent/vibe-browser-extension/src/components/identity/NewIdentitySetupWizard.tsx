import React, { useState } from "react";
import { NameIdentityStep } from "@/components/setup/NameIdentityStep";
import { ConfigureCloudStep } from "@/components/setup/ConfigureCloudStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // Added for password
import { Label } from "@/components/ui/label"; // Added for password

interface NewIdentitySetupWizardProps {
    identityDid: string;
    accountIndex: number; // For deriving keys if needed for registration signature
    onSetupComplete: (details: {
        didToFinalize: string;
        accountIndex: number;
        identityName: string;
        identityPicture?: string; // Optional
        cloudUrl: string;
        claimCode?: string; // Optional
        password?: string; // Password to re-decrypt seed for signing - THIS IS THE VAULT PASSWORD
    }) => Promise<void>;
    onCancel: () => void;
}

type WizardStep = "name" | "configureCloud" | "confirmAndFinalize" | "finalizing";

export const NewIdentitySetupWizard: React.FC<NewIdentitySetupWizardProps> = ({ identityDid, accountIndex, onSetupComplete, onCancel }) => {
    const [currentStep, setCurrentStep] = useState<WizardStep>("name");
    const [identityName, setIdentityName] = useState<string>("");
    const [identityPicture, setIdentityPicture] = useState<string | undefined>(undefined); // Optional
    const [cloudUrl, setCloudUrl] = useState<string>("");
    const [claimCode, setClaimCode] = useState<string | undefined>(undefined);
    const [vaultPassword, setVaultPassword] = useState<string>(""); // Explicit state for vault password
    const [error, setError] = useState<string | null>(null);
    const [isFinalizing, setIsFinalizing] = useState(false);

    const handleNameComplete = (name: string, picture?: string) => {
        setIdentityName(name);
        setIdentityPicture(picture);
        setCurrentStep("configureCloud");
    };

    const handleCloudConfigComplete = (selectedCloudUrl: string, enteredClaimCode?: string) => {
        setCloudUrl(selectedCloudUrl);
        setClaimCode(enteredClaimCode);
        setCurrentStep("confirmAndFinalize"); // Move to new confirmation step
        setError(null);
    };

    const handleConfirmAndFinalize = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!vaultPassword) {
            setError("Vault password is required to finalize the identity.");
            return;
        }
        setIsFinalizing(true);
        setError(null);
        setCurrentStep("finalizing");

        try {
            await onSetupComplete({
                didToFinalize: identityDid,
                accountIndex,
                identityName,
                identityPicture,
                cloudUrl: cloudUrl,
                claimCode: claimCode,
                password: vaultPassword, // Use the explicitly collected vault password
            });
            // On success, App.tsx handles closing.
        } catch (e: any) {
            setError(e.message || "An unknown error occurred during finalization.");
            setIsFinalizing(false);
            setCurrentStep("confirmAndFinalize"); // Revert to confirmation step on error
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case "name":
                return <NameIdentityStep onIdentityNamed={handleNameComplete} />;
            case "configureCloud":
                return <ConfigureCloudStep onCloudConfigured={(url, claim) => handleCloudConfigComplete(url, claim)} />;
            case "confirmAndFinalize":
                return (
                    <form onSubmit={handleConfirmAndFinalize} className="p-6 space-y-4">
                        <div>
                            <h3 className="text-lg font-medium">Confirm Details</h3>
                            <p className="text-sm text-muted-foreground">
                                Please review the identity details and enter your current vault password to complete the setup.
                            </p>
                        </div>
                        <div>
                            <p>
                                <strong>Name:</strong> {identityName || "Not set"}
                            </p>
                            <p>
                                <strong>Cloud Server:</strong> {cloudUrl || "Not set"}
                            </p>
                            {claimCode && (
                                <p>
                                    <strong>Claim Code:</strong> {claimCode}
                                </p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="vault-password">Current Vault Password</Label>
                            <Input
                                id="vault-password"
                                type="password"
                                value={vaultPassword}
                                onChange={(e) => setVaultPassword(e.target.value)}
                                placeholder="Enter your vault password"
                                required
                                autoFocus
                            />
                        </div>
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        <Button type="submit" className="w-full" disabled={isFinalizing || !vaultPassword}>
                            {isFinalizing ? "Finalizing..." : "Confirm and Finalize Identity"}
                        </Button>
                    </form>
                );
            case "finalizing":
                return (
                    <div className="p-6 text-center">
                        <p>Finalizing identity setup...</p>
                        {error && !isFinalizing && <p className="text-red-500 mt-2">{error}</p>}
                    </div>
                );
            default:
                return <p>Unknown setup step.</p>;
        }
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-center">Setup New Identity</h2>
            </div>
            <div className="flex-grow p-2 overflow-y-auto">{renderStep()}</div>
            {currentStep !== "finalizing" && currentStep !== "confirmAndFinalize" && !isFinalizing && (
                <div className="p-4 border-t border-border">
                    <Button onClick={onCancel} variant="outline" className="w-full">
                        Cancel Setup
                    </Button>
                </div>
            )}
            {/* Cancel button for confirmAndFinalize step, if not finalizing */}
            {currentStep === "confirmAndFinalize" && !isFinalizing && (
                <div className="p-4 border-t border-border">
                    <Button onClick={onCancel} variant="outline" className="w-full">
                        Cancel
                    </Button>
                </div>
            )}
            {error && currentStep !== "finalizing" && currentStep !== "confirmAndFinalize" && (
                <div className="p-4 text-red-500 text-sm text-center">{error}</div>
            )}
        </div>
    );
};
