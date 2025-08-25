"use client";

import React from "react";
import { cn } from "../../lib/utils";
import { useLayoutConfig } from "./LayoutContext";

export type TopBarProps = {
  children: React.ReactNode;
  className?: string;
  /**
   * When true, the bar is sticky relative to the viewport.
   * Defaults to true.
   */
  sticky?: boolean;
  /**
   * Optional override for top offset (in px).
   * If not provided, uses Layout variant's content topOffset,
   * but for dashboard we stick to 8px to be at the very top of content.
   */
  topOffset?: number;
  /**
   * Optional background class override for the bar surface.
   */
  backgroundClass?: string;
  /**
   * Optional border toggle. Defaults to true.
   */
  border?: boolean;
  paddingX?: string;
  paddingY?: string;
};

/**
 * A lightweight top bar that usually lives at the top of the main content area.
 * Commonly used in "dashboard" variant to host page title, filters, etc.
 */
export function TopBar({
  children,
  className,
  sticky = true,
  topOffset,
  backgroundClass,
  border = true,
}: TopBarProps) {
  const layout = useLayoutConfig();
  const isDashboard = layout.variant === "dashboard";
  const effTop = topOffset ?? (isDashboard ? 8 : layout.content.topOffset + 8);

  return (
    <div
      className={cn(
        "w-full z-10 px-4 md:px-6 py-2",
        sticky ? "sticky" : "",
        backgroundClass ?? (border ? "bg-background/80 backdrop-blur border-b border-border" : "bg-background/80 backdrop-blur"),
        className
      )}
      style={{ top: sticky ? effTop : undefined }}
    >
      {children}
    </div>
  );
}

TopBar.displayName = "TopBar";

export default TopBar;
