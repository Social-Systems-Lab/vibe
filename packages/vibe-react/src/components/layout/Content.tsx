"use client";

import React from "react";
import { cn } from "../../lib/utils";

export type ContentProps = {
    left?: React.ReactNode;
    right?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    leftWidth?: string;
    rightWidth?: string;
    gap?: string;
    stickyLeft?: boolean;
    stickyRight?: boolean;
    topOffset?: number;
    /**
     * Container behavior for the grid track wrapper.
     * - "fixed": center with maxWidth (default, previous behavior)
     * - "fluid": full-bleed (no centering, no maxWidth)
     */
    container?: "fixed" | "fluid";
    /**
     * Max width used when container="fixed"
     */
    maxWidth?: string;
};

export function Content({
    left,
    right,
    children,
    className,
    leftWidth = "260px",
    rightWidth = "320px",
    gap = "0px",
    stickyLeft = true,
    stickyRight = true,
    topOffset = 56,
    container = "fixed",
    maxWidth = "1200px",
}: ContentProps) {
    const fixed = container === "fixed";
    const wrapperClass = cn("w-full grid", fixed ? "mx-auto" : "");
    const wrapperStyle: React.CSSProperties = {
        gridTemplateColumns: `${left ? leftWidth : "0px"} minmax(0, 1fr) ${right ? rightWidth : "0px"}`,
        gap,
        paddingTop: topOffset,
        ...(fixed ? { maxWidth } : {}),
    };

    return (
        <div className={cn("w-full", className)}>
            <div className={wrapperClass} style={wrapperStyle}>
                {/* Left column */}
                {left ? (
                    <aside
                        className={cn("hidden md:block", stickyLeft ? "sticky self-start" : "")}
                        style={stickyLeft ? { top: topOffset + 8, height: `calc(100vh - ${topOffset}px)` } : undefined}
                    >
                        {left}
                    </aside>
                ) : (
                    <div />
                )}

                {/* Main content */}
                <main className="min-w-0">{children}</main>

                {/* Right column */}
                {right ? (
                    <aside
                        className={cn("hidden lg:block", stickyRight ? "sticky self-start" : "")}
                        style={stickyRight ? { top: topOffset + 8, height: `calc(100vh - ${topOffset + 16}px)` } : undefined}
                    >
                        {right}
                    </aside>
                ) : (
                    <div />
                )}
            </div>
        </div>
    );
}
