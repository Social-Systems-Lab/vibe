"use client";

import React from "react";
import { useVibe } from "../index";

export const ProfileMenu = () => {
    const { isAuthenticated, user, logout } = useVibe();

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div>
            <span>Hello, {user?.name}</span>
            <button onClick={logout}>Log out</button>
        </div>
    );
};
