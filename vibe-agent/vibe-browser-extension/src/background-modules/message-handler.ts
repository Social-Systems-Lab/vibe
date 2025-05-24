import { Buffer } from "buffer";
import * as Types from "./types";
import * as VaultHandler from "./action-handlers/vault.handler";
import * as SetupHandler from "./action-handlers/setup.handler";
import * as IdentityHandler from "./action-handlers/identity.handler";
import * as AppSessionHandler from "./action-handlers/app-session.handler";
import * as AgentHandler from "./action-handlers/agent.handler";
import * as DataHandler from "./action-handlers/data.handler"; // Added DataHandler import

export async function handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
    port?: chrome.runtime.Port // Optional: for long-lived connections like subscriptions
): Promise<void | boolean> {
    // Allow returning true for async sendResponse
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
            case "VIBE_READ_DATA_SUBSCRIPTION": // Renamed from READ_DATA_SUBSCRIPTION for clarity
                if (!port) {
                    console.error("[BG] VIBE_READ_DATA_SUBSCRIPTION: Port is required for subscriptions.");
                    responsePayload = { error: { message: "Port is required for subscriptions." } };
                    responseType = "VIBE_AGENT_RESPONSE_ERROR";
                } else {
                    // handleReadDataSubscription will send initial data via sendResponse,
                    // and subsequent updates via port.postMessage.
                    // It needs sendResponse to send back the subscriptionId or an initial error.
                    responsePayload = await DataHandler.handleReadDataSubscription(payload, sender, port);
                    // The actual updates are sent via port.postMessage by the handler itself.
                    // We send the initial response (ack/error + subscriptionId + initial data) here.
                }
                break;
            case "VIBE_UNSUBSCRIBE_DATA_SUBSCRIPTION": // Renamed from UNSUBSCRIBE_DATA_SUBSCRIPTION
                responsePayload = await DataHandler.handleUnsubscribeDataSubscription(payload);
                break;
            case "USER_CLICKED_CONSENT_POPOVER":
                responsePayload = await AppSessionHandler.handleUserClickedConsentPopover(payload, sender);
                break;
            case "SUBMIT_CONSENT_DECISION":
                responsePayload = await AppSessionHandler.handleSubmitConsentDecision(payload, sender);
                break;
            case "GET_ACTIVE_TAB_APP_CONTEXT":
                responsePayload = await AppSessionHandler.getActiveTabAppContext(payload, sender);
                break;
            case "NUKE_ALL_USER_DATABASES": // Added case for nuking all user databases
                responsePayload = await IdentityHandler.handleNukeAllUserDatabases();
                break;
            default:
                console.warn(`[BG_WARN_UnknownAction] Unknown action: ${action}`);
                responsePayload = { error: { message: `Unknown action: ${action}` } };
                responseType = "VIBE_AGENT_RESPONSE_ERROR";
        }

        // For subscriptions, the initial response is sent here. Subsequent updates go via port.
        if (action === "VIBE_READ_DATA_SUBSCRIPTION" && responsePayload?.ok) {
            sendResponse({ type: responseType, requestId, payload: responsePayload });
            return true; // Indicate that the response will be sent asynchronously (or port kept open)
        } else if (responseType === "VIBE_AGENT_RESPONSE_ERROR" || (action === "VIBE_READ_DATA_SUBSCRIPTION" && !responsePayload?.ok)) {
            sendResponse({ type: "VIBE_AGENT_RESPONSE_ERROR", requestId, error: responsePayload.error || responsePayload });
        } else {
            sendResponse({ type: responseType, requestId, payload: responsePayload });
        }
    } catch (error: any) {
        console.error(`[BG_ERROR_HANDLER] Error processing ${action} for requestId ${requestId}:`, error.message, error.stack);
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
