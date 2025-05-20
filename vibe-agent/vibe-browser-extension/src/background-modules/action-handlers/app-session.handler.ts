import * as Types from "../types";
import * as SessionManager from "../session-manager";
import * as Constants from "../constants";
import { appSubscriptions, getCurrentVibeStateForSubscription } from "../app-state-broadcaster";

export async function handleInitializeAppSession(payload: any, sender: chrome.runtime.MessageSender): Promise<any> {
    const appManifest = payload?.manifest;
    const origin = sender.origin;
    const appIdFromManifestValue = appManifest?.appId; // This is string | undefined
    console.log(`[BG] INITIALIZE_APP_SESSION from origin: ${origin} for app: ${appManifest?.name}, ID: ${appIdFromManifestValue}`);

    const mockSubscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (sender.tab?.id) {
        appSubscriptions.set(mockSubscriptionId, { tabId: sender.tab.id, origin, appId: appIdFromManifestValue ?? undefined });
        console.log(`[BG] Subscription added: ${mockSubscriptionId} for tab ${sender.tab.id}, origin ${origin}, appId ${appIdFromManifestValue}`);
    } else {
        console.warn(`[BG] INITIALIZE_APP_SESSION from sender without tab ID. Origin: ${origin}, AppId: ${appIdFromManifestValue}`);
        appSubscriptions.set(mockSubscriptionId, { origin, appId: appIdFromManifestValue ?? undefined });
    }

    // Construct the initial state to send back
    // This logic is similar to getCurrentVibeStateForSubscription but might have slight variations
    // based on context (e.g. specific permissions for this app session)

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

    const initialState: Types.VibeState = {
        isUnlocked: SessionManager.isUnlocked,
        did: currentAgentActiveDid,
        account: currentAgentActiveDid ? { did: currentAgentActiveDid } : null,
        permissions: {
            /* TODO: Mock/actual permissions for appId, origin */
        },
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
        throw new Types.HandledError({ error: { message: "Subscription ID not found.", code: "SUBSCRIPTION_NOT_FOUND" } });
    }
}
