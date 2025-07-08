"use client";

import React from "react";
import { useVibe } from "../index";
import { OneTapChip } from "./OneTapChip";
import { ProfileMenu } from "./ProfileMenu";

export const AuthWidget = () => {
    const { user, isLoggedIn, login, signup } = useVibe();

    if (isLoggedIn) {
        return <ProfileMenu />;
    }

    if (user) {
        return <OneTapChip />;
    }

    return (
        <div>
            <button onClick={login}>Log in</button>
            <button onClick={signup}>Sign up</button>
        </div>
    );
};
