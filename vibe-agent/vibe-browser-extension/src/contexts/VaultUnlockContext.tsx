import React, { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react"; // Import ReactNode as a type
import { PasswordPromptModal } from "@/components/identity/PasswordPromptModal";
// import { VibeBackgroundMessage, VibeBackgroundResponse } from "@/background-modules/types"; // Assuming types exist - commented out for now
import type { ChromeMessage } from "@/background-modules/types"; // Assuming ChromeMessage is defined here or import from a shared types file

interface VaultUnlockOptions {
    title?: string;
    description?: string;
    forcePrompt?: boolean; // New option
}

interface VaultUnlockContextType {
    requestUnlockAndPerformAction: <T>(actionFn: (password?: string) => Promise<T>, options?: VaultUnlockOptions) => Promise<T>;
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
        <T extends unknown>(actionFn: (password?: string) => Promise<T>, options: VaultUnlockOptions = {}): Promise<T> => {
            return new Promise<T>(async (resolve, reject) => {
                // Added async here for vault status check
                const { forcePrompt = false, title, description } = options;

                // Placeholder for vault status check
                // In a real implementation, this would be an async call to the background script
                // const isVaultLocked = await getVaultStatusFromBackground();
                let isVaultLocked = true; // Default to locked for safety if check fails
                try {
                    const response = (await chrome.runtime.sendMessage({
                        type: "VIBE_AGENT_REQUEST",
                        action: "GET_LOCK_STATE", // Corrected action name
                        requestId: crypto.randomUUID().toString(),
                    })) as ChromeMessage;
                    if (response && response.type === "VIBE_AGENT_RESPONSE" && typeof response.payload?.isUnlocked === "boolean") {
                        isVaultLocked = !response.payload.isUnlocked; // Correctly interpret isUnlocked
                    } else {
                        console.warn("Could not determine vault status from GET_LOCK_STATE, assuming locked.", response);
                    }
                } catch (e) {
                    console.error("Error calling GET_LOCK_STATE:", e, "Assuming locked.");
                }

                if (!forcePrompt && !isVaultLocked) {
                    // Vault is unlocked and prompt is not forced, perform action directly
                    try {
                        setOperationInProgress(true);
                        const result = await actionFn(); // No password passed
                        resolve(result);
                    } catch (error: any) {
                        console.error("Error during action (vault unlocked, no prompt):", error);
                        setErrorMessage(error.message || "Operation failed.");
                        reject(error);
                    } finally {
                        setOperationInProgress(false);
                    }
                    return;
                }

                // Proceed with modal if prompt is forced or vault is locked
                setModalConfig({
                    title: title || "Vault Locked",
                    description: description || "Please enter your vault password to proceed.",
                    actionFnWrapper: async (password: string) => {
                        setOperationInProgress(true);
                        setErrorMessage(undefined);
                        try {
                            const result = await actionFn(password);
                            resolve(result);
                            setIsModalOpen(false);
                        } catch (error: any) {
                            console.error("Error during action after password prompt:", error);
                            setErrorMessage(error.message || "Operation failed after unlock attempt.");
                            throw error;
                        } finally {
                            setOperationInProgress(false);
                        }
                    },
                    resolvePromise: resolve,
                    rejectPromise: reject,
                });
                setIsModalOpen(true);
            });
        },
        [] // Dependencies might be needed if getVaultStatusFromBackground were a hook-based state
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
