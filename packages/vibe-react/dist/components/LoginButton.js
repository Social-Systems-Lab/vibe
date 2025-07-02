"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { useVibe } from "../index";
export const LoginButton = () => {
    const { login } = useVibe();
    return _jsx("button", { onClick: login, children: "Log in with Vibe" });
};
