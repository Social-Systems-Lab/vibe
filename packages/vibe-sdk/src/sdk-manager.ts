import { VibeSDK, VibeSDKConfig } from "./index";

// By attaching the instance to the window object, we ensure that it's a true
// singleton across the entire application, even with React's Strict Mode
// and Hot Module Replacement (HMR) which can cause modules to be re-evaluated.
declare global {
    interface Window {
        __vibe_sdk_instance__: VibeSDK | null;
    }
}

export const getSdk = (config: VibeSDKConfig): VibeSDK => {
    if (!window.__vibe_sdk_instance__) {
        window.__vibe_sdk_instance__ = new VibeSDK(config);
    }
    return window.__vibe_sdk_instance__;
};
