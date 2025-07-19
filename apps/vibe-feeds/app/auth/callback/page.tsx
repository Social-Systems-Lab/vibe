"use client";

import { useVibe } from "vibe-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthCallbackPage() {
    const { isLoggedIn } = useVibe();
    const router = useRouter();

    useEffect(() => {
        if (isLoggedIn) {
            router.push("/");
        }
    }, [isLoggedIn, router]);

    return <div>Loading...</div>;
}
