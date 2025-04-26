import React, { createContext, useState, useContext, useCallback } from "react";
import type { ReactNode } from "react";
import type { ConsentRequest, ActionRequest, ActionResponse, PermissionSetting, Identity } from "./types";
import { ConsentModal } from "@/components/agent/ConsentModal"; // Adjust path
import { ActionPromptModal } from "@/components/agent/ActionPromptModal"; // Adjust path
// Import PermissionManager if it's to be controlled here, or handle navigation separately
// import { PermissionManager } from "@/components/agent/PermissionManager";

interface AgentUIContextValue {
    // Consent Modal State & Control
    isConsentOpen: boolean;
    consentRequest: ConsentRequest | null;
    requestConsent: (request: ConsentRequest) => Promise<Record<string, PermissionSetting>>; // Returns granted permissions

    // Action Prompt Modal State & Control
    isActionPromptOpen: boolean;
    actionRequest: ActionRequest | null;
    requestActionConfirmation: (request: ActionRequest) => Promise<ActionResponse>;

    // TODO: Add state/control for Permission Manager if needed
    // isPermissionManagerOpen: boolean;
    // openPermissionManager: (identityDid: string) => void;
    // closePermissionManager: () => void;
}

const AgentUIContext = createContext<AgentUIContextValue | undefined>(undefined);

interface AgentUIProviderProps {
    children: ReactNode;
}

export function AgentUIProvider({ children }: AgentUIProviderProps) {
    const [isConsentOpen, setIsConsentOpen] = useState(false);
    const [consentRequest, setConsentRequest] = useState<ConsentRequest | null>(null);
    const [consentResolver, setConsentResolver] = useState<((result: Record<string, PermissionSetting> | null) => void) | null>(null);

    const [isActionPromptOpen, setIsActionPromptOpen] = useState(false);
    const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null);
    const [actionResolver, setActionResolver] = useState<((result: ActionResponse) => void) | null>(null);

    // --- Consent Modal Logic ---
    const requestConsent = useCallback((request: ConsentRequest): Promise<Record<string, PermissionSetting>> => {
        return new Promise((resolve, reject) => {
            setConsentRequest(request);
            setIsConsentOpen(true);
            setConsentResolver(() => (result: Record<string, PermissionSetting> | null) => {
                setIsConsentOpen(false);
                setConsentRequest(null);
                setConsentResolver(null);
                if (result) {
                    resolve(result); // User allowed, return granted permissions
                } else {
                    reject(new Error("User denied consent request.")); // User denied
                }
            });
        });
    }, []);

    const handleConsentDecision = (grantedPermissions: Record<string, PermissionSetting> | null) => {
        if (consentResolver) {
            consentResolver(grantedPermissions);
        }
    };

    // --- Action Prompt Modal Logic ---
    const requestActionConfirmation = useCallback((request: ActionRequest): Promise<ActionResponse> => {
        return new Promise((resolve) => {
            // No reject needed, ActionResponse includes allowed: false
            setActionRequest(request);
            setIsActionPromptOpen(true);
            setActionResolver(() => (result: ActionResponse) => {
                setIsActionPromptOpen(false);
                setActionRequest(null);
                setActionResolver(null);
                resolve(result); // Resolve with the user's decision (allow/deny + remember)
            });
        });
    }, []);

    const handleActionDecision = (response: ActionResponse) => {
        if (actionResolver) {
            actionResolver(response);
        }
    };

    // --- Context Value ---
    const contextValue: AgentUIContextValue = {
        isConsentOpen,
        consentRequest,
        requestConsent,
        isActionPromptOpen,
        actionRequest,
        requestActionConfirmation,
    };

    return (
        <AgentUIContext.Provider value={contextValue}>
            {children}
            {/* Render Modals controlled by this context */}
            <ConsentModal isOpen={isConsentOpen} request={consentRequest} onDecision={handleConsentDecision} />
            <ActionPromptModal isOpen={isActionPromptOpen} request={actionRequest} onDecision={handleActionDecision} />
            {/* TODO: Render Permission Manager if controlled here */}
        </AgentUIContext.Provider>
    );
}

export function useAgentUI() {
    const context = useContext(AgentUIContext);
    if (context === undefined) {
        throw new Error("useAgentUI must be used within an AgentUIProvider");
    }
    return context;
}
