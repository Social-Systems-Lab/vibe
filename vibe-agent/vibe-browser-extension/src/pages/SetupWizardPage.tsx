import React, { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAtom } from "jotai";
import { WelcomeStep } from "../components/setup/WelcomeStep";
import { CreatePasswordStep } from "../components/setup/CreatePasswordStep";
import { ShowPhraseStep } from "../components/setup/ShowPhraseStep";
import { ImportPhraseStep } from "../components/setup/ImportPhraseStep";
import { SetupCompleteStep } from "../components/setup/SetupCompleteStep";
import { SetupIdentityStep } from "../components/setup/SetupIdentityStep";
import { Button } from "@/components/ui/button";
import { appStatusAtom } from "../store/appAtoms"; // To update app status on completion

// Define ChromeMessage type, consider moving to a shared types file
interface ChromeMessage {
    type: string;
    payload?: any;
    error?: { message?: string; [key: string]: any };
    [key: string]: any;
}

type SetupStep =
    | "welcome"
    | "createPassword_new"
    | "createPassword_import"
    | "showPhrase"
    | "setupIdentity"
    | "importPhrase"
    | "noIdentitiesFound"
    | "setupComplete"
    | "error";

// Props are removed as navigation will be handled internally or by setting appStatus
// interface SetupWizardPageProps {
// onSetupComplete: () => void; // This will be replaced by navigation or appStatus update
// }

