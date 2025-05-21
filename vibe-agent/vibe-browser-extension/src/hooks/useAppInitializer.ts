import { useEffect, useCallback } from "react"; // Added useCallback
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { appStatusAtom, initializeAppStateAtom, lastActiveDidHintAtom, unlockErrorAtom, isLoadingIdentityAtom } from "../store/appAtoms";
import {
    currentIdentityAtom,
    allIdentitiesAtom,
    currentVibeProfileDataAtom, // Added
    showVibeUserProfileAtom, // Added
    type VibeUserProfileData, // Added
} from "../store/identityAtoms";
import { PENDING_CONSENT_REQUEST_KEY } from "../background-modules/action-handlers/app-session.handler"; // Import the key

// This type might need to be defined or imported from a shared types file later
// For now, defining it here based on expected structure from background script
interface InitResponsePayload {
    code: string;
    [key: string]: any; // for other potential properties like lastActiveDid, nextIdentityIndex
}

interface InitResponseError {
    code: string;
    message?: string;
    lastActiveDid?: string;
    nextIdentityIndex?: number;
    [key: string]: any;
}

interface ChromeMessage {
    type: string;
    action?: string;
    requestId?: string;
    payload?: any; // Changed to any for more flexible payload types
    error?: InitResponseError;
}

