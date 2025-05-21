import { Buffer } from "buffer";
import * as Types from "./types";
import * as VaultHandler from "./action-handlers/vault.handler";
import * as SetupHandler from "./action-handlers/setup.handler";
import * as IdentityHandler from "./action-handlers/identity.handler";
import * as AppSessionHandler from "./action-handlers/app-session.handler";
import * as AgentHandler from "./action-handlers/agent.handler";
import * as DataHandler from "./action-handlers/data.handler"; // Added DataHandler import

export async function handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
    const { action, payload, requestId } = message;

    let responsePayload: any;
    let responseType = "VIBE_AGENT_RESPONSE";
    try {
        switch (action) {
            case "GET_AGENT_STATUS": {
                const statusResult = await AgentHandler.handleGetAgentStatus();
                responsePayload = statusResult.responsePayload;
                responseType = statusResult.responseType;
                break;
            }
            case "UNLOCK_VAULT":
                responsePayload = await VaultHandler.handleUnlockVault(payload);
                break;
            case "LOCK_VAULT":
                responsePayload = await VaultHandler.handleLockVault();
                break;
            case "GET_LOCK_STATE":
                responsePayload = await VaultHandler.handleGetLockState();
                break;
            case "SETUP_CREATE_VAULT":
                responsePayload = await SetupHandler.handleSetupCreateVault(payload);
                break;
            case "SETUP_IMPORT_VAULT":
                responsePayload = await SetupHandler.handleSetupImportVault(payload);
                break;
            case "GET_ACTIVE_IDENTITY_DETAILS":
                responsePayload = await IdentityHandler.handleGetActiveIdentityDetails();
                break;
            case "CLOSE_SETUP_TAB":
                responsePayload = await AgentHandler.handleCloseSetupTab(sender);
                break;
            case "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES":
                responsePayload = await SetupHandler.handleSetupImportSeedAndRecoverIdentities(payload);
                break;
            case "SETUP_COMPLETE_AND_FINALIZE":
                responsePayload = await SetupHandler.handleSetupCompleteAndFinalize(payload);
                break;
            case "UPDATE_IDENTITY_PROFILE":
                responsePayload = await IdentityHandler.handleUpdateIdentityProfile(payload);
                break;
            case "FETCH_FULL_IDENTITY_DETAILS":
                responsePayload = await IdentityHandler.handleFetchFullIdentityDetails(payload);
                break;
            case "REQUEST_LOGIN_FLOW":
                responsePayload = await IdentityHandler.handleRequestLoginFlow(payload);
                break;
            case "GET_ALL_IDENTITIES":
                responsePayload = await IdentityHandler.handleGetAllIdentities();
                break;
            case "SWITCH_ACTIVE_IDENTITY":
                responsePayload = await IdentityHandler.handleSwitchActiveIdentity(payload);
                break;
            case "CREATE_NEW_IDENTITY_FROM_SEED":
                responsePayload = await IdentityHandler.handleCreateNewIdentityFromSeed(payload);
                break;
            case "GET_NEXT_IDENTITY_INDEX":
                responsePayload = await IdentityHandler.handleGetNextIdentityIndex();
                break;
            case "SETUP_NEW_IDENTITY_AND_FINALIZE":
                responsePayload = await SetupHandler.handleSetupNewIdentityAndFinalize(payload);
                break;
            case "FINALIZE_NEW_IDENTITY_SETUP":
                responsePayload = await SetupHandler.handleFinalizeNewIdentitySetup(payload);
                break;
            case "DELETE_IDENTITY":
                responsePayload = await IdentityHandler.handleDeleteIdentity(payload);
                break;
            case "INITIALIZE_APP_SESSION":
                responsePayload = await AppSessionHandler.handleInitializeAppSession(payload, sender);
                break;
            case "UNSUBSCRIBE_APP_SESSION":
                responsePayload = await AppSessionHandler.handleUnsubscribeAppSession(payload);
                break;
            case "READ_DATA_ONCE": // Added case for READ_DATA_ONCE
                responsePayload = await DataHandler.handleReadDataOnce(payload, sender);
                break;
            case "WRITE_DATA": // Added case for WRITE_DATA
                responsePayload = await DataHandler.handleWriteData(payload, sender);
                break;
            case "USER_CLICKED_CONSENT_POPOVER": // Added case for popover click
                responsePayload = await AppSessionHandler.handleUserClickedConsentPopover(payload, sender);
                // This action might not send a response back to the content script immediately,
                // or it might send a simple ack. The main action is to open the side panel.
                // For now, let's assume it can return a success/failure or some info.
                // If it's purely a trigger, responsePayload might be { success: true } or void.
                // If it's void, the sendResponse logic below needs adjustment or this case needs to handle sendResponse itself.
                // Let's assume it returns a payload for now.
                break;
            case "SUBMIT_CONSENT_DECISION":
                responsePayload = await AppSessionHandler.handleSubmitConsentDecision(payload, sender);
                break;
            default:
                console.warn(`[BG_WARN_UnknownAction] Unknown action: ${action}`);
                responsePayload = { error: { message: `Unknown action: ${action}` } };
                responseType = "VIBE_AGENT_RESPONSE_ERROR";
        }

        if (responseType === "VIBE_AGENT_RESPONSE_ERROR") {
            sendResponse({ type: responseType, requestId, error: responsePayload.error });
        } else {
            sendResponse({ type: responseType, requestId, payload: responsePayload });
        }
    } catch (error: any) {
        console.error(`[BG_ERROR_HANDLER] Error processing ${action}:`, error.message, error.stack);
        let errorPayloadToSend;
        if (error instanceof Types.HandledError) {
            errorPayloadToSend = error.payload.error; // The HandledError constructor wraps the payload in an 'error' object
        } else if (error instanceof Error) {
            errorPayloadToSend = { message: error.message, code: "UNHANDLED_ERROR" };
        } else {
            errorPayloadToSend = { message: "An unknown error occurred.", code: "UNKNOWN_ERROR" };
        }
        sendResponse({ type: "VIBE_AGENT_RESPONSE_ERROR", requestId, error: errorPayloadToSend });
    }
}
