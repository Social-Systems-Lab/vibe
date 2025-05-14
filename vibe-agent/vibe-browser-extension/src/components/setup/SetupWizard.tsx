import React, { useState, useCallback } from "react";
import { WelcomeStep } from "./WelcomeStep.tsx";
import { CreatePasswordStep } from "./CreatePasswordStep.tsx";
import { ShowPhraseStep } from "./ShowPhraseStep.tsx";
// NameIdentityStep and ConfigureCloudStep removed
import { ImportPhraseStep } from "./ImportPhraseStep.tsx";
import { SetupCompleteStep } from "./SetupCompleteStep.tsx";
import { SetupIdentityStep } from "./SetupIdentityStep.tsx"; // Added import
import { Button } from "@/components/ui/button.tsx";
// import type { MockVibeAgent } from "@/vibe/agent"; // Agent prop no longer needed for createNewVault

// Crypto imports are no longer needed here, background script handles them.
// Buffer might still be needed if we handle raw binary data, but likely not.
// import { Buffer } from "buffer";
// didFromEd25519 is also handled by background.

// localStorage keys are no longer needed here.

// Define the possible steps in the setup process
type SetupStep =
    | "welcome"
    | "createPassword_new" // Differentiate password step for new vs import
    | "createPassword_import"
    | "showPhrase"
    // | "confirmPhrase"
    | "setupIdentity" // Replaces nameIdentity and configureCloud
    | "importPhrase"
    | "setupComplete"
    // | "complete" // Removed, handled by handleCloudConfigured
    | "error";

interface SetupWizardProps {
    // agent: MockVibeAgent; // Agent prop no longer needed
    onSetupComplete: () => void;
}