export function SetupWizardPage(/*{ onSetupComplete }: SetupWizardPageProps*/) {
    const [currentStep, setCurrentStep] = useState<SetupStep>("welcome");
    const [wizardState, setWizardState] = useState<{
        password?: string;
        mnemonic?: string;
        importedMnemonic?: string;
        identityName?: string | null;
        // identityPicture?: string | null; // Not used in this simplified version
        // cloudUrl?: string; // Not used in this simplified version
        // claimCode?: string; // Not used in this simplified version
        error?: string;
    }>({});
    const [, setLocation] = useLocation();
    const [, setAppStatus] = useAtom(appStatusAtom);

    const handleFullSetupCompletion = useCallback(() => {
        // This function is called when the user clicks "Start Using Vibe" on the SetupCompleteStep
        // It should signify that the entire setup flow (including first identity if applicable) is done.
        setAppStatus("INITIALIZED_UNLOCKED"); // Or trigger re-initialization
        setLocation("/dashboard");
        // Optionally, send a message to background to close setup tab if it's a dedicated tab
        chrome.runtime.sendMessage({ type: "VIBE_AGENT_REQUEST", action: "CLOSE_SETUP_TAB" }).catch(console.error);
    }, [setAppStatus, setLocation]);

    const finalizeImportFlow = useCallback(
        async (password: string) => {
            setWizardState((prev) => ({ ...prev, error: undefined }));
            const { importedMnemonic } = wizardState;

            if (!importedMnemonic || !password) {
                setWizardState((prev) => ({ ...prev, error: "Imported phrase or password missing." }));
                setCurrentStep("error");
                return;
            }

            try {
                const response = (await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES",
                    payload: { importedMnemonic, password },
                })) as ChromeMessage;

                if (response?.error || !response?.payload?.success) {
                    throw new Error(response?.error?.message || response?.payload?.message || "Failed to import vault.");
                }

                setWizardState((prev) => ({ ...prev, importedMnemonic: undefined }));
                if (response.payload?.recoveredCount > 0) {
                    setWizardState((prev) => ({ ...prev, identityName: response.payload?.primaryProfileName || "Recovered Identity" }));
                    setCurrentStep("setupComplete"); // Go to final step
                } else {
                    setCurrentStep("noIdentitiesFound");
                }
            } catch (error) {
                setWizardState((prev) => ({ ...prev, error: `Import error: ${error instanceof Error ? error.message : String(error)}` }));
                setCurrentStep("error");
            }
        },
        [wizardState] // setLocation and setAppStatus are stable
    );

    const handleCreateNew = useCallback(() => setCurrentStep("createPassword_new"), []);
    const handleImportExisting = useCallback(() => setCurrentStep("importPhrase"), []);

    const handlePasswordSet = useCallback(
        async (password: string) => {
            setWizardState((prev) => ({ ...prev, password, error: undefined }));

            if (currentStep === "createPassword_new") {
                try {
                    const response = (await chrome.runtime.sendMessage({
                        type: "VIBE_AGENT_REQUEST",
                        action: "SETUP_CREATE_VAULT",
                        payload: { password },
                    })) as ChromeMessage;

                    if (response?.error || !response?.payload?.mnemonic) {
                        throw new Error(response?.error?.message || "Mnemonic not received.");
                    }
                    setWizardState((prev) => ({ ...prev, mnemonic: response.payload.mnemonic }));
                    setCurrentStep("showPhrase");
                } catch (error) {
                    setWizardState((prev) => ({ ...prev, error: `Vault creation error: ${error instanceof Error ? error.message : String(error)}` }));
                    setCurrentStep("error");
                }
            } else if (currentStep === "createPassword_import") {
                finalizeImportFlow(password);
            }
        },
        [currentStep, finalizeImportFlow]
    );

    const handlePhraseConfirmed = useCallback(() => {
        // After phrase is confirmed for a NEW vault, user needs to set up their first identity.
        // The old logic navigated to addIdentity.html. New logic navigates to a route.
        // The mnemonic and password are in session storage (set by background) or wizardState.
        // The NewIdentityPage will handle the rest.
        setLocation("/setup/new-identity"); // Navigate to the first identity setup route
    }, [setLocation]);

    const handlePhraseImported = useCallback((mnemonic: string) => {
        setWizardState((prev) => ({ ...prev, importedMnemonic: mnemonic, mnemonic: undefined }));
        setCurrentStep("createPassword_import");
    }, []);

    const handleIdentitySetup = useCallback(
        async (details: { identityName: string | null /* identityPicture: string | null; cloudUrl: string; claimCode: string | null; */ }) => {
            // This function is called from SetupIdentityStep (which is now part of NewIdentityPage flow)
            // For the main SetupWizard, if we reach here after "noIdentitiesFound",
            // it means the user chose to create a new identity after a failed import.
            // This implies they need to go through the new identity setup flow.
            console.log("SetupWizardPage: handleIdentitySetup called with:", details, "Current wizard state:", wizardState);

            // This specific handleIdentitySetup in SetupWizardPage might be simplified or removed
            // if "noIdentitiesFound" directly navigates to "/setup/new-identity"
            // For now, let's assume it means they want to proceed to the setupComplete step
            // with the name they just provided (if any).
            setWizardState((prev) => ({ ...prev, identityName: details.identityName || prev.identityName }));
            setCurrentStep("setupComplete");
        },
        [wizardState] // setLocation, setAppStatus are stable
    );

    const renderStep = () => {
        switch (currentStep) {
            case "welcome":
                return <WelcomeStep onCreateNew={handleCreateNew} onImportExisting={handleImportExisting} />;
            case "createPassword_new":
                return <CreatePasswordStep onPasswordSet={handlePasswordSet} isImportFlow={false} />;
            case "createPassword_import":
                return <CreatePasswordStep onPasswordSet={handlePasswordSet} isImportFlow={true} />;
            case "showPhrase":
                return wizardState.mnemonic ? (
                    <ShowPhraseStep mnemonic={wizardState.mnemonic} onPhraseConfirmed={handlePhraseConfirmed} />
                ) : (
                    <div>Generating phrase... (Error if mnemonic not set)</div>
                );
            case "setupIdentity": // This step in THIS wizard is after "noIdentitiesFound"
                // It implies user wants to create a new identity.
                // It should probably navigate to the dedicated new identity setup route.
                // For now, let's make it a simple placeholder or redirect.
                // Ideally, the button in "noIdentitiesFound" navigates directly.
                // If this step is reached, it's a bit of a detour.
                // Let's assume "noIdentitiesFound" will navigate to /setup/new-identity directly.
                // This case might become redundant.
                return (
                    <div>
                        <p>Redirecting to new identity setup...</p>
                        {/* {setLocation("/setup/new-identity")} */}
                        {/* Auto-navigation can be tricky in render. Better to handle in button click. */}
                    </div>
                );
            case "importPhrase":
                return <ImportPhraseStep onPhraseVerified={handlePhraseImported} />;
            case "noIdentitiesFound":
                return (
                    <div className="text-center">
                        <h2 className="text-xl font-semibold mb-4">No Identities Found</h2>
                        <p className="mb-6 text-muted-foreground">We couldn't find any Vibe identities associated with the recovery phrase you provided.</p>
                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 justify-center">
                            <Button onClick={() => setLocation("/setup/new-identity")}>Create First Identity</Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setWizardState({});
                                    setCurrentStep("welcome");
                                }}
                            >
                                Try Different Phrase
                            </Button>
                        </div>
                    </div>
                );
            case "setupComplete":
                return (
                    <SetupCompleteStep
                        identityName={wizardState.identityName || undefined}
                        onStartUsingVibe={handleFullSetupCompletion} // Use the new handler
                    />
                );
            case "error":
                return (
                    <div className="text-red-500 text-center">
                        <h2 className="text-xl mb-4 font-semibold">Setup Error</h2>
                        <p className="mb-4">{wizardState.error || "An unknown error occurred."}</p>
                        <Button
                            onClick={() => {
                                setWizardState({});
                                setCurrentStep("welcome");
                            }}
                            variant="outline"
                        >
                            Restart Setup
                        </Button>
                    </div>
                );
            default:
                return <div className="text-red-500">Error: Invalid Step "{currentStep}"</div>;
        }
    };

    return (
        <div className="container mx-auto px-4 pt-8 sm:pt-12 min-h-screen flex flex-col justify-start items-center bg-background text-foreground">
            {renderStep()}
        </div>
    );
}

export default SetupWizardPage;
