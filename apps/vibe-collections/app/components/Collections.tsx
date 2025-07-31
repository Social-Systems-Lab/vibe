"use client";

import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";

export function Collections() {
    const { read, readOnce, isLoggedIn, user } = useVibe();

    useEffect(() => {
        if (!isLoggedIn || !user) return;
    }, [isLoggedIn, user, read]);

    if (!isLoggedIn) {
        return <p>Please log in to see the feed.</p>;
    }

    return (
        <div className="max-w-[680px] mx-auto">
            <div className="mb-2 mr-[80px] lg:mr-0">Collections</div>
        </div>
    );
}
