"use client";

import { Button, Input } from "vibe-react";
import { Bell } from "lucide-react";
import { AuthWidget } from "vibe-react";

export function Header() {
    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between p-0 bg-background border-b border-border p-2">
                <div className="flex items-center space-x-4 ml-6">
                    <div className="flex items-center space-x-2">
                        <img src="/images/logo2.png" alt="Vibe" className="h-8 w-8" />
                        <span className="font-semibold text-lg">Feed</span>
                    </div>
                </div>
                <div className="flex items-center space-x-4 mr-6">
                    <AuthWidget />
                </div>
            </header>
            <div className="h-[79px]"></div>
        </>
    );
}
