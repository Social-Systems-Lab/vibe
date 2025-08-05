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
};

export function Content({ left, right, children, className, leftWidth = "260px", rightWidth = "320px", gap = "24px", stickyLeft = true, stickyRight = true, topOffset = 56 }: ContentProps) {
    return (
        <div className={cn("w-full", className)}>
            <div
                className="mx-auto w-full grid"
                style={{
                    gridTemplateColumns: `${left ? leftWidth : "0px"} minmax(0, 1fr) ${right ? rightWidth : "0px"}`,
                    gap,
                    maxWidth: "1200px",
                    paddingTop: topOffset + 16,
                }}
            >
                {/* Left column */}
                {left ? (
                    <aside
                        className={cn("hidden md:block", stickyLeft ? "sticky self-start" : "")}
                        style={stickyLeft ? { top: topOffset + 8, height: `calc(100vh - ${topOffset + 16}px)` } : undefined}
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
