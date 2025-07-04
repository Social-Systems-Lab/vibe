"use client";

import React from "react";
import { useVibe } from "../index";

export const AuthWidget = () => {
    const { user, isLoggedIn, login, logout, signup } = useVibe();

    if (isLoggedIn) {
        return (
            <div>
                <p>DID: {user?.did}</p>
                <button onClick={logout}>Log Out</button>
            </div>
        );
    }

    return (
        <div>
            <button onClick={login}>Log In</button>
            <button onClick={signup}>Sign Up</button>
        </div>
    );
};
