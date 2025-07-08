"use client";

import React from "react";
import { useVibe } from "../index";

export const OneTapChip = () => {
    const { user, login, appName, appImageUrl } = useVibe();

    if (!user) {
        return null;
    }

    return (
        <div
            style={{
                position: "fixed",
                top: "20px",
                right: "20px",
                backgroundColor: "white",
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                padding: "16px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                fontFamily: "sans-serif",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {appImageUrl && <img src={appImageUrl} alt={appName} style={{ width: "24px", height: "24px", borderRadius: "4px" }} />}
                <div style={{ fontWeight: "bold", fontSize: "16px" }}>Sign in to {appName || "your app"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Placeholder for user avatar */}
                <div
                    style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        backgroundColor: "#f0f0f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                    }}
                >
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.did.slice(8, 10).toUpperCase()}
                </div>
                <div>
                    <div style={{ fontWeight: "bold" }}>{user.displayName || user.did}</div>
                    <div style={{ color: "#666", fontSize: "14px" }}>Vibe User</div>
                </div>
            </div>
            <button
                onClick={login}
                style={{
                    width: "100%",
                    padding: "10px",
                    border: "none",
                    borderRadius: "4px",
                    backgroundColor: "#1a73e8",
                    color: "white",
                    fontSize: "16px",
                    cursor: "pointer",
                }}
            >
                Continue as {user.displayName || user.did.slice(8, 14)}
            </button>
        </div>
    );
};