export function SetupWizard({ onSetupComplete }: SetupWizardProps) {
    const [currentStep, setCurrentStep] = useState<SetupStep>("welcome");
    const [wizardState, setWizardState] = useState<{
        password?: string;
        mnemonic?: string; // For displaying to user after generation
        importedMnemonic?: string; // For passing to background during import
        identityName?: string | null;
        identityPicture?: string | null;
        cloudUrl?: string;
        claimCode?: string;
        error?: string;
    }>({});

    // --- Import Flow Finalization (now calls background script) ---
    const finalizeImportFlow = useCallback(
        async (password: string) => {
            console.log("Attempting to finalize import flow via background script...");
            setWizardState((prev) => ({ ...prev, error: undefined }));

            const { importedMnemonic } = wizardState;

            if (!importedMnemonic) {
                console.error("Import Error: Imported mnemonic missing in wizard state.");
                setWizardState((prev) => ({ ...prev, error: "Imported recovery phrase is missing." }));
                setCurrentStep("error");
                return;
            }
            if (!password) {
                console.error("Import Error: Password missing in wizard state.");
                setWizardState((prev) => ({ ...prev, error: "Password was not set." }));
                setCurrentStep("error");
                return;
            }

            try {
                const response = await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST", // Consistent with other agent messages
                    action: "SETUP_IMPORT_VAULT",
                    payload: { importedMnemonic, password },
                });

                console.log("Background response from SETUP_IMPORT_VAULT:", response);

                if (response?.error) {
                    throw new Error(response.error.message || "Failed to import vault via background.");
                }
                if (!response?.payload?.success) {
                    throw new Error(response?.payload?.message || "Background import reported failure.");
                }

                console.log("Import vault successful via background script.");
                setWizardState((prev) => ({ ...prev, importedMnemonic: undefined })); // Clear imported mnemonic

                // Mark setup complete (background script handles storage)
                // The background script for SETUP_IMPORT_VAULT doesn't mark setup complete.
                // It only creates the vault. The "SETUP_COMPLETE_AND_FINALIZE" is for new vault flow.
                // For import, we might need a separate "mark complete" or just call onSetupComplete.
                // Let's assume for now that after import, the user might still go through naming/cloud.
                // OR, if import is the *final* step, we tell background to mark complete.
                // The original code called localStorage.setItem("vibe_agent_setup_complete", "true");
                // and then onSetupComplete().
                // Let's send a message to background to mark setup complete.
                // await chrome.runtime.sendMessage({ type: "MARK_SETUP_COMPLETE" }); // This is now handled by SETUP_COMPLETE_AND_FINALIZE
                // console.log("MARK_SETUP_COMPLETE message sent to background.");
                // onSetupComplete(); // This is also handled later

                // Instead, transition to the setupIdentity step to configure the imported identity
                console.log("Vault import successful, proceeding to identity setup step.");
                // Optionally, pass the DID from response.payload.did to wizardState if needed by SetupIdentityStep
                // For now, SetupIdentityStep doesn't require it directly, but it's good to have in wizardState
                if (response.payload?.did) {
                    setWizardState((prev) => ({ ...prev /* importedIdentityDid: response.payload.did */ }));
                }
                setCurrentStep("setupIdentity");
            } catch (error) {
                console.error("Error during background import finalization:", error);
                setWizardState((prev) => ({
                    ...prev,
                    error: `An unexpected error occurred during import: ${error instanceof Error ? error.message : String(error)}`,
                }));
                setCurrentStep("error");
            }
        },
        [wizardState, onSetupComplete]
    );

    const handleCreateNew = useCallback(() => {
        console.log("User chose: Create New Vibe");
        setCurrentStep("createPassword_new");
    }, []);

    const handleImportExisting = useCallback(() => {
        console.log("User chose: Import Existing Vibe");
        setCurrentStep("importPhrase");
    }, []);

    const handlePasswordSet = useCallback(
        async (password: string) => {
            console.log("Password set by user.");
            setWizardState((prev) => ({ ...prev, password, error: undefined }));

            if (currentStep === "createPassword_new") {
                try {
                    console.log("Requesting new vault creation from background script...");
                    const response = await chrome.runtime.sendMessage({
                        type: "VIBE_AGENT_REQUEST",
                        action: "SETUP_CREATE_VAULT",
                        payload: { password },
                    });

                    console.log("Background response from SETUP_CREATE_VAULT:", response);

                    if (response?.error) {
                        throw new Error(response.error.message || "Failed to create vault.");
                    }
                    if (!response?.payload?.mnemonic) {
                        throw new Error("Mnemonic not received from background script.");
                    }

                    console.log("New vault created by background, mnemonic received.");
                    setWizardState((prev) => ({ ...prev, mnemonic: response.payload.mnemonic }));
                    setCurrentStep("showPhrase");
                } catch (error) {
                    console.error("Error creating new vault via background:", error);
                    setWizardState((prev) => ({
                        ...prev,
                        error: `Failed to create vault: ${error instanceof Error ? error.message : String(error)}`,
                    }));
                    setCurrentStep("error");
                }
            } else if (currentStep === "createPassword_import") {
                finalizeImportFlow(password);
            }
        },
        [currentStep, finalizeImportFlow]
    );

    const handlePhraseConfirmed = useCallback(() => {
        console.log("User confirmed phrase backup.");
        // Mnemonic is now managed by ShowPhraseStep or cleared from state after use.
        // Background script handles the actual seed phrase.
        // setWizardState((prev) => ({ ...prev, mnemonic: undefined })); // Clear from wizard state // Intentionally kept for SETUP_COMPLETE_AND_FINALIZE
        setCurrentStep("setupIdentity"); // Changed to new step
    }, []);

    // handleIdentityNamed and handleCloudConfigured are replaced by handleIdentitySetup
    // const handleIdentityNamed = useCallback((name: string | null, picture?: string | null) => {
    //     console.log("Identity profile set/skipped:", { name, picture: picture ? "yes" : "no" });
    //     setWizardState((prev) => ({
    //         ...prev,
    //         identityName: name,
    //         identityPicture: picture,
    //     }));
    //     setCurrentStep("configureCloud");
    // }, []);

    const handlePhraseImported = useCallback((mnemonic: string) => {
        console.log("Phrase imported by user and verified by ImportPhraseStep.");
        setWizardState((prev) => ({
            ...prev,
            importedMnemonic: mnemonic,
            mnemonic: undefined, // Clear any generated mnemonic
        }));
        setCurrentStep("createPassword_import");
    }, []);

    // Combined handler for the new SetupIdentityStep
    const handleIdentitySetup = useCallback(
        async (details: { identityName: string | null; identityPicture: string | null; cloudUrl: string; claimCode: string | null }) => {
            console.log("Identity setup details received:", details);
            setWizardState((prev) => ({
                ...prev,
                identityName: details.identityName,
                identityPicture: details.identityPicture,
                cloudUrl: details.cloudUrl,
                claimCode: details.claimCode || undefined, // Ensure undefined if null
                error: undefined,
            }));

            const { password, mnemonic, importedMnemonic } = wizardState;
            const finalMnemonic = mnemonic || importedMnemonic;

            if (!password || !finalMnemonic) {
                console.error("Error finalizing setup: Password or mnemonic missing from wizard state.");
                setWizardState((prev) => ({
                    ...prev,
                    error: "Critical error: Password or recovery phrase missing. Please restart setup.",
                }));
                setCurrentStep("error");
                return;
            }

            try {
                console.log("Requesting setup finalization from background script...");
                const response = await chrome.runtime.sendMessage({
                    type: "VIBE_AGENT_REQUEST",
                    action: "SETUP_COMPLETE_AND_FINALIZE",
                    payload: {
                        // Pass all details collected from SetupIdentityStep
                        identityName: details.identityName,
                        identityPicture: details.identityPicture,
                        cloudUrl: details.cloudUrl,
                        claimCode: details.claimCode,
                        // Pass sensitive data needed for key derivation and signing
                        password: password,
                        mnemonic: finalMnemonic,
                    },
                });

                console.log("Background response from SETUP_COMPLETE_AND_FINALIZE:", response);

                if (response?.error) {
                    throw new Error(response.error.message || "Failed to finalize setup.");
                }
                if (!response?.payload?.success) {
                    throw new Error(response?.payload?.message || "Background finalization reported failure.");
                }

                console.log("Setup finalized successfully via background script.");
                // Navigate to the new complete step
                setWizardState((prev) => ({ ...prev, identityName: response.payload?.identityName || prev.identityName }));
                setCurrentStep("setupComplete");
                // onSetupComplete(); // This will be called by the new step's button handler
            } catch (error) {
                console.error("Error finalizing setup via background:", error);
                setWizardState((prev) => ({
                    ...prev,
                    error: `Failed to finalize setup: ${error instanceof Error ? error.message : String(error)}`,
                }));
                setCurrentStep("error");
            }
        },
        [wizardState, onSetupComplete]
    );

    // --- Render Logic ---

    const renderStep = () => {
        switch (currentStep) {
            case "welcome":
                return <WelcomeStep onCreateNew={handleCreateNew} onImportExisting={handleImportExisting} />;
            case "createPassword_new":
                return <CreatePasswordStep onPasswordSet={handlePasswordSet} isImportFlow={false} />;
            case "createPassword_import":
                // This step is reached after successfully validating the imported phrase
                return <CreatePasswordStep onPasswordSet={handlePasswordSet} isImportFlow={true} />;
            case "showPhrase":
                return wizardState.mnemonic ? (
                    <ShowPhraseStep mnemonic={wizardState.mnemonic} onPhraseConfirmed={handlePhraseConfirmed} />
                ) : (
                    <div>Generating phrase...</div>
                );
            case "setupIdentity": // New combined step
                return <SetupIdentityStep onIdentitySetup={handleIdentitySetup} />;
            // nameIdentity and configureCloud cases removed
            case "importPhrase":
                return <ImportPhraseStep onPhraseVerified={handlePhraseImported} />;
            case "setupComplete":
                return (
                    <SetupCompleteStep
                        identityName={wizardState.identityName || undefined}
                        onStartUsingVibe={() => {
                            // Send message to background to close the tab
                            chrome.runtime.sendMessage({ type: "VIBE_AGENT_REQUEST", action: "CLOSE_SETUP_TAB" });
                            onSetupComplete(); // Call original completion handler
                        }}
                    />
                );
            // case "complete": // Removed
            //     return ( <div>Finalizing...</div> );
            case "error":
                // Display error message
                return (
                    <div className="text-red-500 text-center">
                        <h2 className="text-xl mb-4 font-semibold">Setup Error</h2>
                        <p className="mb-4">{wizardState.error || "An unknown error occurred."}</p>
                        <Button onClick={() => setCurrentStep("welcome")} variant="outline">
                            Restart Setup
                        </Button>
                    </div>
                );
            default:
                // Should not happen
                return <div className="text-red-500">Error: Invalid Step "{currentStep}"</div>;
        }
    };

    return (
        <div className="container mx-auto p-4 sm:p-8 min-h-screen flex flex-col justify-center items-center">
            {/* We might not need the main title on every step if the step component has its own title */}
            {/* <h1 className="text-3xl font-bold mb-8">Vibe Setup Wizard</h1> */}
            {renderStep()}
        </div>
    );
}
