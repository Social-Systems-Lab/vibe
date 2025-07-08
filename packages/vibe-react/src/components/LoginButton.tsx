"use client";

import React from "react";
import { useVibe } from "../index";

export const LoginButton = () => {
    const { login } = useVibe();

    return (
        <button
            onClick={login}
            style={{
                padding: "10px 20px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "#fff",
                cursor: "pointer",
                fontSize: "16px",
            }}
        >
            Log in
        </button>
    );
};
