import { atom } from "jotai";

// Interface for Identity, matching the one in ExtensionWindowView and sidepanel
export interface Identity {
    did: string;
    displayName: string | null;
    avatarUrl?: string | null;
    // Add other identity-specific fields if needed, e.g., from StoredIdentity
    profile_name?: string | null; // from StoredIdentity, often same as displayName
    profile_picture?: string | null; // from StoredIdentity, often same as avatarUrl
    derivationPath?: string; // Optional, from vault
}

// Atom to hold the currently active identity
export const currentIdentityAtom = atom<Identity | null>(null);

// Atom to hold the list of all available identities
export const allIdentitiesAtom = atom<Identity[]>([]);

// Atoms for managing UI state related to identity wizards/modals
// These replace the useState variables like showImportWizard, showNewIdentityWizard, etc.

export const showImportWizardAtom = atom<boolean>(false);
export const showNewIdentityWizardAtom = atom<boolean>(false);
export const showIdentitySettingsAtom = atom<boolean>(false);

// Props for the NewIdentitySetupWizard, if it's shown
export const newIdentityWizardPropsAtom = atom<{
    identityIndex: number;
    isVaultInitiallyUnlocked: boolean;
} | null>(null);

// Props for VibeUserProfileView
export interface VibeUserProfileData {
    did: string;
    displayName: string;
    avatarUrl?: string;
    username?: string; // Added from original mock data
    site?: string; // Added from original mock data
    mockBio?: string; // Added from original mock data
    mockAvatar?: string; // May be same as avatarUrl, but included for consistency
    // Add other profile-specific fields as needed
}
export const showVibeUserProfileAtom = atom<boolean>(false);
export const currentVibeProfileDataAtom = atom<VibeUserProfileData | null>(null);
