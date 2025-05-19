import { atom } from "jotai";

// Possible application states
export type AppStatus =
    | "LOADING" // Initial loading state
    | "SETUP_NOT_COMPLETE" // Full setup wizard needs to be run
    | "FIRST_IDENTITY_CREATION_REQUIRED" // Vault is set up, but no identities exist
    | "VAULT_LOCKED_NO_LAST_ACTIVE" // Vault is locked, no hint for last active DID
    | "UNLOCK_REQUIRED_FOR_LAST_ACTIVE" // Vault is locked, but there's a hint for the last active DID
    | "INITIALIZED_UNLOCKED" // App initialized, vault is unlocked
    | "ERROR"; // A generic error state

// Atom to hold the current overall status of the application
export const appStatusAtom = atom<AppStatus>("LOADING");

// Atom to hold any error message, particularly for the unlock screen
export const unlockErrorAtom = atom<string | null>(null);

// Atom to store the hint for the last active DID, used when vault is locked
export const lastActiveDidHintAtom = atom<string | undefined>(undefined);

// Atom to store the specific code from the background script's init response
// This can be more granular than AppStatus and might include codes like "VAULT_EMPTY", etc.
// It directly corresponds to initResponse.payload.code or initResponse.error.code
export const initializeAppStateAtom = atom<string | null>(null);

// Atom to indicate if the app is currently in the process of unlocking
export const isUnlockingAtom = atom<boolean>(false);

// Atom to indicate if the app is currently loading identity data
export const isLoadingIdentityAtom = atom<boolean>(true);
