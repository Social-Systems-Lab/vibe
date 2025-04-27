import React, { useState, useCallback, useEffect } from "react";
import { WelcomeStep } from "./WelcomeStep";
import { CreatePasswordStep } from "./CreatePasswordStep";
import { ShowPhraseStep } from "./ShowPhraseStep";
import { NameIdentityStep } from "./NameIdentityStep";
import { ConfigureCloudStep } from "./ConfigureCloudStep";
import { ImportPhraseStep } from "./ImportPhraseStep";
import { Button } from "@/components/ui/button";
import type { MockVibeAgent } from "@/vibe/agent";
// Restore crypto imports still needed for import/finish logic (will be removed later)
import {
    generateSalt,
    deriveEncryptionKey,
    encryptData,
    seedFromMnemonic,
    getMasterHDKeyFromSeed,
    deriveChildKeyPair,
    wipeMemory, // Needed for handlePhraseConfirmed, finalizeImportFlow, handleFinish
    generateMnemonic, // Still needed for effect hook
} from "@/lib/crypto";
import { Buffer } from "buffer"; // Needed for salt hex and seed wiping
import { didFromEd25519 } from "@/lib/identity"; // Needed for finalizeImportFlow/handleFinish

// Restore localStorage keys (still needed for finalizeImport/handleFinish)
const LOCAL_STORAGE_VAULT_KEY = "vibe_agent_vault";
const LOCAL_STORAGE_VAULT_SALT_KEY = "vibe_agent_vault_salt";
const LOCAL_STORAGE_CLOUD_URL_KEY = "vibe_agent_cloud_url";

// Define the possible steps in the setup process
type SetupStep =
    | "welcome"
    | "createPassword_new" // Differentiate password step for new vs import
    | "createPassword_import"
    | "showPhrase"
    // | "confirmPhrase"
    | "nameIdentity"
    | "configureCloud"
    | "importPhrase"
    // | "complete" // Removed, handled by handleCloudConfigured
    | "error";

interface SetupWizardProps {
    agent: MockVibeAgent; // Add agent prop
    onSetupComplete: () => void;
}

