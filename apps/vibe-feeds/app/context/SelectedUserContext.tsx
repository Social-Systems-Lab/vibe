"use client";

import React, { createContext, useState, useContext, ReactNode } from "react";

// Define the shape of the user object
interface User {
    name: string;
    handle: string;
    avatar: string;
    coverImage: string;
    bio: string;
    location: string;
    joinedDate: string;
    website: string;
    followers: number;
    following: number;
    posts: number;
}

// Define the context type
interface SelectedUserContextType {
    selectedUser: User | null;
    setSelectedUser: (user: User | null) => void;
}

// Create the context
const SelectedUserContext = createContext<SelectedUserContextType | undefined>(undefined);

// Create the provider component
export const SelectedUserProvider = ({ children }: { children: ReactNode }) => {
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    return <SelectedUserContext.Provider value={{ selectedUser, setSelectedUser }}>{children}</SelectedUserContext.Provider>;
};

// Create a custom hook to use the context
export const useSelectedUser = () => {
    const context = useContext(SelectedUserContext);
    if (context === undefined) {
        throw new Error("useSelectedUser must be used within a SelectedUserProvider");
    }
    return context;
};
