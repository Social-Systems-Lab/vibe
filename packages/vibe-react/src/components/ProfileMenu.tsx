"use client";

import React, { useState, useRef, useEffect } from "react";
import { useVibe } from "../index";
import { Squircle } from "./ui/squircle";

export const ProfileMenu = () => {
    const { isLoggedIn, user, logout, manageConsent, manageProfile } = useVibe();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    if (!isLoggedIn || !user) {
        return null;
    }

    return (
        <div className="relative inline-block" ref={menuRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="bg-transparent border-none p-0 cursor-pointer block">
                <Squircle src={(user as any).pictureUrl} size={40}>
                    {user.displayName?.[0]}
                </Squircle>
            </button>
            {isOpen && (
                <div className="absolute top-12 right-0 bg-white rounded-lg shadow-lg w-64 z-[1000] border border-gray-200 overflow-hidden">
                    <div className="p-3 flex items-center">
                        <Squircle src={(user as any).pictureUrl} size={40} className="mr-3">
                            {user.displayName?.[0]}
                        </Squircle>
                        <span className="font-bold text-lg whitespace-nowrap">{user.displayName || ""}</span>
                    </div>
                    <hr className="border-t border-gray-200" />
                    <div className="p-1">
                        <button
                            onClick={() => {
                                manageConsent();
                                setIsOpen(false);
                            }}
                            className="w-full p-2.5 border-none bg-transparent cursor-pointer text-left text-base rounded-md hover:bg-gray-100"
                        >
                            App Settings
                        </button>
                        <button
                            onClick={() => {
                                manageProfile();
                                setIsOpen(false);
                            }}
                            className="w-full p-2.5 border-none bg-transparent cursor-pointer text-left text-base rounded-md hover:bg-gray-100"
                        >
                            Profile Settings
                        </button>
                        <button
                            onClick={() => {
                                logout();
                                setIsOpen(false);
                            }}
                            className="w-full p-2.5 border-none bg-transparent cursor-pointer text-left text-base rounded-md hover:bg-gray-100"
                        >
                            Log out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
