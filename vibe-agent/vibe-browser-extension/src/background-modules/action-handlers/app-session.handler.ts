import * as Types from "../types";
import * as SessionManager from "../session-manager";
import * as Constants from "../constants";
import { appSubscriptions, getCurrentVibeStateForSubscription, broadcastAppStateToSubscriptions } from "../app-state-broadcaster";

// Map to store resolve/reject functions for pending consent requests
// The resolve function will be called with the outcome of the consent decision
const pendingConsentPromises = new Map<
    string,
    {
        resolve: (decisionOutcome: { finalGrantedPermissions: Record<string, Types.PermissionSetting>; decision: "allow" | "deny" }) => void;
        reject: (reason?: any) => void;
    }
>();

export async function handleInitializeAppSession(payload: any, sender: chrome.runtime.MessageSender): Promise<any> {
    const appManifest = payload?.manifest;
    const origin = sender.origin;
    const appIdFromManifestValue = appManifest?.appId; // This is string | undefined
    console.log(`[BG] INITIALIZE_APP_SESSION from origin: ${origin} for app: ${appManifest?.name}, ID: ${appIdFromManifestValue}`);

    if (!appIdFromManifestValue || !origin) {
        console.error("[BG] App ID or origin is missing. Cannot initialize session.", { appIdFromManifestValue, origin });
        throw new Types.HandledError({ error: { message: "App ID or origin missing.", code: "INVALID_REQUEST" } });
    }

    const mockSubscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (sender.tab?.id) {
        appSubscriptions.set(mockSubscriptionId, { tabId: sender.tab.id, origin, appId: appIdFromManifestValue ?? "" });
        console.log(`[BG] Subscription added: ${mockSubscriptionId} for tab ${sender.tab.id}, origin ${origin}, appId ${appIdFromManifestValue}`);
    } else {
        console.warn(`[BG] INITIALIZE_APP_SESSION from sender without tab ID. Origin: ${origin}, AppId: ${appIdFromManifestValue}`);
        appSubscriptions.set(mockSubscriptionId, { origin, appId: appIdFromManifestValue ?? "" });
    }

    // Construct the initial state to send back
    // This logic is similar to getCurrentVibeStateForSubscription but might have slight variations
    // based on context (e.g. specific permissions for this app session)

    const vaultData = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];
    const agentIdentitiesFromVault: Types.AgentIdentity[] = vaultData?.identities || [];

    console.log(`[BG] app-session.handler: Raw agentIdentitiesFromVault:`, JSON.parse(JSON.stringify(agentIdentitiesFromVault)));

    const vibeIdentities: Types.VibeIdentity[] = agentIdentitiesFromVault
        .map((agentId: any) => {
            // Use any for logging flexibility
            const did = agentId.identityDid || agentId.did; // Check for common variations
            if (!did) {
                console.warn(`[BG] app-session.handler: AgentIdentity missing 'did' or 'identityDid':`, agentId);
            }
            const labelName = agentId.profile_name || agentId.profileName || agentId.label;
            return {
                did: did || "unknown-did", // Fallback to prevent errors, though this indicates a data issue
                label: labelName || `Identity ${(did || "unknown").substring(0, 12)}...`,
                pictureUrl: agentId.profile_picture || agentId.profilePictureUrl || agentId.avatarUrl,
            };
        })
        .filter((vid) => vid.did !== "unknown-did"); // Filter out entries where DID couldn't be found

    const currentAgentActiveDid = SessionManager.currentActiveDid;
    let activeVibeIdentity: Types.VibeIdentity | null = null;

    console.log(`[BG] app-session.handler: currentAgentActiveDid = ${currentAgentActiveDid}`);
    console.log(
        `[BG] app-session.handler: DIDs in vibeIdentities:`,
        vibeIdentities.map((v) => v.did)
    );

    if (currentAgentActiveDid) {
        const foundActive = vibeIdentities.find((vid) => vid.did === currentAgentActiveDid);
        console.log(`[BG] app-session.handler: foundActive VibeIdentity for ${currentAgentActiveDid}:`, foundActive);
        activeVibeIdentity = foundActive || null;
    }

    // --- Permission Logic Start ---
    let grantedPermissions: Record<string, Types.PermissionSetting> = {};
    if (currentAgentActiveDid) {
        const PERMISSIONS_STORE_KEY = "permissionsStore"; // TODO: Move to constants
        const allPermissionsStore = (await chrome.storage.local.get(PERMISSIONS_STORE_KEY))[PERMISSIONS_STORE_KEY] || {};
        const permissionKey = `${currentAgentActiveDid}_${origin}_${appIdFromManifestValue}`;
        const existingPermissions: Record<string, Types.PermissionSetting> = allPermissionsStore[permissionKey] || {};

        const requestedPermissionsFromManifest: string[] = appManifest?.permissions || [];
        let consentNeeded = false;
        let newPermissionsToGrant: Record<string, Types.PermissionSetting> = {};

        for (const reqPerm of requestedPermissionsFromManifest) {
            if (!existingPermissions[reqPerm]) {
                consentNeeded = true;
                // Mock grant: default read to 'always', write to 'ask'
                newPermissionsToGrant[reqPerm] = reqPerm.startsWith("read:") ? "always" : "ask";
            }
        }

        if (consentNeeded) {
            console.log(
                `[BG] Consent required for app: ${appIdFromManifestValue}, origin: ${origin}, identity: ${currentAgentActiveDid}. Requested: ${requestedPermissionsFromManifest.join(
                    ", "
                )}`
            );
            // At this point, consentNeeded is true.
            // We don't set grantedPermissions yet; it will come from the user's decision.
            const consentRequestId = `${sender.tab?.id}_${appIdFromManifestValue}_${origin}_${Date.now()}`;
            console.log(`[BG] Consent required. ID: ${consentRequestId}. Waiting for user decision.`);

            if (sender.tab?.id) {
                // Send message to content script to show popover, including the consentRequestId
                await chrome.tabs.sendMessage(sender.tab.id, {
                    type: "SHOW_CONSENT_PROMPT",
                    payload: {
                        appName: appManifest.name,
                        appIconUrl: appManifest.iconUrl || appManifest.pictureUrl,
                        origin: origin,
                        appId: appIdFromManifestValue,
                        requestedPermissions: requestedPermissionsFromManifest,
                        activeIdentityForPopover: activeVibeIdentity,
                        consentRequestId: consentRequestId, // Pass the ID
                    },
                });
                // Catch for sendMessage can be added here if specific handling is needed before promise setup
                // For now, assuming if sendMessage fails, the outer handler in message-handler.ts catches it.

                return new Promise((resolveOuterPromise, rejectOuterPromise) => {
                    pendingConsentPromises.set(consentRequestId, {
                        resolve: (decisionOutcome: { finalGrantedPermissions: Record<string, Types.PermissionSetting>; decision: "allow" | "deny" }) => {
                            // This 'resolve' is called by handleSubmitConsentDecision
                            const finalInitialState: Types.VibeState = {
                                isUnlocked: SessionManager.isUnlocked,
                                did: currentAgentActiveDid, // This must be valid if consent was processed
                                permissions: decisionOutcome.finalGrantedPermissions,
                                identities: vibeIdentities, // Captured from the outer scope
                                activeIdentity: activeVibeIdentity, // Captured from the outer scope
                            };
                            console.log(`[BG] Consent decision outcome received for ${consentRequestId}. Resolving init with state:`, finalInitialState);
                            resolveOuterPromise({ initialState: finalInitialState, subscriptionId: mockSubscriptionId });
                        },
                        reject: (errorReason: any) => {
                            console.error(`[BG] Consent process rejected for ${consentRequestId}:`, errorReason);
                            rejectOuterPromise(errorReason);
                        },
                    });
                    // Optional: Timeout for the consent promise
                    // setTimeout(() => {
                    //     if (pendingConsentPromises.has(consentRequestId)) {
                    //         const promiseControls = pendingConsentPromises.get(consentRequestId);
                    //         promiseControls?.reject(new Types.HandledError({ error: { message: "Consent timed out for " + consentRequestId, code: "CONSENT_TIMEOUT" }}));
                    //         pendingConsentPromises.delete(consentRequestId);
                    //     }
                    // }, 1000 * 60 * 5); // 5 minutes
                });
            } else {
                console.warn("[BG] Cannot send SHOW_CONSENT_PROMPT: sender.tab.id is undefined. Cannot await consent.");
                // If no tab ID, we can't show UI, so consent cannot be obtained through this flow.
                // Resolve with current (potentially incomplete/mocked) permissions or reject.
                // For now, rejecting seems more appropriate as the full consent flow cannot complete.
                throw new Types.HandledError({ error: { message: "Cannot initiate consent without a tab ID.", code: "NO_TAB_FOR_CONSENT_UI" } });
            }
        } else {
            // No new consent needed
            console.log(`[BG] No new consent required for ${appIdFromManifestValue}. Using existing permissions.`);
            grantedPermissions = existingPermissions; // Already populated
            const initialState: Types.VibeState = {
                isUnlocked: SessionManager.isUnlocked,
                did: currentAgentActiveDid,
                permissions: grantedPermissions,
                identities: vibeIdentities,
                activeIdentity: activeVibeIdentity,
            };
            return Promise.resolve({ initialState: initialState, subscriptionId: mockSubscriptionId }); // Ensure it returns a Promise
        }
    } else {
        // No active identity
        console.warn(`[BG] No active identity. Cannot process permissions for app ${appIdFromManifestValue}. Returning empty permissions.`);
        const initialState: Types.VibeState = {
            isUnlocked: SessionManager.isUnlocked,
            did: null,
            permissions: {},
            identities: vibeIdentities,
            activeIdentity: null,
        };
        return Promise.resolve({ initialState: initialState, subscriptionId: mockSubscriptionId }); // Ensure it returns a Promise
    }
    // Unreachable, but satisfies TypeScript if it thinks paths might not return.
}

