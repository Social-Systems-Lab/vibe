"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createSdk } from "vibe-sdk";
import { appManifest } from "../../lib/manifest";

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const handleAuth = async () => {
            const sdk = createSdk(appManifest);
            await sdk.handleRedirectCallback(window.location.href);
            window.location.replace("/console");
        };
        handleAuth();
    }, [router]);

    return <div></div>;
}
