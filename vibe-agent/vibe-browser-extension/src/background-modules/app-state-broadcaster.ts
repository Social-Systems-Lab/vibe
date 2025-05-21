import * as Types from "./types";
import * as SessionManager from "./session-manager";
import * as Constants from "./constants";

// Simple in-memory store for active app subscriptions
// Key: subscriptionId, Value: { tabId, origin, appId }
export const appSubscriptions = new Map<string, { tabId?: number; origin: string; appId?: string }>();

export async function getCurrentVibeStateForSubscription(appId?: string, origin?: string): Promise<Types.VibeState> {
    // Helper to construct VibeState, similar to INITIALIZE_APP_SESSION
    // TODO: Incorporate actual permissions based on appId and origin in the future
    const vaultData = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT))[Constants.STORAGE_KEY_VAULT];
    const agentIdentitiesFromVault: Types.AgentIdentity[] = vaultData?.identities || [];

    const vibeIdentities: Types.VibeIdentity[] = agentIdentitiesFromVault.map((agentId: Types.AgentIdentity) => ({
        did: agentId.identityDid,
        label: agentId.profile_name || `Identity ${agentId.identityDid.substring(0, 12)}...`,
        pictureUrl: agentId.profile_picture,
    }));

    const currentAgentActiveDid = SessionManager.currentActiveDid;
    let activeVibeIdentity: Types.VibeIdentity | null = null;
    if (currentAgentActiveDid) {
        const foundActive = vibeIdentities.find((vid) => vid.did === currentAgentActiveDid);
        activeVibeIdentity = foundActive || null;
    }

    return {
        isUnlocked: SessionManager.isUnlocked,
        did: currentAgentActiveDid,
        permissions: {
            /* Mock/actual permissions for appId, origin */
        },
        identities: vibeIdentities,
        activeIdentity: activeVibeIdentity,
    };
}

export async function broadcastAppStateToSubscriptions() {
    console.log("[BG] Broadcasting app state to all subscriptions.");
    for (const [subscriptionId, subInfo] of appSubscriptions.entries()) {
        if (subInfo.tabId) {
            try {
                const newState = await getCurrentVibeStateForSubscription(subInfo.appId, subInfo.origin);
                console.log(`[BG] Sending VIBE_PAGE_EVENT_STATE_CHANGED to tab ${subInfo.tabId} for subId ${subscriptionId}`);
                chrome.tabs.sendMessage(subInfo.tabId, {
                    type: "VIBE_PAGE_EVENT_STATE_CHANGED",
                    subscriptionId: subscriptionId,
                    payload: newState,
                });
            } catch (error) {
                console.error(`[BG] Error sending state update to tab ${subInfo.tabId} for subId ${subscriptionId}:`, error);
                // Optionally, remove subscription if tab is no longer accessible?
                // chrome.tabs.get(subInfo.tabId, (tab) => { if (chrome.runtime.lastError) appSubscriptions.delete(subscriptionId); });
            }
        }
    }
}
