// src/index.tsx
import { createContext, useState, useEffect, useContext, useCallback } from "react";
import { jsxDEV } from "react/jsx-dev-runtime";
"use client";
var VibeContext = createContext(undefined);
var getSdk = () => {
  return window.vibe;
};
function VibeProvider({ children, manifest }) {
  const [vibeState, setVibeState] = useState(undefined);
  const [sdkUnsubscribe, setSdkUnsubscribe] = useState(null);
  useEffect(() => {
    let isMounted = true;
    let unsubscribeFn = null;
    let sdkInitialized = false;
    const attemptInitializeSdk = async () => {
      if (sdkInitialized)
        return;
      const sdk = getSdk();
      if (!sdk) {
        console.warn("[VibeProvider] window.vibe SDK not yet available. Waiting for 'vibeReady' event.");
        return;
      }
      sdkInitialized = true;
      console.log("[VibeProvider] Initializing Vibe SDK via window.vibe with manifest:", manifest);
      try {
        unsubscribeFn = await sdk.init(manifest, (newState) => {
          if (isMounted) {
            console.log("[VibeProvider] Received state update from SDK:", newState);
            setVibeState(newState);
          } else {
            console.log("[VibeProvider] Received state update after unmount, ignoring.");
          }
        });
        if (isMounted) {
          console.log("[VibeProvider] SDK init promise resolved successfully.");
          setSdkUnsubscribe(() => unsubscribeFn);
        } else {
          console.log("[VibeProvider] Unmounted before SDK init resolved, calling unsubscribe.");
          unsubscribeFn?.();
        }
      } catch (error) {
        console.error("[VibeProvider] Error during SDK initialization promise:", error);
        if (isMounted) {
          setVibeState(undefined);
          setSdkUnsubscribe(null);
        }
      }
    };
    const handleVibeReady = () => {
      console.log("[VibeProvider] 'vibeReady' event received.");
      attemptInitializeSdk();
    };
    if (getSdk()) {
      console.log("[VibeProvider] SDK found on mount, attempting initialization immediately.");
      attemptInitializeSdk();
    } else {
      window.addEventListener("vibeReady", handleVibeReady);
    }
    return () => {
      isMounted = false;
      window.removeEventListener("vibeReady", handleVibeReady);
      console.log("[VibeProvider] Cleaning up Vibe SDK subscription.");
      if (unsubscribeFn) {
        console.log("[VibeProvider] Calling unsubscribe function provided by SDK init.");
        unsubscribeFn();
        setSdkUnsubscribe(null);
      } else {
        console.log("[VibeProvider] No unsubscribe function available (init might have failed or not completed).");
      }
    };
  }, [manifest]);
  const init = useCallback(() => {
    console.warn("[VibeProvider] Manual init called. SDK should auto-initialize via AgentProvider.");
  }, []);
  const readOnce = useCallback(async (collection, filter) => {
    const sdk = getSdk();
    if (!sdk)
      throw new Error("Vibe SDK (window.vibe) not available.");
    console.log(`[VibeProvider] Calling window.vibe.readOnce: ${collection}`);
    return sdk.readOnce(collection, filter);
  }, []);
  const read = useCallback(async (collection, filter, callback) => {
    const sdk = getSdk();
    if (!sdk)
      throw new Error("Vibe SDK (window.vibe) not available.");
    console.log(`[VibeProvider] Calling window.vibe.read: ${collection}`);
    return sdk.read(collection, filter, callback);
  }, []);
  const write = useCallback(async (collection, data) => {
    const sdk = getSdk();
    if (!sdk)
      throw new Error("Vibe SDK (window.vibe) not available.");
    console.log(`[VibeProvider] Calling window.vibe.write: ${collection}`);
    return sdk.write(collection, data);
  }, []);
  const contextValue = {
    permissions: vibeState?.permissions,
    activeIdentity: vibeState?.activeIdentity,
    identities: vibeState?.identities,
    init,
    readOnce,
    read,
    write
  };
  return /* @__PURE__ */ jsxDEV(VibeContext.Provider, {
    value: contextValue,
    children
  }, undefined, false, undefined, this);
}
function useVibe() {
  const context = useContext(VibeContext);
  if (context === undefined) {
    throw new Error("useVibe must be used within a <VibeProvider>");
  }
  return context;
}
export {
  useVibe,
  VibeProvider
};
