"use client";

import { LoginButton, ProfileMenu, SignupButton, useVibe } from "vibe-react";

export default function HomePage() {
    const { isAuthenticated } = useVibe();
    return (
        <div>
            <h1>Vibe Test App</h1>
            <p>This is a test application for the Vibe SDK and React components.</p>
            <hr />
            <ProfileMenu />
            {!isAuthenticated && (
                <>
                    <LoginButton />
                    <SignupButton />
                </>
            )}
        </div>
    );
}
