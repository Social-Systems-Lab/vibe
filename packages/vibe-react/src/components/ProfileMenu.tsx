"use client";

import React from "react";
import { useVibe } from "../index";

export const ProfileMenu = () => {
    const { isLoggedIn, user, logout } = useVibe();

    if (!isLoggedIn) {
        return null;
    }

    return (
        <div>
            <span>Hello, {user?.name}</span>
            <button onClick={logout}>Log out</button>
        </div>
    );
};
