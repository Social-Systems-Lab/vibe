"use client";

import React from "react";
import { cn } from "../../lib/utils";
import { useLayoutConfig } from "./LayoutContext";

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
    const layout = useLayoutConfig();
    const base = visibilityClass(visibleFrom);
    const stickyCls = sticky ? "sticky self-start" : "";

    const effTopOffset = layout.variant !== "default" ? layout.content.topOffset : topOffset;
    const isDashboard = layout.variant === "dashboard";
    const style = sticky
        ? {
              top: isDashboard ? 8 : effTopOffset + 8,
              height: isDashboard ? "calc(100vh - 16px)" : `calc(100vh - ${effTopOffset + 16}px)`,
              marginTop: isDashboard ? -effTopOffset : undefined,
          }
        : undefined;

    return (
        <div className={cn(base, stickyCls, padded ? "pt-3 pl-6" : "", className)} style={style}>
            {children}
        </div>
    );
}
