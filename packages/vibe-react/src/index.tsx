"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface VibeContextType {
    user: any | null;
    setUser: (user: any | null) => void;
}

const VibeContext = createContext<VibeContextType | null>(null);

interface VibeProviderProps {
    children: ReactNode;
}

export const VibeProvider = ({ children }: VibeProviderProps) => {
    const [user, setUser] = useState<any>(null);

    return <VibeContext.Provider value={{ user, setUser }}>{children}</VibeContext.Provider>;
};

export const useVibe = (): VibeContextType => {
    const context = useContext(VibeContext);
    if (!context) {
        throw new Error("useVibe must be used within a VibeProvider");
    }
    return context;
};

export * from "./components/AuthWidget";
