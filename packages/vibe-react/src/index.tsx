"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { StandaloneStrategy } from "vibe-sdk/src/strategies/standalone";
import { User } from "vibe-sdk/src/types";

interface VibeContextType {
    sdk: StandaloneStrategy;
    user: User | null;
    isLoggedIn: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    signup: () => Promise<void>;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

export const VibeProvider = ({ children, config }: { children: ReactNode; config: any }) => {
    const [sdk] = useState(() => new StandaloneStrategy());
    const [user, setUser] = useState<User | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        const checkUser = async () => {
            const currentUser = await sdk.getUser();
            setUser(currentUser);
            setIsLoggedIn(!!currentUser);
        };
        checkUser();

        const unsubscribe = sdk.onStateChange((loggedIn: boolean) => {
            setIsLoggedIn(loggedIn);
            if (loggedIn) {
                checkUser();
            } else {
                setUser(null);
            }
        });

        return () => unsubscribe();
    }, [sdk]);

    const login = () => sdk.login();
    const logout = () => sdk.logout();
    const signup = () => sdk.signup();

    return <VibeContext.Provider value={{ sdk, user, isLoggedIn, login, logout, signup }}>{children}</VibeContext.Provider>;
};

export const useVibe = () => {
    const context = useContext(VibeContext);
    if (context === undefined) {
        throw new Error("useVibe must be used within a VibeProvider");
    }
    return context;
};

export * from "./components/LoginButton";
export * from "./components/SignupButton";
export * from "./components/ProfileMenu";
export * from "./components/AuthWidget";
