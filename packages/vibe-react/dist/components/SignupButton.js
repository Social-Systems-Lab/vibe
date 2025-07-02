"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { useVibe } from "../index";
export const SignupButton = () => {
    const { signup } = useVibe();
    return _jsx("button", { onClick: signup, children: "Sign up with Vibe" });
};
