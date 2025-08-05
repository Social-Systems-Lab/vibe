"use client";

import React from "react";
import { cn } from "../../lib/utils";

export type LeftPanelProps = {
    children: React.ReactNode;
    className?: string;
    padded?: boolean;
    visibleFrom?: "sm" | "md" | "lg";
    sticky?: boolean;
    topOffset?: number;
};

const visibilityClass = (bp: LeftPanelProps["visibleFrom"]) => {
    switch (bp) {
        case "sm":
            return "hidden sm:block";
        case "lg":
            return "hidden lg:block";
        case "md":
        default:
            return "hidden md:block";
    }
};

/**
 * Utility wrapper to provide consistent left navigation panel behavior.
 * Hidden on small screens by default, optionally sticky with top offset.
 */
export function LeftPanel({ children, className, padded = false, visibleFrom = "md", sticky = true, topOffset = 56 }: LeftPanelProps) {
    const base = visibilityClass(visibleFrom);
    const stickyCls = sticky ? "sticky self-start" : "";
    const style = sticky ? { top: topOffset + 8, height: `calc(100vh - ${topOffset + 16}px)` } : undefined;

    return (
        <div className={cn(base, stickyCls, padded ? "pt-3 pl-6" : "", className)} style={style}>
            {children}
        </div>
    );
}
