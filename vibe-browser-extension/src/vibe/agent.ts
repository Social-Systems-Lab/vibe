// Placeholder for Vibe Agent types and eventually the actual agent implementation
// for the browser extension.

export interface VibeAgent {
    // Define common agent methods that the UI might interact with during setup or general use.
    // This is a placeholder and will be expanded based on actual agent implementation.

    /**
     * Creates a new vault with the given password, generates a new mnemonic,
     * and stores the encrypted seed phrase.
     * @param password - The password to encrypt the vault.
     * @returns The generated mnemonic phrase.
     */
    createNewVault: (password: string) => Promise<string>;

    /**
     * Imports an existing vault using a mnemonic and password.
     * Encrypts the provided seed phrase with the new password.
     * @param mnemonic - The mnemonic phrase to import.
     * @param password - The password to encrypt the new vault.
     * @returns A promise that resolves when the import is complete.
     */
    importVaultFromMnemonic: (mnemonic: string, password: string) => Promise<void>;

    // Add other methods as the agent's capabilities are defined, e.g.:
    // unlockVault: (password: string) => Promise<boolean>;
    // getActiveIdentity: () => Promise<Identity | null>;
    // etc.
}

// For SetupWizard.tsx, it currently expects MockVibeAgent.
// We'll define a compatible type here.
// This will be replaced or merged with the actual VibeAgent implementation.
export type MockVibeAgent = VibeAgent;

// Example of how the actual agent might be instantiated or accessed later:
// export const extensionAgent: VibeAgent = { ... implementation ... };