export const useAppInitializer = () => {
    const [, setAppStatus] = useAtom(appStatusAtom);
    const [, setInitializeAppState] = useAtom(initializeAppStateAtom);
    const [, setLastActiveDidHint] = useAtom(lastActiveDidHintAtom);
    const [, setUnlockError] = useAtom(unlockErrorAtom);
    const [, setIsLoadingIdentity] = useAtom(isLoadingIdentityAtom);
    // setCurrentIdentity and setAllIdentities will likely be managed by a separate identity hook
    // but are included here if direct manipulation is needed during init for some edge cases.
    // For now, they are not directly used in this hook's primary logic after init.
    const [, setCurrentIdentity] = useAtom(currentIdentityAtom);
    const [, setAllIdentities] = useAtom(allIdentitiesAtom);
    const [currentPath, setLocation] = useLocation(); // Modified: also get currentPath
    const [, setCurrentVibeProfileData] = useAtom(currentVibeProfileDataAtom);
    const [, setShowVibeUserProfile] = useAtom(showVibeUserProfileAtom);

    // Memoize initializeApp
    const initializeApp = useCallback(async () => {
        // This is the main initializeApp function
        console.log("useAppInitializer: initializeApp triggered");
        setAppStatus("LOADING");
        setIsLoadingIdentity(true); // Ensure loading state is true at the start
        setUnlockError(null);
        setInitializeAppState(null);
        setLastActiveDidHint(undefined);
        // setCurrentIdentity(null); // Reset identity states if needed
        // setAllIdentities([]);

        // Check for pending consent request first
        try {
            const consentData = await chrome.storage.session.get(PENDING_CONSENT_REQUEST_KEY);
            if (consentData && consentData[PENDING_CONSENT_REQUEST_KEY]) {
                console.log("useAppInitializer: Pending consent request found, navigating to /consent-request.");
                setAppStatus("AWAITING_CONSENT"); // Set a specific status
                setLocation("/consent-request");
                setIsLoadingIdentity(false); // Stop general loading indicator
                return; // Halt further initialization
            }
        } catch (e) {
            console.error("useAppInitializer: Error checking for pending consent request:", e);
            // Proceed with normal initialization despite this error
        }

        try {
            const initResponse = (await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "GET_AGENT_STATUS",
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage; // Type assertion

            if (initResponse.type === "VIBE_AGENT_RESPONSE" && initResponse.payload?.code) {
                const code = initResponse.payload.code;
                setInitializeAppState(code);
                if (code === "INITIALIZED_UNLOCKED") {
                    setAppStatus("INITIALIZED_UNLOCKED");
                    // TODO: Trigger loadIdentityData() here or ensure DashboardPage does it.
                    // For now, DashboardPage will be responsible for loading its own data.
                    setLocation("/"); // Changed to /
                } else {
                    console.warn(`Unhandled VIBE_AGENT_RESPONSE code during init: ${code}`);
                    setAppStatus("ERROR");
                    setUnlockError(`Unhandled success code from init: ${code}`);
                    setLocation("/error");
                }
            } else if (initResponse.type === "VIBE_AGENT_RESPONSE_ERROR" && initResponse.error?.code) {
                const errorCode = initResponse.error.code;
                setInitializeAppState(errorCode);
                console.log("useAppInitializer: init error code:", errorCode);

                if (errorCode === "UNLOCK_REQUIRED_FOR_LAST_ACTIVE") {
                    setLastActiveDidHint(initResponse.error.lastActiveDid);
                    setAppStatus("UNLOCK_REQUIRED_FOR_LAST_ACTIVE");
                    setLocation("/unlock");
                } else if (errorCode === "VAULT_LOCKED_NO_LAST_ACTIVE") {
                    setAppStatus("VAULT_LOCKED_NO_LAST_ACTIVE");
                    setLocation("/unlock");
                } else if (errorCode === "SETUP_NOT_COMPLETE") {
                    setAppStatus("SETUP_NOT_COMPLETE");
                    setLocation("/setup");
                } else if (errorCode === "FIRST_IDENTITY_CREATION_REQUIRED") {
                    setAppStatus("FIRST_IDENTITY_CREATION_REQUIRED");
                    // Props for NewIdentityPage will be handled by the page itself or a dedicated atom.
                    setLocation("/setup/new-identity");
                } else {
                    setUnlockError(initResponse.error?.message || `Failed to initialize with error code: ${errorCode}`);
                    setAppStatus("ERROR");
                    setLocation("/error");
                }
            } else {
                console.error("Invalid or unexpected response from init operation:", initResponse);
                setUnlockError("Invalid response structure from init operation.");
                setAppStatus("ERROR");
                setLocation("/error");
            }
        } catch (error: any) {
            console.error("Critical error during app initialization:", error);
            setUnlockError(`A critical error occurred: ${error.message || "Unknown error"}`);
            setAppStatus("ERROR");
            setLocation("/error");
        } finally {
            // setIsLoadingIdentity(false); // This should be set to false after identity data is actually loaded,
            // which might happen in DashboardPage or a dedicated identity hook.
            // For now, if init leads to an error or a non-data-loading page, set it here.
            // If appStatus is not INITIALIZED_UNLOCKED or UNLOCK_REQUIRED_FOR_LAST_ACTIVE (where data might still load)
            // then we can probably stop the global loading indicator.
            // This needs careful consideration based on when actual data fetching for identities occurs.
            // For now, let's assume pages like /setup, /unlock (no last active), /error don't load identities immediately.
            const finalStatus = appStatusAtom.init; // Read the latest status set within this effect
            if (finalStatus !== "INITIALIZED_UNLOCKED" && finalStatus !== "UNLOCK_REQUIRED_FOR_LAST_ACTIVE" && finalStatus !== "LOADING") {
                setIsLoadingIdentity(false);
            }
            // If it IS INITIALIZED_UNLOCKED, isLoadingIdentity will be set to false by the component/hook that loads identities.
        }
    }, [
        setAppStatus,
        setIsLoadingIdentity,
        setUnlockError,
        setInitializeAppState,
        setLastActiveDidHint,
        setLocation,
        // setCurrentIdentity, // Not directly modified by init logic itself after this refactor
        // setAllIdentities,   // Not directly modified by init logic itself after this refactor
    ]);

    // Effect for initial app load
    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    // Effect for storage changes listener
    useEffect(() => {
        const storageChangedListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            const localChanges = areaName === "local" && (changes.vibeVault || changes.lastActiveDid);

            if (localChanges) {
                // If currently on the main setup page, skip re-initialization to prevent interrupting the wizard
                if (currentPath === "/setup") {
                    console.log("useAppInitializer: Storage change detected during setup wizard (/setup), re-initialization skipped.");
                    return;
                }
                console.log("useAppInitializer: Detected storage change, re-initializing app state.");
                initializeApp(); // initializeApp is stable due to useCallback
                setShowVibeUserProfile(false);
                setCurrentVibeProfileData(null);
            }
        };

        chrome.storage.onChanged.addListener(storageChangedListener);
        return () => {
            chrome.storage.onChanged.removeListener(storageChangedListener);
        };
    }, [initializeApp, setShowVibeUserProfile, setCurrentVibeProfileData, currentPath]); // Added currentPath

    // Effect for background messages listener
    useEffect(() => {
        const messageListener = (message: ChromeMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): boolean | undefined => {
            if (message.type === "DISPLAY_MOCKED_PROFILE" && message.payload) {
                console.log("useAppInitializer: Received DISPLAY_MOCKED_PROFILE", message.payload);
                const profileData = message.payload as VibeUserProfileData;
                setCurrentVibeProfileData(profileData);
                setShowVibeUserProfile(true);

                if (profileData.did) {
                    setLocation(`/profile/${profileData.did}`);
                } else {
                    console.warn("DISPLAY_MOCKED_PROFILE received without DID, cannot navigate to profile/:did");
                }
                sendResponse({ success: true });
                return true; // Indicate that sendResponse will be called asynchronously or synchronously.
            } else if (message.type === "NAVIGATE_TO_CONSENT_REQUEST") {
                console.log("useAppInitializer: Received NAVIGATE_TO_CONSENT_REQUEST. Navigating side panel.");
                setAppStatus("AWAITING_CONSENT");
                setLocation("/consent-request");
                setIsLoadingIdentity(false);
                // No sendResponse needed for this notification, but return true if it were async.
                // Since it's synchronous, can return false or void.
                // However, to be safe with onMessage listeners, if not sending response, often best to not return true.
                // If background expects a response, this would need sendResponse. Assuming it doesn't.
                return false;
            }
            return false; // Explicitly return false for unhandled messages or synchronous handling without sendResponse.
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => {
            chrome.runtime.onMessage.removeListener(messageListener);
        };
    }, [setLocation, setCurrentVibeProfileData, setShowVibeUserProfile, setAppStatus, setIsLoadingIdentity]);
};
