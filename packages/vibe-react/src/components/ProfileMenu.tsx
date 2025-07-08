"use client";

import React, { useState, useRef, useEffect } from "react";
import { useVibe } from "../index";

export const ProfileMenu = () => {
    const { isLoggedIn, user, logout, manageConsent } = useVibe();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    if (!isLoggedIn || !user) {
        return null;
    }

    return (
        <div style={{ position: "relative", display: "inline-block" }} ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    backgroundColor: "#f0f0f0",
                    border: "1px solid #ccc",
                    borderRadius: "50%",
                    width: "40px",
                    height: "40px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: "#333",
                    flexShrink: 0,
                }}
            >
                {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.did.slice(8, 10).toUpperCase()}
            </button>
            {isOpen && (
                <div
                    style={{
                        position: "absolute",
                        top: "50px",
                        right: "0",
                        backgroundColor: "white",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        padding: "8px",
                        width: "250px",
                        zIndex: 1001,
                        border: "1px solid #e0e0e0",
                    }}
                >
                    <div style={{ padding: "8px 12px", display: "flex", alignItems: "center" }}>
                        <div
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                backgroundColor: "#f0f0f0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: "bold",
                                marginRight: "12px",
                                flexShrink: 0,
                            }}
                        >
                            {user.displayName ? user.displayName.charAt(0).toUpperCase() : "U"}
                        </div>
                        <span style={{ fontWeight: "bold" }}>{user.displayName || ""}</span>
                    </div>
                    <hr style={{ margin: "8px 0", border: "none", borderTop: "1px solid #e0e0e0" }} />
                    <button
                        onClick={() => {
                            manageConsent();
                            setIsOpen(false);
                        }}
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            border: "none",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: "16px",
                        }}
                    >
                        App Settings
                    </button>
                    <button
                        onClick={() => {
                            logout();
                            setIsOpen(false);
                        }}
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            border: "none",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: "16px",
                        }}
                    >
                        Log out
                    </button>
                </div>
            )}
        </div>
    );
};
