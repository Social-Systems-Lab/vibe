"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createSdk } from "vibe-sdk";

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const handleAuth = async () => {
            if (window.opener) {
                window.opener.postMessage({ type: "vibe_auth_callback", url: window.location.href }, "*");
                window.close();
            } else {
                const sdk = createSdk({
                    apiUrl: process.env.NEXT_PUBLIC_VIBE_API_URL!,
                    clientId: process.env.NEXT_PUBLIC_VIBE_CLIENT_ID!,
                    redirectUri: process.env.NEXT_PUBLIC_VIBE_REDIRECT_URI!,
                });
                await sdk.handleRedirectCallback(window.location.href);
                router.push("/");
            }
        };
        handleAuth();
    }, [router]);

    return <div>Loading...</div>;
}
