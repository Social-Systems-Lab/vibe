import React, { useState, useCallback, useEffect } from "react";
import { WelcomeStep } from "./WelcomeStep";
import { CreatePasswordStep } from "./CreatePasswordStep";
import { ShowPhraseStep } from "./ShowPhraseStep";
import { NameIdentityStep } from "./NameIdentityStep";
import { ConfigureCloudStep } from "./ConfigureCloudStep";
import { ImportPhraseStep } from "./ImportPhraseStep"; // Import the import step
import { Button } from "@/components/ui/button";
import {
    generateSalt,
    deriveEncryptionKey,
    encryptData,
    seedFromMnemonic,
    getMasterHDKeyFromSeed,
    deriveChildKeyPair,
    wipeMemory,
    generateMnemonic, // Keep generateMnemonic
} from "@/lib/crypto"; // Import more crypto helpers
import { didFromEd25519, uint8ArrayToHex } from "@/lib/identity"; // Import DID generation and hex conversion
import { Buffer } from "buffer";

// Define localStorage keys (consistent with MockVibeAgent planned structure)
const LOCAL_STORAGE_VAULT_KEY = "vibe_agent_vault";
const LOCAL_STORAGE_VAULT_SALT_KEY = "vibe_agent_vault_salt";
const LOCAL_STORAGE_CLOUD_URL_KEY = "vibe_agent_cloud_url";
// Key for setup completion flag is defined in frontend.tsx

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
    | "complete"
    | "error"; // Add an error step

interface SetupWizardProps {
    onSetupComplete: () => void;
}

