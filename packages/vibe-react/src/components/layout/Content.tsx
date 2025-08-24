"use client";

import React from "react";
import { cn } from "../../lib/utils";
import { useLayoutConfig } from "./LayoutContext";

export type ContentProps = {
    leftTop?: React.ReactNode;
    left?: React.ReactNode;
    right?: React.ReactNode;
    topBar?: React.ReactNode;
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
    leftTop,
    left,
    right,
    topBar,
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
    const layout = useLayoutConfig();

    // Resolve effective settings from Layout variant when provided
    const effContainer = layout.variant !== "default" ? layout.content.container : container;
    const effTopOffset = layout.variant !== "default" ? layout.content.topOffset : topOffset;
    const effLeftWidth = layout.variant !== "default" ? layout.content.leftWidth : leftWidth;
    const effRightWidth = layout.variant !== "default" ? layout.content.rightWidth : rightWidth;

    const fixed = effContainer === "fixed";
    const isDashboard = layout.variant === "dashboard";
    const wrapperClass = cn("w-full grid", fixed ? "mx-auto" : "");
    const wrapperStyle: React.CSSProperties = {
        gridTemplateColumns: `${left ? effLeftWidth : "0px"} minmax(0, 1fr) ${right ? effRightWidth : "0px"}`,
        gap,
        // Use the effective topOffset always; in dashboard the Layout controls
        // row composition and passes topOffset=0 so we avoid extra scrollbar.
        paddingTop: effTopOffset,
        ...(fixed ? { maxWidth } : {}),
    };

    // For "dashboard" we want the left panel to extend to the very top
    // while the main content respects the header offset.
    const leftAsideTop = isDashboard ? 8 : effTopOffset + 8;
    const leftAsideHeight = isDashboard ? "calc(100vh - 16px)" : `calc(100vh - ${effTopOffset}px)`;
    const leftAsideStyle: React.CSSProperties | undefined = stickyLeft
        ? {
              gridColumn: "1 / 2",
              top: leftAsideTop,
              height: leftAsideHeight,
              marginTop: isDashboard ? -effTopOffset : undefined,
          }
        : { gridColumn: "1 / 2" };
    const mainStyle: React.CSSProperties = { gridColumn: "2 / 3" };
    const rightAsideStyle: React.CSSProperties | undefined = stickyRight
        ? { gridColumn: "3 / 4", top: effTopOffset + 8, height: `calc(100vh - ${effTopOffset + 16}px)` }
        : { gridColumn: "3 / 4" };

    return (
        <div className={cn("w-full", className)}>
            <div className={wrapperClass} style={wrapperStyle}>
                {/* Left column */}
                {left ? (
                    <aside
                        className={cn("hidden md:block", stickyLeft ? "sticky self-start" : "")}
                        style={{ ...leftAsideStyle }}
                    >
                        {isDashboard && leftTop ? <div className="mb-2">{leftTop}</div> : null}
                        {left}
                    </aside>
                ) : (
                    <div />
                )}

                {/* Main content */}
                <main className="min-w-0" style={mainStyle}>
                    {topBar ? <div className="mb-2">{topBar}</div> : null}
                    {children}
                </main>

                {/* Right column */}
                {right ? (
                    <aside
                        className={cn("hidden lg:block", stickyRight ? "sticky self-start" : "")}
                        style={rightAsideStyle}
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
Content.displayName = "Content";
