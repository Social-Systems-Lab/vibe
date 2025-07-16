"use client";

import React, { useState, useRef, useEffect } from "react";
import { useVibe } from "../index";

export const ProfileMenu = () => {
    const { isLoggedIn, user, logout, manageConsent, manageProfile } = useVibe();
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
            <button onClick={() => setIsOpen(!isOpen)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <img
                    src={(user as any).pictureUrl || `https://avatar.iran.liara.run/username?username=${user.displayName}`}
                    alt="Profile"
                    style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        objectFit: "cover",
                    }}
                />
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
                        <img
                            src={(user as any).pictureUrl || `https://source.boringavatars.com/beam/32/${user.did}?colors=264653,2a9d8f,e9c46a,f4a261,e76f51`}
                            alt="Profile"
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                marginRight: "12px",
                                objectFit: "cover",
                            }}
                        />
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
                            manageProfile();
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
                        Profile Settings
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
