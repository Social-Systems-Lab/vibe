"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createSdk } from "vibe-sdk";
import { appManifest } from "../../lib/manifest";

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const handleAuth = async () => {
            if (window.opener) {
                window.opener.postMessage({ type: "vibe_auth_callback", url: window.location.href }, "*");
                window.close();
            } else {
                const sdk = createSdk(appManifest);
                await sdk.handleRedirectCallback(window.location.href);
                router.push("/");
            }
        };
        handleAuth();
    }, [router]);

    return <div></div>;
}
