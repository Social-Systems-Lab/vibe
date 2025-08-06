"use client";

import React from "react";
import { cn } from "../../lib/utils";
import { ProfileMenu } from "../../index";

export type HeaderProps = {
    left?: React.ReactNode;
    center?: React.ReactNode;
    right?: React.ReactNode;
    className?: string;
    sticky?: boolean;
    maxWidth?: string;
    height?: number;
    paddingX?: string;
    paddingY?: string;
    border?: boolean;
    /**
     * Optional logotype URL to render as the default left content.
     * Used when `left` is not provided.
     */
    logotypeSrc?: string;
    /**
     * Alt text for the default logotype
     */
    logotypeAlt?: string;
};

export function Header({
    left,
    center,
    right,
    className,
    sticky = true,
    maxWidth = "1200px",
    height = 56,
    paddingX = "16px",
    paddingY = "8px",
    border = false,
    logotypeSrc = "/images/logotype.png",
    logotypeAlt = "App",
}: HeaderProps) {
    const defaultLeft = (
        <div className="flex items-center space-x-2 px-3">
            <img src={logotypeSrc} alt={logotypeAlt} className="h-8" />
        </div>
    );

    const defaultRight = (
        <div className="flex items-center space-x-4 mr-2">
            <ProfileMenu />
        </div>
    );

    return (
        <header
            className={cn(
                "z-10 flex items-center justify-between w-full",
                sticky ? "fixed top-0 left-0 right-0" : "",
                border ? "border-b border-border bg-background/80 backdrop-blur" : "bg-background/80 backdrop-blur",
                className
            )}
            style={{
                height,
                padding: `${paddingY} ${paddingX}`,
            }}
        >
            <div className="w-full flex items-center justify-between pointer-events-none" style={{ maxWidth, margin: "0 auto" }}>
                <div className="pointer-events-auto flex items-center min-w-[120px]">{left ?? defaultLeft}</div>
                <div className="pointer-events-auto flex-1 flex items-center justify-center">{center ?? null}</div>
                <div className="pointer-events-auto flex items-center justify-end min-w-[120px] gap-2">{right ?? defaultRight}</div>
            </div>
        </header>
    );
}
