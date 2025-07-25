"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        if (window.opener) {
            window.opener.postMessage({ type: "vibe_auth_callback", url: window.location.href }, "*");
            window.close();
        } else {
            router.push("/");
        }
    }, [router]);

    return <div>Loading...</div>;
}
