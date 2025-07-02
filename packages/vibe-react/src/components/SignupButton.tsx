"use client";

import React from "react";
import { useVibe } from "../index";

export const SignupButton = () => {
    const { signup } = useVibe();

    return <button onClick={signup}>Sign up with Vibe</button>;
};
