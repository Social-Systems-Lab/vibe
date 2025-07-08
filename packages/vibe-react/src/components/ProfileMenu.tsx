"use client";

import React from "react";
import { useVibe } from "../index";

export const ProfileMenu = () => {
    const { isLoggedIn, user, logout, manageConsent } = useVibe();

    if (!isLoggedIn) {
        return null;
    }

    return (
        <div>
            <span>Hello, {user?.did}</span>
            <button onClick={manageConsent}>App Settings</button>
            <button onClick={logout}>Log out</button>
        </div>
    );
};
