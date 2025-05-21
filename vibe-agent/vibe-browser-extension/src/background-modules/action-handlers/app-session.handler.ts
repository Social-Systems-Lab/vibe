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
        tabId?: number; // Added tabId
        appName?: string; // Added appName
        appIconUrl?: string; // Added appIconUrl
        manifestRequestedPermissions?: string[]; // Added manifestRequestedPermissions
    }
>();

export const ACTIVE_TAB_APP_CONTEXTS_KEY = "activeTabAppContexts";

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
                        tabId: sender.tab?.id,
                        appName: appManifest.name,
                        appIconUrl: appManifest.iconUrl || appManifest.pictureUrl,
                        manifestRequestedPermissions: appManifest?.permissions || [],
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

            // Store app context if no consent is needed
            if (sender.tab?.id && currentAgentActiveDid) {
                const appContext = {
                    appId: appIdFromManifestValue,
                    origin: origin,
                    appName: appManifest.name,
                    appIconUrl: appManifest.iconUrl || appManifest.pictureUrl,
                    grantedPermissions: grantedPermissions,
                    manifestRequestedPermissions: appManifest?.permissions || [], // Add here
                    tabId: sender.tab.id,
                };
                try {
                    const currentContexts = (await chrome.storage.session.get(ACTIVE_TAB_APP_CONTEXTS_KEY))[ACTIVE_TAB_APP_CONTEXTS_KEY] || {};
                    currentContexts[sender.tab.id] = appContext;
                    await chrome.storage.session.set({ [ACTIVE_TAB_APP_CONTEXTS_KEY]: currentContexts });
                    console.log(`[BG] App context stored for tab ${sender.tab.id} (no consent needed):`, appContext);
                } catch (e) {
                    console.error("[BG] Error storing app context (no consent needed):", e);
                }
            }

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
    console.log("[BG] USER_CLICKED_CONSENT_POPOVER received for data storage:", payload);
    // Destructure consentRequestId from payload
    const { appName, appIconUrl, origin, appId, requestedPermissions, consentRequestId } = payload;

    // sender.tab.id is already checked in background.ts before sidePanel.open is called.
    // Here, we primarily focus on data validation for storage.
    if (!appId || !origin || !requestedPermissions || !consentRequestId) {
        console.error(
            "[BG] Insufficient data for storing consent request details (appId, origin, requestedPermissions, or consentRequestId missing):",
            payload
        );
        // Even if data is insufficient, the side panel might have been triggered by background.ts.
        // This function's success/failure now primarily relates to storing data for the side panel to read.
        return { success: false, error: "Insufficient data to store for consent request." };
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

        // Attempt to notify the side panel to navigate, if it's open.
        chrome.runtime
            .sendMessage({
                type: "NAVIGATE_TO_CONSENT_REQUEST",
                // No specific payload needed as ConsentRequestPage reads from session.
            })
            .catch((err) => {
                // It's normal for this to fail if the side panel isn't open or listening.
                if (err.message?.includes("Could not establish connection") || err.message?.includes("Receiving end does not exist")) {
                    console.log("[BG] NAVIGATE_TO_CONSENT_REQUEST: Side panel not open or not listening (this is expected if panel was closed).");
                } else {
                    console.error("[BG] Error sending NAVIGATE_TO_CONSENT_REQUEST to side panel:", err);
                }
            });

        // The side panel opening is now handled by background.ts directly.
        // This handler just confirms data storage.
        return { success: true, message: "Consent request data stored for side panel." };
    } catch (error: any) {
        console.error("[BG] Error storing consent request data for side panel:", error);
        return { success: false, error: error.message || "Failed to store consent request data." };
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

            // Store app context after consent decision
            if (promiseControls.tabId) {
                const appContext = {
                    appId: appId,
                    origin: origin,
                    appName: promiseControls.appName,
                    appIconUrl: promiseControls.appIconUrl,
                    grantedPermissions: finalGrantedPermissionsForInit,
                    manifestRequestedPermissions: promiseControls.manifestRequestedPermissions || [], // Add here
                    tabId: promiseControls.tabId,
                };
                try {
                    const currentContexts = (await chrome.storage.session.get(ACTIVE_TAB_APP_CONTEXTS_KEY))[ACTIVE_TAB_APP_CONTEXTS_KEY] || {};
                    currentContexts[promiseControls.tabId] = appContext;
                    await chrome.storage.session.set({ [ACTIVE_TAB_APP_CONTEXTS_KEY]: currentContexts });
                    console.log(`[BG] App context stored for tab ${promiseControls.tabId} (after consent):`, appContext);
                } catch (e) {
                    console.error("[BG] Error storing app context (after consent):", e);
                }
            }
            pendingConsentPromises.delete(consentRequestId);
        } else {
            console.warn(`[BG] No pending consent promise found for ${consentRequestId}. This might happen if it timed out or was already resolved/rejected.`);
            // If no promise, perhaps the app init already timed out or proceeded.
            // A state broadcast might still be useful here to update any listening app instances.
            // Also, try to update app context if possible, though tabId might be lost.
            // For now, just broadcast.
            await broadcastAppStateToSubscriptions();
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

export async function getActiveTabAppContext(payload: any, sender: chrome.runtime.MessageSender): Promise<any> {
    let tabIdToQuery: number | undefined = sender.tab?.id;

    if (!tabIdToQuery) {
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab?.id) {
                tabIdToQuery = activeTab.id;
            }
        } catch (e) {
            console.error("[BG] Error querying active tab for app context:", e);
            return { success: false, error: "Failed to determine active tab." };
        }
    }

    if (!tabIdToQuery) {
        console.warn("[BG] No active tab ID found to fetch app context.");
        return { success: true, appContext: null }; // No specific tab, so no context
    }

    try {
        const allAppContexts = (await chrome.storage.session.get(ACTIVE_TAB_APP_CONTEXTS_KEY))[ACTIVE_TAB_APP_CONTEXTS_KEY] || {};
        const appContext = allAppContexts[tabIdToQuery] || null;
        console.log(`[BG] Fetched app context for tab ${tabIdToQuery}:`, appContext);
        return { success: true, appContext: appContext };
    } catch (error: any) {
        console.error(`[BG] Error fetching app context for tab ${tabIdToQuery}:`, error);
        return { success: false, error: error.message || "Failed to fetch app context." };
    }
}
