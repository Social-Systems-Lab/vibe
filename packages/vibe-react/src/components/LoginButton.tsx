"use client";

import React from "react";
import { useVibe } from "../index";

export const LoginButton = () => {
    const { login } = useVibe();

    return <button onClick={login}>Log in with Vibe</button>;
};
