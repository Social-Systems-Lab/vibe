import React, { useState } from "react";
import { NameIdentityStep } from "@/components/setup/NameIdentityStep";
import { ConfigureCloudStep } from "@/components/setup/ConfigureCloudStep";
import { Button } from "@/components/ui/button";

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
        password?: string; // Password to re-decrypt seed for signing
    }) => Promise<void>;
    onCancel: () => void;
}

type WizardStep = "name" | "configureCloud" | "finalizing";

export const NewIdentitySetupWizard: React.FC<NewIdentitySetupWizardProps> = ({ identityDid, accountIndex, onSetupComplete, onCancel }) => {
    const [currentStep, setCurrentStep] = useState<WizardStep>("name");
    const [identityName, setIdentityName] = useState<string>("");
    const [identityPicture, setIdentityPicture] = useState<string | undefined>(undefined); // Optional
    const [cloudUrl, setCloudUrl] = useState<string>("");
    const [claimCode, setClaimCode] = useState<string | undefined>(undefined);
    const [password, setPassword] = useState<string>(""); // For re-decrypting seed
    const [error, setError] = useState<string | null>(null);
    const [isFinalizing, setIsFinalizing] = useState(false);

    const handleNameComplete = (name: string, picture?: string) => {
        setIdentityName(name);
        setIdentityPicture(picture);
        setCurrentStep("configureCloud");
    };

    const handleCloudConfigComplete = async (
        selectedCloudUrl: string,
        enteredClaimCode?: string,
        enteredPassword?: string // Password from cloud step if vault is locked
    ) => {
        setCloudUrl(selectedCloudUrl);
        setClaimCode(enteredClaimCode);
        if (enteredPassword) {
            // If password was required and provided at this step
            setPassword(enteredPassword);
        }
        setCurrentStep("finalizing");
        setIsFinalizing(true);
        setError(null);

        // Check if password is set, if not (e.g. vault was already unlocked), prompt if necessary
        // For simplicity, we'll assume if it's needed, ConfigureCloudStep (or a pre-step) would have collected it.
        // If not collected by ConfigureCloudStep, and it's needed by FINALIZE_NEW_IDENTITY_SETUP, that handler will error.
        // A more robust flow might explicitly ask for password here if `password` state is empty.
        // For now, we rely on `ConfigureCloudStep` or prior state to have the password if needed.

        try {
            // The password state variable should be populated if ConfigureCloudStep determined it was needed
            // (e.g. if it had to call UNLOCK_VAULT or if it knows a signature will be needed and vault is locked)
            // If the FINALIZE_NEW_IDENTITY_SETUP needs the password and it's not provided, it will fail.
            await onSetupComplete({
                didToFinalize: identityDid,
                accountIndex,
                identityName,
                identityPicture,
                cloudUrl: selectedCloudUrl,
                claimCode: enteredClaimCode,
                password: password || enteredPassword || "", // Prioritize password from state, then from step
            });
            // On success, the parent component (App.tsx) will handle closing this wizard.
        } catch (e: any) {
            setError(e.message || "An unknown error occurred during finalization.");
            setIsFinalizing(false);
            setCurrentStep("configureCloud"); // Revert to cloud step on error
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case "name":
                return (
                    <NameIdentityStep
                        onIdentityNamed={handleNameComplete} // Corrected prop name
                        // Removed initialName, title, actionLabel as they are not props of NameIdentityStep
                    />
                );
            case "configureCloud":
                // Note: ConfigureCloudStep's onCloudConfigured prop only passes (url, claimCode).
                // Password for finalization if vault is locked needs to be handled either by
                // prompting before this step, or by ensuring FINALIZE_NEW_IDENTITY_SETUP can prompt.
                // For now, handleCloudConfigComplete will receive (url, claimCode) and use existing password state.
                // A more robust solution might involve ConfigureCloudStep also returning a password if it collected one.
                return (
                    <ConfigureCloudStep
                        onCloudConfigured={(url, claim) => handleCloudConfigComplete(url, claim, undefined)} // Adapt to existing props
                        // Removed identityName, identityDid, title, actionLabel, isNewIdentitySetup
                    />
                );
            case "finalizing":
                return (
                    <div className="p-6 text-center">
                        <p>Finalizing identity setup...</p>
                        {error && <p className="text-red-500 mt-2">{error}</p>}
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
            {currentStep !== "finalizing" && !isFinalizing && (
                <div className="p-4 border-t border-border">
                    <Button onClick={onCancel} variant="outline" className="w-full">
                        Cancel Setup
                    </Button>
                </div>
            )}
            {error && currentStep !== "finalizing" && <div className="p-4 text-red-500 text-sm text-center">{error}</div>}
        </div>
    );
};