export async function handleUnsubscribeAppSession(payload: any): Promise<any> {
    const { subscriptionId } = payload;
    if (appSubscriptions.has(subscriptionId)) {
        appSubscriptions.delete(subscriptionId);
        console.log(`[BG] Subscription removed: ${subscriptionId}`);
        return { success: true };
    } else {
        console.warn(`[BG] UNSUBSCRIBE_APP_SESSION: Subscription ID not found: ${subscriptionId}`);
        // Instead of throwing, return an error payload structure if this is a client-facing error
        //throw new Types.HandledError({ error: { message: "Subscription ID not found.", code: "SUBSCRIPTION_NOT_FOUND" } });
    }
} // End of handleUnsubscribeAppSession

export const PENDING_CONSENT_REQUEST_KEY = "pendingConsentRequest";

export async function handleUserClickedConsentPopover(payload: any, sender: chrome.runtime.MessageSender): Promise<any> {
    console.log("[BG] USER_CLICKED_CONSENT_POPOVER received:", payload);
    // Destructure consentRequestId from payload
    const { appName, appIconUrl, origin, appId, requestedPermissions, consentRequestId } = payload;

    if (!sender.tab?.id) {
        console.error("[BG] Cannot open side panel or store consent request: sender.tab.id is undefined.");
        return { success: false, error: "Missing tab ID." };
    }
    // Add check for consentRequestId
    if (!appId || !origin || !requestedPermissions || !consentRequestId) {
        console.error("[BG] Insufficient data for consent request (appId, origin, requestedPermissions, or consentRequestId missing):", payload);
        return { success: false, error: "Insufficient data for consent request." };
    }

    try {
        // Store consent request details in session storage for the sidebar to pick up
        const consentRequestData = {
            appName,
            appIconUrl,
            origin,
            appId,
            requestedPermissions,
            activeDid: SessionManager.currentActiveDid,
            consentRequestId: consentRequestId, // Store consentRequestId
        };
        await chrome.storage.session.set({ [PENDING_CONSENT_REQUEST_KEY]: consentRequestData });
        console.log("[BG] Stored pending consent request to session storage (including consentRequestId):", consentRequestData);

        // Attempt to open the side panel to the consent UI
        // The sidebar's router/App component will need to check session storage for this key on load/navigate
        await chrome.sidePanel.open({ tabId: sender.tab.id });
        console.log(`[BG] Attempted to open side panel for tab ${sender.tab.id}`);

        return { success: true, message: "Side panel opening initiated for consent." };
    } catch (error: any) {
        console.error("[BG] Error handling USER_CLICKED_CONSENT_POPOVER:", error);
        return { success: false, error: error.message || "Failed to process popover click." };
    }
}

