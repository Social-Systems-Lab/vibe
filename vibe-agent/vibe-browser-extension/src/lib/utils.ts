import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { STORAGE_KEY_VAULT } from "../background-modules/constants";
import type { AgentIdentity } from "../background-modules/types";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Retrieves the instance URL (for Vibe Cloud API) for a given user DID.
 * It checks `instanceUrl` first, then falls back to `cloudUrl`.
 * @param userDid The DID of the user.
 * @returns A promise that resolves with the instance URL string or null if not found.
 */
export async function getIdentityInstanceUrl(userDid: string): Promise<string | null> {
    if (!userDid) {
        console.warn("getIdentityInstanceUrl called without userDid.");
        return null;
    }

    try {
        const vaultResult = await chrome.storage.local.get(STORAGE_KEY_VAULT);
        const vaultData = vaultResult[STORAGE_KEY_VAULT];

        if (vaultData && vaultData.identities && Array.isArray(vaultData.identities)) {
            const identity = vaultData.identities.find((id: AgentIdentity) => id.identityDid === userDid);
            if (identity) {
                // Prefer instanceUrl, fallback to cloudUrl for backward compatibility or other setups
                if (identity.instanceUrl) {
                    return identity.instanceUrl;
                }
                if (identity.cloudUrl) {
                    console.warn(`Using fallback cloudUrl for ${userDid} as instanceUrl is not set.`);
                    return identity.cloudUrl;
                }
                console.warn(`No instanceUrl or cloudUrl found for identity ${userDid}.`);
                return null;
            } else {
                console.warn(`Identity not found in vault for DID: ${userDid}`);
                return null;
            }
        } else {
            console.warn("Vault data or identities array not found or invalid.");
            return null;
        }
    } catch (error) {
        console.error(`Error retrieving instance URL for ${userDid}:`, error);
        return null;
    }
}