export function SetupWizard({ agent, onSetupComplete }: SetupWizardProps) {
    // Destructure agent prop
    const [currentStep, setCurrentStep] = useState<SetupStep>("welcome");
    // State to hold intermediate data during the wizard
    const [wizardState, setWizardState] = useState<{
        password?: string;
        mnemonic?: string; // Still needed to pass to ShowPhraseStep
        importedMnemonic?: string;
        identityName?: string | null;
        identityPicture?: string | null;
        cloudUrl?: string; // Added for cloud config
        claimCode?: string;
        error?: string; // For displaying errors during finish step
    }>({});

    // --- Import Flow Finalization ---
    // Moved logic here to keep handlePasswordSet cleaner and allow async operations
    // Define finalizeImportFlow *before* handlePasswordSet which uses it
    const finalizeImportFlow = useCallback(
        async (password: string) => {
            console.log("Attempting to finalize import flow...");
            setWizardState((prev) => ({ ...prev, error: undefined })); // Clear previous errors

            const { importedMnemonic } = wizardState;

            if (!importedMnemonic) {
                console.error("Import Error: Imported mnemonic missing.");
                setWizardState((prev) => ({ ...prev, error: "Imported recovery phrase is missing." }));
                setCurrentStep("error");
                return;
            }
            if (!password) {
                console.error("Import Error: Password missing.");
                setWizardState((prev) => ({ ...prev, error: "Password was not set." }));
                setCurrentStep("error");
                return;
            }

            let encryptionKey: CryptoKey | null = null;
            let seed: Buffer | null = null;
            try {
                // Generate a NEW salt for this device
                console.log("Generating new salt for imported vault...");
                const salt = generateSalt();
                const saltHex = Buffer.from(salt).toString("hex");

                console.log("Deriving encryption key for imported vault...");
                encryptionKey = await deriveEncryptionKey(password, salt);

                console.log("Encrypting imported mnemonic...");
                // Encrypt the IMPORTED mnemonic
                const encryptedMnemonicData = await encryptData(importedMnemonic, encryptionKey);

                console.log("Deriving seed from imported mnemonic...");
                seed = await seedFromMnemonic(importedMnemonic); // Use imported mnemonic

                console.log("Deriving master HD key from imported seed...");
                const masterHDKey = getMasterHDKeyFromSeed(seed);

                console.log("Deriving first identity key pair (index 0) from imported seed...");
                const firstIdentityKeys = deriveChildKeyPair(masterHDKey, 0);

                console.log("Generating DID for first identity...");
                const firstDid = didFromEd25519(firstIdentityKeys.publicKey);

                // Construct Vault Data for Import
                // Profile info (name/picture) is NOT restored from seed, set to null.
                // Cloud URL is also not restored, user needs to configure later (or we add a step).
                const vaultData = {
                    encryptedSeedPhrase: encryptedMnemonicData,
                    identities: [
                        {
                            did: firstDid,
                            derivationPath: firstIdentityKeys.derivationPath,
                            profile_name: null,
                            profile_picture: null,
                        },
                        // TODO: Implement basic account discovery? (e.g., derive index 1, 2)
                        // For MVP, just restore the first one.
                    ],
                    settings: {
                        nextAccountIndex: 1, // Assume at least one account exists
                        // TODO: More robust discovery needed post-MVP
                    },
                };

                // Save ONLY the salt and vault for import flow
                // Cloud URL needs separate configuration after import.
                console.log("Saving new vault salt and encrypted vault to localStorage for import...");
                localStorage.setItem(LOCAL_STORAGE_VAULT_SALT_KEY, saltHex);
                localStorage.setItem(LOCAL_STORAGE_VAULT_KEY, JSON.stringify(vaultData));
                // DO NOT save cloud URL here for import flow

                console.log("Import data saved successfully.");

                // --- Final Cleanup & Completion ---
                if (encryptionKey) encryptionKey = null;
                if (seed) {
                    wipeMemory(seed);
                    seed = null;
                    console.log("Imported seed buffer wiped from memory.");
                }
                // Wipe the imported mnemonic from state if still present (shouldn't be needed)
                setWizardState((prev) => ({ ...prev, importedMnemonic: undefined }));

                console.log("Import wizard finished successfully.");
                // Set setup complete flag and trigger transition via onSetupComplete
                // We need to set the flag here as well
                localStorage.setItem("vibe_agent_setup_complete", "true"); // Use the key from frontend.tsx
                onSetupComplete();
            } catch (error) {
                console.error("Error during import finalization:", error);
                setWizardState((prev) => ({
                    ...prev,
                    error: `An unexpected error occurred during import: ${error instanceof Error ? error.message : String(error)}`,
                }));
                setCurrentStep("error");

                // Attempt cleanup even on error
                if (encryptionKey) encryptionKey = null;
                if (seed) wipeMemory(seed);
            }
        },
        [wizardState, onSetupComplete] // Dependencies
    );

    // --- Step Navigation & Logic Callbacks ---

    const handleCreateNew = useCallback(() => {
        console.log("User chose: Create New Vibe");
        setCurrentStep("createPassword_new"); // Go to password creation for new flow
    }, []);

    const handleImportExisting = useCallback(() => {
        console.log("User chose: Import Existing Vibe");
        setCurrentStep("importPhrase"); // Go to phrase import
    }, []);

    // Called by CreatePasswordStep when password is successfully set
    const handlePasswordSet = useCallback(
        async (password: string) => {
            // Make async
            console.log("Password set by user.");
            setWizardState((prev) => ({ ...prev, password, error: undefined })); // Clear previous errors

            if (currentStep === "createPassword_new") {
                try {
                    console.log("Calling agent.createNewVault...");
                    const mnemonic = await agent.createNewVault(password);
                    console.log("Agent createNewVault successful, mnemonic received.");
                    setWizardState((prev) => ({ ...prev, mnemonic })); // Store mnemonic from agent
                    setCurrentStep("showPhrase"); // Proceed to show phrase
                } catch (error) {
                    console.error("Error calling agent.createNewVault:", error);
                    setWizardState((prev) => ({
                        ...prev,
                        error: `Failed to create vault: ${error instanceof Error ? error.message : String(error)}`,
                    }));
                    setCurrentStep("error");
                }
            } else if (currentStep === "createPassword_import") {
                // Finalize the import flow (logic remains here for now)
                finalizeImportFlow(password);
            }
        },
        [agent, currentStep, finalizeImportFlow] // Dependencies updated in previous step
    );

    // Called by ShowPhraseStep when user confirms they've backed up the phrase
    const handlePhraseConfirmed = useCallback(() => {
        console.log("User confirmed phrase backup.");
        // Agent handles mnemonic lifecycle internally now.
        // No need to wipe mnemonicBuffer here.
        // Clear mnemonic from wizard state as it's no longer needed here.
        setWizardState((prev) => ({ ...prev, mnemonic: undefined, mnemonicBuffer: undefined }));
        // TODO: Add optional "confirmPhrase" step here if desired
        setCurrentStep("nameIdentity"); // Proceed to naming the identity
    }, []); // No dependencies needed now

    // Called by NameIdentityStep when user saves or skips profile info
    const handleIdentityNamed = useCallback((name: string | null, picture?: string | null) => {
        console.log("Identity profile set/skipped:", { name, picture: picture ? "[data url]" : null });
        setWizardState((prev) => ({
            ...prev,
            identityName: name,
            identityPicture: picture,
        }));
        setCurrentStep("configureCloud"); // Proceed to cloud configuration
    }, []);

    // Called by ImportPhraseStep when the user enters a valid mnemonic
    const handlePhraseImported = useCallback((mnemonic: string) => {
        console.log("Phrase imported and verified.");
        setWizardState((prev) => ({
            ...prev,
            importedMnemonic: mnemonic, // Store the imported phrase
            mnemonic: undefined, // Ensure generated mnemonic is cleared if user switched flows
            mnemonicBuffer: undefined,
        }));
        // Next step after importing is to set a *new* device password
        setCurrentStep("createPassword_import");
    }, []);

    // Called by ConfigureCloudStep when user confirms URL and claim code
    const handleCloudConfigured = useCallback(
        (url: string, claimCode: string) => {
            console.log("Cloud configuration set:", { url, claimCode });
            setWizardState((prev) => ({
                ...prev,
                cloudUrl: url,
            }));
            // TODO: Save cloudUrl and claimCode to agent state if needed
            // This is now the final step for the 'Create New' flow.
            // Set setup complete flag and trigger transition
            localStorage.setItem("vibe_agent_setup_complete", "true"); // Use the key from frontend.tsx
            onSetupComplete();
        },
        [onSetupComplete]
    ); // Removed wizardState dependency as it's not used directly

    // --- Create New Flow Finalization (handleFinish) --- REMOVED ---

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
            case "nameIdentity":
                return <NameIdentityStep onIdentityNamed={handleIdentityNamed} />;
            case "configureCloud":
                return <ConfigureCloudStep onCloudConfigured={handleCloudConfigured} />;
            case "importPhrase":
                return <ImportPhraseStep onPhraseVerified={handlePhraseImported} />;
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
