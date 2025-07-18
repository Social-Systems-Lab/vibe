"use client";

import { Button, Input } from "vibe-react";
import { Bell } from "lucide-react";
import { AuthWidget } from "vibe-react";

export function Header() {
    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between p-0 p-2">
                {/* border-b-[2px] border-[#f3f3f3]  */}
                <div className="flex items-center space-x-4 ml-6">
                    <div className="flex items-center space-x-2">
                        <img src="/images/logo3.png" alt="Vibe" className="h-8 w-8" />
                        <span className="font-semibold text-lg">Feeds</span>
                    </div>
                </div>
                <div className="flex items-center space-x-4 mr-6">
                    <AuthWidget />
                </div>
            </header>
        </>
    );
}
