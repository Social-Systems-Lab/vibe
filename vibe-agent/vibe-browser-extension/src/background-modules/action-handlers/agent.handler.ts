import * as Constants from "../constants";
import * as Types from "../types";
import * as SessionManager from "../session-manager";
import * as TokenManager from "../token-manager"; // Needed for GET_AGENT_STATUS token check

export async function handleGetAgentStatus(): Promise<{ responsePayload: any; responseType: string }> {
    let responsePayload: any;
    let responseType = "VIBE_AGENT_RESPONSE"; // Default to success

    // Attempt to load from session first (checks for decrypted seed)
    if (!SessionManager.isUnlocked) {
        // Try to load identity if in-memory seed might exist (e.g. service worker restarted)
        await SessionManager.loadActiveIdentity();
    }

    if (SessionManager.isUnlocked && SessionManager.currentActiveDid) {
        // Successfully loaded an active identity from session (vault is unlocked)
        responsePayload = {
            did: SessionManager.currentActiveDid,
            permissions: { "profile:read": "always" }, // Example permission
            message: "Successfully initialized.",
            code: "INITIALIZED_UNLOCKED",
        };
    } else {
        // Vault is locked, or no active identity could be loaded from session.
        const localData = await chrome.storage.local.get(Constants.STORAGE_KEY_LAST_ACTIVE_DID);
        const lastActiveDid = localData[Constants.STORAGE_KEY_LAST_ACTIVE_DID];

        if (lastActiveDid) {
            try {
                await TokenManager.getValidCpAccessToken(lastActiveDid);
                SessionManager.setCurrentActiveDid(lastActiveDid); // Ensure this is set for UI context
                responsePayload = {
                    did: lastActiveDid,
                    permissions: { "profile:read": "always" },
                    message: "Successfully initialized using stored token.",
                    code: "INITIALIZED_UNLOCKED", // Treat as unlocked for UI flow
                };
            } catch (tokenError: any) {
                if (tokenError.message && tokenError.message.startsWith("FULL_LOGIN_REQUIRED")) {
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = {
                        error: {
                            message: "Vault is locked. Unlock to access your last active identity.",
                            code: "UNLOCK_REQUIRED_FOR_LAST_ACTIVE",
                            lastActiveDid: lastActiveDid,
                        },
                    };
                } else {
                    console.error(`Unexpected error during token validation for init: ${tokenError.message}`);
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                    responsePayload = {
                        error: {
                            message: `Error initializing session: ${tokenError.message}`,
                            code: "INIT_TOKEN_ERROR",
                            lastActiveDid: lastActiveDid,
                        },
                    };
                }
            }
        } else {
            // Vault is locked, and no last active DID
            const setupCompleteResult = await chrome.storage.local.get(Constants.STORAGE_KEY_SETUP_COMPLETE);
            const vaultAfterSetupCheck = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];

            if (!setupCompleteResult[Constants.STORAGE_KEY_SETUP_COMPLETE]) {
                responseType = "VIBE_AGENT_RESPONSE_ERROR";
                responsePayload = { error: { message: "Setup not complete.", code: "SETUP_NOT_COMPLETE" } };
            } else if (
                setupCompleteResult[Constants.STORAGE_KEY_SETUP_COMPLETE] &&
                (!vaultAfterSetupCheck || !vaultAfterSetupCheck.identities || vaultAfterSetupCheck.identities.length === 0)
            ) {
                responseType = "VIBE_AGENT_RESPONSE_ERROR";
                responsePayload = {
                    error: {
                        message: "Setup is complete but no identities found. Please create your first identity.",
                        code: "FIRST_IDENTITY_CREATION_REQUIRED",
                    },
                };
            } else {
                responseType = "VIBE_AGENT_RESPONSE_ERROR";
                responsePayload = { error: { message: "Vault is locked. Please unlock.", code: "VAULT_LOCKED_NO_LAST_ACTIVE" } };
            }
        }
    }
    return { responsePayload, responseType };
}

export async function handleCloseSetupTab(sender: chrome.runtime.MessageSender): Promise<any> {
    if (sender.tab && sender.tab.id) {
        try {
            await chrome.tabs.remove(sender.tab.id);
            return { success: true, message: "Setup tab closed." };
        } catch (error: any) {
            console.error("Error closing setup tab:", error);
            throw new Types.HandledError({ error: { message: `Failed to close setup tab: ${error.message}`, code: "CLOSE_TAB_FAILED" } });
        }
    } else {
        throw new Types.HandledError({ error: { message: "No tab ID to close.", code: "NO_TAB_ID_TO_CLOSE" } });
    }
}
