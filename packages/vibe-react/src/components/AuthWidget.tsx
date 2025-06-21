"use client";

import React, { useState, useEffect } from "react";
import { createSdk } from "vibe-sdk";

export const AuthWidget = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [user, setUser] = useState<any>(null);

    const apiUrl = "http://127.0.0.1:5000"; // Replace with your API URL
    const sdk = createSdk(apiUrl);

    useEffect(() => {
        const checkAuth = async () => {
            const authenticated = sdk.isAuthenticated();
            setIsLoggedIn(authenticated);

            if (authenticated) {
                const userData = sdk.getUser();
                setUser(userData);
            }
        };

        checkAuth();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        setIsLoggedIn(false);
        setUser(null);
    };

    if (isLoggedIn) {
        return (
            <div>
                <span>Welcome, {user ? user.email : "User"}!</span>
                <button onClick={handleLogout}>Logout</button>
            </div>
        );
    }

    return (
        <div>
            <button
                onClick={() => {
                    // Redirect to login page
                    window.location.href = "/login";
                }}
            >
                Login
            </button>
            <button
                onClick={() => {
                    // Redirect to signup page
                    window.location.href = "/signup";
                }}
            >
                Sign Up
            </button>
        </div>
    );
};
