"use client";

import React from "react";
import { cn } from "../../lib/utils";
import { ProfileMenu } from "../../index";
import { AppGridMenu } from "../AppGridMenu";

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
    /**
     * Href to navigate when clicking the default logotype.
     * Defaults to "/" to return to the main page.
     */
    logotypeHref?: string;
    /**
     * Layout variant for header container behavior.
     * - "default": content centered with maxWidth
     * - "console": full-bleed (no centering / maxWidth)
     */
    variant?: "default" | "console";
    /**
     * Optional override for header background styling.
     * If provided, replaces the default bg/backdrop classes.
     */
    backgroundClass?: string;
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
    logotypeHref = "/",
    variant = "default",
    backgroundClass,
}: HeaderProps) {
    const defaultLeft = (
        <div className="flex items-center space-x-2 px-3">
            <a href={logotypeHref} aria-label="Home">
                <img src={logotypeSrc} alt={logotypeAlt} className="h-8" />
            </a>
        </div>
    );

    const defaultRight = (
        <div className="flex items-center space-x-4 mr-2">
            <AppGridMenu />
            <ProfileMenu />
        </div>
    );

    return (
        <header
            className={cn(
                "z-10 flex items-center justify-between w-full",
                sticky ? "fixed top-0 left-0 right-0" : "",
                backgroundClass ?? (border ? "border-b border-border bg-background/80 backdrop-blur" : "bg-background/80 backdrop-blur"),
                className
            )}
            style={{
                height,
                padding: `${paddingY} ${paddingX}`,
            }}
        >
            <div
                className="w-full flex items-center justify-between pointer-events-none"
                style={{ maxWidth: variant === "default" ? maxWidth : "none", margin: variant === "default" ? "0 auto" : "0" }}
            >
                <div className="pointer-events-auto flex items-center min-w-[120px]">{left ?? defaultLeft}</div>
                <div className="pointer-events-auto flex-1 flex items-center justify-center">{center ?? null}</div>
                <div className="pointer-events-auto flex items-center justify-end min-w-[120px] gap-2">{right ?? defaultRight}</div>
            </div>
        </header>
    );
}
