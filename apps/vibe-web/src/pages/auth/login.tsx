"use client";

import { useEffect } from "react";

export default function LoginPage() {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const redirectUrl = `/oauth/authorize?${params.toString()}`;
        window.location.replace(redirectUrl);
    }, []);

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="text-center">
                <p className="text-lg font-semibold">Redirecting...</p>
                <p className="text-gray-500">Please wait while we redirect you to the login page.</p>
            </div>
        </div>
    );
}