export async function handleSubmitConsentDecision(payload: any, sender: chrome.runtime.MessageSender): Promise<any> {
    console.log("[BG] SUBMIT_CONSENT_DECISION received:", payload);
    // consentRequestId is now expected in the payload
    const { appId, origin, activeDid, grantedPermissions, decision, consentRequestId } = payload;

    if (!appId || !origin || !activeDid || !decision || !consentRequestId || (decision === "allow" && typeof grantedPermissions === "undefined")) {
        console.error("[BG] handleSubmitConsentDecision: Insufficient data or missing consentRequestId.", payload);
        // If consentRequestId is present, try to reject its promise
        if (consentRequestId && pendingConsentPromises.has(consentRequestId)) {
            pendingConsentPromises
                .get(consentRequestId)
                ?.reject(new Types.HandledError({ error: { message: "Insufficient data for consent decision.", code: "INVALID_REQUEST" } }));
            pendingConsentPromises.delete(consentRequestId);
        }
        return { success: false, error: "Insufficient data for submitting consent decision." };
    }

    const PERMISSIONS_STORE_KEY = "permissionsStore"; // TODO: Move to constants
    let finalGrantedPermissionsForInit: Record<string, Types.PermissionSetting> = {};

    try {
        const storeResult = await chrome.storage.local.get(PERMISSIONS_STORE_KEY);
        const allPermissionsStore = storeResult[PERMISSIONS_STORE_KEY] || {};
        const permissionKey = `${activeDid}_${origin}_${appId}`;

        if (decision === "allow") {
            allPermissionsStore[permissionKey] = grantedPermissions;
            finalGrantedPermissionsForInit = grantedPermissions;
            console.log(`[BG] Permissions ALLOWED and stored for key ${permissionKey}:`, grantedPermissions);
        } else if (decision === "deny") {
            allPermissionsStore[permissionKey] = {}; // Explicitly store empty object for denial
            finalGrantedPermissionsForInit = {}; // Denied means no permissions granted
            console.log(`[BG] Permissions DENIED for key ${permissionKey}. Stored empty permissions.`);
        } else {
            console.warn(`[BG] handleSubmitConsentDecision: Unknown decision type: ${decision}`);
            if (pendingConsentPromises.has(consentRequestId)) {
                pendingConsentPromises
                    .get(consentRequestId)
                    ?.reject(new Types.HandledError({ error: { message: `Unknown decision type: ${decision}`, code: "INTERNAL_ERROR" } }));
                pendingConsentPromises.delete(consentRequestId);
            }
            return { success: false, error: `Unknown decision type: ${decision}` };
        }

        await chrome.storage.local.set({ [PERMISSIONS_STORE_KEY]: allPermissionsStore });
        console.log(`[BG] Updated permissionsStore saved to local storage.`);

        await chrome.storage.session.remove(PENDING_CONSENT_REQUEST_KEY);
        console.log(`[BG] Cleared pending consent request from session storage.`);

        // Resolve the pending promise from handleInitializeAppSession
        const promiseControls = pendingConsentPromises.get(consentRequestId);
        if (promiseControls) {
            console.log(`[BG] Resolving pending consent promise for ${consentRequestId} with decision: ${decision}`);
            promiseControls.resolve({ finalGrantedPermissions: finalGrantedPermissionsForInit, decision });
            pendingConsentPromises.delete(consentRequestId);
        } else {
            console.warn(`[BG] No pending consent promise found for ${consentRequestId}. This might happen if it timed out or was already resolved/rejected.`);
            // If no promise, perhaps the app init already timed out or proceeded.
            // A state broadcast might still be useful here to update any listening app instances.
            await broadcastAppStateToSubscriptions(); // Corrected function name
        }

        return { success: true, message: `Consent decision (${decision}) processed successfully.` };
    } catch (error: any) {
        console.error("[BG] Error in handleSubmitConsentDecision:", error);
        if (pendingConsentPromises.has(consentRequestId)) {
            pendingConsentPromises.get(consentRequestId)?.reject(error); // Reject with the actual error
            pendingConsentPromises.delete(consentRequestId);
        }
        return { success: false, error: error.message || "Failed to process consent decision." };
    }
}
