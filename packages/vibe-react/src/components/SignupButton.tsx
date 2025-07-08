"use client";

import React from "react";
import { useVibe } from "../index";

export const SignupButton = () => {
    const { signup } = useVibe();

    return (
        <button
            onClick={signup}
            style={{
                padding: "10px 20px",
                border: "none",
                borderRadius: "4px",
                backgroundColor: "#1a73e8",
                color: "white",
                cursor: "pointer",
                fontSize: "16px",
            }}
        >
            Sign up
        </button>
    );
};
