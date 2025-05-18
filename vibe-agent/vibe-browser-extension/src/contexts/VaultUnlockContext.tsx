import React, { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react"; // Import ReactNode as a type
import { PasswordPromptModal } from "@/components/identity/PasswordPromptModal";
// import { VibeBackgroundMessage, VibeBackgroundResponse } from "@/background-modules/types"; // Assuming types exist - commented out for now

interface VaultUnlockContextType {
    requestUnlockAndPerformAction: <T>(actionFn: (password?: string) => Promise<T>, options?: { title?: string; description?: string }) => Promise<T>;
}

const VaultUnlockContext = createContext<VaultUnlockContextType | undefined>(undefined);

export const useVaultUnlock = (): VaultUnlockContextType => {
    const context = useContext(VaultUnlockContext);
    if (!context) {
        throw new Error("useVaultUnlock must be used within a VaultUnlockProvider");
    }
    return context;
};

interface VaultUnlockProviderProps {
    children: ReactNode;
}

export const VaultUnlockProvider: React.FC<VaultUnlockProviderProps> = ({ children }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalConfig, setModalConfig] = useState<{
        title?: string;
        description?: string;
        actionFnWrapper?: (password: string) => Promise<any>; // Return type changed to any for simplicity with resolve
        resolvePromise?: (value: any) => void;
        rejectPromise?: (reason?: any) => void;
    }>({});
    const [operationInProgress, setOperationInProgress] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const requestUnlockAndPerformAction = useCallback(
        <T extends unknown>( // Explicitly type T for useCallback
            actionFn: (password?: string) => Promise<T>,
            options: { title?: string; description?: string } = {}
        ): Promise<T> => {
            return new Promise<T>((resolve, reject) => {
                // Removed async here, actionFnWrapper is async
                setModalConfig({
                    title: options.title || "Vault Locked",
                    description: options.description || "Please enter your vault password to proceed.",
                    actionFnWrapper: async (password: string) => {
                        setOperationInProgress(true);
                        setErrorMessage(undefined);
                        try {
                            const result = await actionFn(password);
                            resolve(result); // Resolve the main promise
                            setIsModalOpen(false); // Close modal on success
                        } catch (error: any) {
                            console.error("Error during action after password prompt:", error);
                            setErrorMessage(error.message || "Operation failed after unlock attempt.");
                            // Let PasswordPromptModal display the error and user retry/cancel.
                            // The main promise is not rejected here to allow retries from modal.
                            // It will be rejected if the modal is cancelled (in handleCloseModal).
                            throw error; // Re-throw for PasswordPromptModal to catch and display
                        } finally {
                            setOperationInProgress(false);
                        }
                    },
                    resolvePromise: resolve, // Storing resolve
                    rejectPromise: reject, // Storing reject
                });
                setIsModalOpen(true);
            });
        },
        [] // No dependencies, as it only uses its own arguments and setState
    );

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        if (modalConfig.rejectPromise && !operationInProgress) {
            // Only reject if not in an operation that might succeed
            modalConfig.rejectPromise(new Error("Operation cancelled by user."));
        }
        setErrorMessage(undefined); // Clear error message when modal is closed by cancellation
        // Do not reset operationInProgress here as it's handled by actionFnWrapper finally block
    }, [modalConfig.rejectPromise, operationInProgress]); // Added dependencies

    return (
        <VaultUnlockContext.Provider value={{ requestUnlockAndPerformAction }}>
            {children}
            <PasswordPromptModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSubmit={async (password) => {
                    if (modalConfig.actionFnWrapper) {
                        try {
                            await modalConfig.actionFnWrapper(password);
                            // If actionFnWrapper resolves, it means the main promise was resolved
                            // and modal was closed.
                        } catch (e) {
                            // Error is caught and displayed by PasswordPromptModal's internal state.
                            // No need to do anything further here for error display.
                        }
                    }
                }}
                title={modalConfig.title}
                description={modalConfig.description}
                operationInProgress={operationInProgress}
                errorMessage={errorMessage}
            />
        </VaultUnlockContext.Provider>
    );
};
