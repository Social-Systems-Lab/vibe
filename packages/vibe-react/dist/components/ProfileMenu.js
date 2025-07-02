"use client";
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useVibe } from "../index";
export const ProfileMenu = () => {
    const { isAuthenticated, user, logout } = useVibe();
    if (!isAuthenticated) {
        return null;
    }
    return (_jsxs("div", { children: [_jsxs("span", { children: ["Hello, ", user?.name] }), _jsx("button", { onClick: logout, children: "Log out" })] }));
};
