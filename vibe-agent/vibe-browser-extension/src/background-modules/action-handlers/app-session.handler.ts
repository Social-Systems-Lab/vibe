import * as Types from "../types";
import * as SessionManager from "../session-manager";
import * as Constants from "../constants";
import { appSubscriptions, getCurrentVibeStateForSubscription } from "../app-state-broadcaster";

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
            // Merge existing with newly mocked/granted ones
            grantedPermissions = { ...existingPermissions, ...newPermissionsToGrant };

            // TODO: Persist these new mocked permissions (for next time, until real UI)
            // For now, we are only logging and returning them in initialState.
            // If we were to persist:
            // allPermissionsStore[permissionKey] = grantedPermissions;
            // await chrome.storage.local.set({ [PERMISSIONS_STORE_KEY]: allPermissionsStore });
            // console.log(`[BG] Mock permissions (would be stored):`, grantedPermissions);
            Object.entries(newPermissionsToGrant).forEach(([perm, setting]) => {
                console.log(`[BG] Mock granting new permission: ${perm} as ${setting}`);
            });

            // Send message to content script to show popover
            if (sender.tab?.id) {
                chrome.tabs
                    .sendMessage(sender.tab.id, {
                        type: "SHOW_CONSENT_PROMPT",
                        payload: {
                            appName: appManifest.name,
                            appIconUrl: appManifest.iconUrl || appManifest.pictureUrl, // Use iconUrl or fallback to pictureUrl
                            origin: origin,
                            appId: appIdFromManifestValue,
                            requestedPermissions: requestedPermissionsFromManifest, // Send all requested, UI can filter/highlight new ones
                        },
                    })
                    .catch((err) => console.error("[BG] Error sending SHOW_CONSENT_PROMPT to content script:", err));
            } else {
                console.warn("[BG] Cannot send SHOW_CONSENT_PROMPT: sender.tab.id is undefined.");
            }
        } else {
            console.log(`[BG] No new consent required. Using existing permissions for: ${appIdFromManifestValue}, identity: ${currentAgentActiveDid}`);
            grantedPermissions = existingPermissions;
        }
    } else {
        console.warn(
            `[BG] No active identity (currentAgentActiveDid is null). Cannot process permissions for app ${appIdFromManifestValue}. Returning empty permissions.`
        );
        // No active identity, so no permissions can be determined or granted.
        // The app will receive an empty permissions object and should handle this gracefully (e.g., prompt for identity selection).
    }
    // --- Permission Logic End ---

    const initialState: Types.VibeState = {
        isUnlocked: SessionManager.isUnlocked,
        did: currentAgentActiveDid,
        permissions: grantedPermissions, // Use the determined/mocked permissions
        identities: vibeIdentities,
        activeIdentity: activeVibeIdentity,
    };

    return {
        initialState: initialState,
        subscriptionId: mockSubscriptionId,
    };
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
    const { appName, appIconUrl, origin, appId, requestedPermissions } = payload;

    if (!sender.tab?.id) {
        console.error("[BG] Cannot open side panel or store consent request: sender.tab.id is undefined.");
        return { success: false, error: "Missing tab ID." };
    }
    if (!appId || !origin || !requestedPermissions) {
        console.error("[BG] Insufficient data for consent request:", payload);
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
            // Potentially add activeIdentity DID here if needed by sidebar immediately
            activeDid: SessionManager.currentActiveDid,
        };
        await chrome.storage.session.set({ [PENDING_CONSENT_REQUEST_KEY]: consentRequestData });
        console.log("[BG] Stored pending consent request to session storage:", consentRequestData);

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
