"use client";

import React from "react";
import { useVibe } from "../index";
import { OneTapChip } from "./OneTapChip";
import { ProfileMenu } from "./ProfileMenu";
import { LoginButton } from "./LoginButton";
import { SignupButton } from "./SignupButton";

export const AuthWidget = () => {
    const { user, isLoggedIn } = useVibe();

    if (isLoggedIn) {
        return <ProfileMenu />;
    }

    if (user) {
        return <OneTapChip />;
    }

    return (
        <div style={{ display: "flex", gap: "10px" }}>
            <LoginButton />
            <SignupButton />
        </div>
    );
};
