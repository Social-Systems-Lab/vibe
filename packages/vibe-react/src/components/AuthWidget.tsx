"use client";

import React from "react";
import { useVibe } from "../index";

export const AuthWidget = () => {
    const { user, isLoggedIn, login, logout, signup } = useVibe();

    if (isLoggedIn && user) {
        return (
            <div>
                <p>User: {JSON.stringify(user)}</p>
                <button onClick={logout}>Log Out</button>
            </div>
        );
    }

    // New: One-tap login UI
    if (!isLoggedIn && user) {
        return (
            <div>
                <button onClick={login}>Continue as {user.did}</button>
            </div>
        );
    }

    return (
        <div>
            <button onClick={login}>Log in</button>
            <button onClick={signup}>Sign up</button>
        </div>
    );
};
