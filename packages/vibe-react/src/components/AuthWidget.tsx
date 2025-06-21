"use client";

import React, { useState } from "react";

export const AuthWidget = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    if (isLoggedIn) {
        return (
            <div>
                <span>Welcome!</span>
                <button onClick={() => setIsLoggedIn(false)}>Logout</button>
            </div>
        );
    }

    return (
        <div>
            <button onClick={() => setIsLoggedIn(true)}>Login</button>
            <button>Sign Up</button>
        </div>
    );
};