export function SetupWizard({ onSetupComplete }: SetupWizardProps) {
    const [currentStep, setCurrentStep] = useState<SetupStep>("welcome");
    // State to hold intermediate data during the wizard
    const [wizardState, setWizardState] = useState<{
        password?: string;
        mnemonic?: string;
        mnemonicBuffer?: Buffer;
        importedMnemonic?: string;
        identityName?: string | null;
        identityPicture?: string | null;
        cloudUrl?: string; // Added for cloud config
        claimCode?: string;
        error?: string; // For displaying errors during finish step
    }>({});

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
        (password: string) => {
            console.log("Password set by user.");
            setWizardState((prev) => ({ ...prev, password }));
            // Decide next step based on whether we came from new or import flow
            if (currentStep === "createPassword_new") {
                setCurrentStep("showPhrase"); // Generate and show phrase next
            } else if (currentStep === "createPassword_import") {
                // Finalize the import flow
                finalizeImportFlow(password); // Call async function to handle import finalization
            }
        },
        [currentStep] // Keep dependency on currentStep
    );

    // Called by ShowPhraseStep when user confirms they've backed up the phrase
    const handlePhraseConfirmed = useCallback(() => {
        console.log("User confirmed phrase backup.");
        // Securely wipe the mnemonic from memory now that it's confirmed
        if (wizardState.mnemonicBuffer) {
            wipeMemory(wizardState.mnemonicBuffer);
            setWizardState((prev) => ({ ...prev, mnemonicBuffer: undefined })); // Clear buffer from state
            console.log("Mnemonic buffer wiped from memory.");
        } else {
            console.warn("Mnemonic buffer not found in state for wiping.");
        }
        // TODO: Add optional "confirmPhrase" step here if desired
        setCurrentStep("nameIdentity"); // Proceed to naming the identity
    }, [wizardState.mnemonicBuffer]);

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
    const handleCloudConfigured = useCallback((url: string, claimCode: string) => {
        console.log("Cloud configuration set:", { url, claimCode });
        setWizardState((prev) => ({
            ...prev,
            cloudUrl: url,
            claimCode: claimCode,
        }));
        // This is the last step in the "Create New" flow before completion
        setCurrentStep("complete");
    }, []);

    // --- Import Flow Finalization ---
    // Moved logic here to keep handlePasswordSet cleaner and allow async operations
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

    // --- Create New Flow Finalization (handleFinish) ---
    const handleFinish = useCallback(async () => {
        console.log("Attempting to finalize 'Create New' setup...");
        setWizardState((prev) => ({ ...prev, error: undefined })); // Clear previous errors

        // Destructure state needed ONLY for the 'Create New' flow
        const { password, mnemonic, identityName, identityPicture, cloudUrl, claimCode } = wizardState;

        // --- Input Validation (for Create New flow) ---
        if (!password) {
            console.error("Create New Error: Password missing.");
            setWizardState((prev) => ({ ...prev, error: "Password was not set." }));
            setCurrentStep("error");
            return;
        }
        if (!mnemonic) {
            console.error("Create New Error: Mnemonic missing.");
            setWizardState((prev) => ({ ...prev, error: "Mnemonic phrase was not generated." }));
            setCurrentStep("error");
            return;
        }
        if (!cloudUrl || !claimCode) {
            console.error("Create New Error: Cloud configuration missing.");
            setWizardState((prev) => ({ ...prev, error: "Cloud configuration is incomplete." }));
            setCurrentStep("error");
            return;
        }

        // --- Cryptographic Operations ---
        let encryptionKey: CryptoKey | null = null;
        let seed: Buffer | null = null;
        try {
            console.log("Generating salt...");
            const salt = generateSalt(); // Generate a new salt
            const saltHex = Buffer.from(salt).toString("hex"); // Store salt as hex

            console.log("Deriving encryption key...");
            encryptionKey = await deriveEncryptionKey(password, salt);

            console.log("Encrypting mnemonic...");
            const encryptedMnemonicData = await encryptData(mnemonic, encryptionKey);

            console.log("Deriving seed from mnemonic...");
            // IMPORTANT: Use the *original* mnemonic here, not the wiped buffer!
            seed = await seedFromMnemonic(mnemonic);

            console.log("Deriving master HD key...");
            const masterHDKey = getMasterHDKeyFromSeed(seed);

            console.log("Deriving first identity key pair (index 0)...");
            const firstIdentityKeys = deriveChildKeyPair(masterHDKey, 0);

            console.log("Generating DID for first identity...");
            const firstDid = didFromEd25519(firstIdentityKeys.publicKey);

            // --- Construct Vault Data ---
            // Note: We store the *encrypted* mnemonic, not raw private keys here.
            // The agent will need to decrypt the mnemonic and re-derive keys on unlock.
            const vaultData = {
                encryptedSeedPhrase: encryptedMnemonicData, // Store { iv, ciphertext }
                identities: [
                    {
                        did: firstDid,
                        derivationPath: firstIdentityKeys.derivationPath,
                        // Use namespaced keys for profile info within the identity object
                        profile_name: identityName || null, // Store name provided by user (or null)
                        profile_picture: identityPicture || null, // Store picture data URL (or null)
                    },
                ],
                settings: {
                    nextAccountIndex: 1, // The next identity to derive will be index 1
                },
            };

            // --- Save to LocalStorage (for Create New flow) ---
            console.log("Saving vault salt, encrypted vault, and cloud URL to localStorage for 'Create New' flow...");
            localStorage.setItem(LOCAL_STORAGE_VAULT_SALT_KEY, saltHex);
            localStorage.setItem(LOCAL_STORAGE_VAULT_KEY, JSON.stringify(vaultData));
            localStorage.setItem(LOCAL_STORAGE_CLOUD_URL_KEY, cloudUrl); // Save cloud URL only for new setup
            // TODO: Perform the initial claim using the claimCode and firstDid? (Deferred)

            console.log("'Create New' setup data saved successfully.");

            // --- Final Cleanup & Completion ---
            // Wipe sensitive data from memory (encryption key, seed)
            // Note: Mnemonic buffer should already be wiped by handlePhraseConfirmed
            if (encryptionKey) {
                // CryptoKey cannot be directly wiped, rely on GC.
                encryptionKey = null;
            }
            if (seed) {
                wipeMemory(seed);
                seed = null;
                console.log("Seed buffer wiped from memory.");
            }

            console.log("'Create New' wizard finished successfully.");
            // Set setup complete flag and trigger transition
            localStorage.setItem("vibe_agent_setup_complete", "true"); // Use the key from frontend.tsx
            onSetupComplete();
        } catch (error) {
            console.error("Error during 'Create New' finalization:", error);
            setWizardState((prev) => ({ ...prev, error: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` }));
            setCurrentStep("error");

            // Attempt cleanup even on error
            if (encryptionKey) encryptionKey = null;
            if (seed) wipeMemory(seed);
        }
    }, [onSetupComplete, wizardState]);

    // --- Effects ---

    // Effect to generate mnemonic when entering the showPhrase step
    useEffect(() => {
        if (currentStep === "showPhrase" && !wizardState.mnemonic) {
            console.log("Generating new mnemonic phrase...");
            const newMnemonic = generateMnemonic(); // Generate 24 words by default
            const newMnemonicBuffer = Buffer.from(newMnemonic, "utf8"); // Store buffer for wiping
            setWizardState((prev) => ({
                ...prev,
                mnemonic: newMnemonic,
                mnemonicBuffer: newMnemonicBuffer, // Keep buffer temporarily
            }));
            console.log("Mnemonic generated.");
        }
    }, [currentStep, wizardState.mnemonic]);

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
            case "complete":
                // Final step before calling handleFinish
                return (
                    <div>
                        <h2 className="text-xl mb-4">Finalizing Setup...</h2>
                        {/* Optionally show a spinner here */}
                        <p className="text-sm text-muted-foreground mb-4">Saving your encrypted Vibe data.</p>
                        {/* Trigger finish automatically when reaching this step */}
                        {/* <button onClick={handleFinish} className="mt-6 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                            Complete Setup
                        </button> */}
                    </div>
                );
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
