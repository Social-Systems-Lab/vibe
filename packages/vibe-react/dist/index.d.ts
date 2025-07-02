import { ReactNode } from "react";
import { VibeSDK, VibeSDKConfig } from "vibe-sdk";
interface VibeContextValue {
    sdk: VibeSDK | null;
    isAuthenticated: boolean;
    user: any;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    signup: () => Promise<void>;
}
interface VibeProviderProps {
    children: ReactNode;
    config: VibeSDKConfig;
}
export declare function VibeProvider({ children, config }: VibeProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useVibe(): VibeContextValue;
export * from "./components/LoginButton";
export * from "./components/SignupButton";
export * from "./components/ProfileMenu";
