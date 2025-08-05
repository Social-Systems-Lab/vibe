"use client";

import React from "react";
import { cn } from "../../lib/utils";

export type LayoutProps = {
    children: React.ReactNode;
    className?: string;
    container?: "fluid" | "fixed";
    maxWidth?: string;
};

export function Layout({ children, className, container = "fluid", maxWidth = "none" }: LayoutProps) {
    const containerStyle = container === "fixed" ? { maxWidth, margin: "0 auto" as const } : undefined;

    return (
        <div className={cn("min-h-screen bg-background text-foreground", className)} style={containerStyle}>
            {children}
        </div>
    );
}
